import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { pathToFileURL } from 'node:url';

import { LLMProvider } from '../llm/index.js';
import { defaultRuntimeChecksForType } from './default-runtime-checks.js';
import type { L3ACVerificationEntry, L3RuntimeEntry, L3RuntimeVerifierInput, L2ACCoverageEntry, ParsedAcceptanceCriterion, RuntimeDomainCheck } from './types.js';
import { safeJsonParse, truncateText, writeJson } from './utils.js';

interface MeaningJudgment {
  meaningful?: boolean;
  judgment?: string;
}

export class L3RuntimeVerifier {
  async verify(input: L3RuntimeVerifierInput) {
    const llm = input.llmClient ?? new LLMProvider(input.llm);
    const checks = input.checks.length > 0
      ? input.checks
      : defaultRuntimeChecksForType(input.projectRoot, input.projectType);
    const entries: L3RuntimeEntry[] = [];

    for (const check of checks) {
      const raw = await this.executeCheck(input.projectRoot, input.projectType, check);
      const expectedExit = check.expectedExitCode ?? 0;
      const actualExit = raw.evidence.exitCode ?? null;

      // AC-29F.3: exit code mismatch → direct dead, skip LLM
      if (actualExit !== null && actualExit !== expectedExit) {
        entries.push({
          domain: check.domain,
          status: 'dead',
          verifyCommand: raw.command,
          actualOutput: truncateText(raw.output, 1024),
          judgment: `Exit code ${actualExit} !== expected ${expectedExit}`,
          expectedExitCode: expectedExit,
          actualExitCode: actualExit,
          evidence: raw.evidence,
        });
        continue;
      }

      const validatorJudgment = this.validateOutput(check, raw.output);
      if (!validatorJudgment.valid) {
        entries.push({
          domain: check.domain,
          status: 'dead',
          verifyCommand: raw.command,
          actualOutput: truncateText(raw.output, 1024),
          judgment: validatorJudgment.judgment,
          expectedExitCode: expectedExit,
          actualExitCode: actualExit,
          evidence: raw.evidence,
        });
        continue;
      }

      const judgment = await this.judge(llm, raw.output);
      const alive = raw.transportOk && judgment.meaningful === true;
      entries.push({
        domain: check.domain,
        status: alive ? 'alive' : 'dead',
        verifyCommand: raw.command,
        actualOutput: truncateText(raw.output, 1024),
        judgment: judgment.judgment ?? (alive ? 'Output is meaningful.' : 'Output is empty or not meaningful.'),
        expectedExitCode: expectedExit,
        actualExitCode: actualExit,
        evidence: raw.evidence,
      });
    }

    // Spec-Code AC verification when specPath is provided
    let acVerification: L3ACVerificationEntry[] | undefined;
    if (input.specPath) {
      acVerification = await this.verifyACs(input, llm, entries);
    }

    const report = {
      level: 'l3' as const,
      pass: entries.length > 0 && entries.every((entry) => entry.status === 'alive'),
      timestamp: new Date().toISOString(),
      entries,
      ...(acVerification ? { acVerification } : {}),
    };

    if (input.writeReport !== false && input.outputPath) writeJson(input.outputPath, report);
    return report;
  }

  /**
   * Parse ACs from spec, locate implementation files via L2 results,
   * and use LLM to judge whether runtime output satisfies each AC.
   */
  private async verifyACs(
    input: L3RuntimeVerifierInput,
    llm: { chat(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<string> },
    runtimeEntries: L3RuntimeEntry[],
  ): Promise<L3ACVerificationEntry[]> {
    const acs = this.parseSpecACs(input.specPath!);
    if (acs.length === 0) return [];

    const runtimeOutput = runtimeEntries.map(e => `[${e.domain}] ${e.actualOutput}`).join('\n');
    const results: L3ACVerificationEntry[] = [];

    for (const ac of acs) {
      const implFile = this.findImplementationFile(ac, input.l2Results);
      const judgment = await this.judgeAC(llm, ac, runtimeOutput, implFile, input.projectRoot);
      results.push({
        frId: ac.frId,
        acId: ac.acId,
        acText: ac.text,
        implementationFile: implFile,
        satisfied: judgment.satisfied,
        rationale: judgment.rationale,
      });
    }

    return results;
  }

  /** Parse acceptance criteria from a spec markdown file. */
  private parseSpecACs(specPath: string): ParsedAcceptanceCriterion[] {
    if (!fs.existsSync(specPath)) return [];
    const content = fs.readFileSync(specPath, 'utf8');
    const acs: ParsedAcceptanceCriterion[] = [];

    let currentFrId = '';
    const lines = content.split('\n');
    for (const line of lines) {
      // Match FR headers like "### FR-01" or "## FR-01:"
      const frMatch = /^#{2,4}\s+(FR-\d+)/i.exec(line);
      if (frMatch) {
        currentFrId = frMatch[1]!;
        continue;
      }
      // Match AC lines like "- AC-01.1: ..." or "- **AC-01.1**: ..."
      const acMatch = /^\s*[-*]\s+\*{0,2}(AC-[\d.]+)\*{0,2}[:\s]+(.+)/.exec(line);
      if (acMatch && currentFrId) {
        acs.push({ frId: currentFrId, acId: acMatch[1]!, text: acMatch[2]!.trim() });
      }
    }

    return acs;
  }

  /** Find implementation file for an AC using L2 triage results. */
  private findImplementationFile(
    ac: ParsedAcceptanceCriterion,
    l2Results?: L2ACCoverageEntry[],
  ): string | null {
    if (!l2Results) return null;
    const match = l2Results.find(e => e.frId === ac.frId && e.acId === ac.acId);
    return match?.evidence?.file ?? null;
  }

  /** Use LLM to judge whether runtime output satisfies an AC. */
  private async judgeAC(
    llm: { chat(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<string> },
    ac: ParsedAcceptanceCriterion,
    runtimeOutput: string,
    implFile: string | null,
    projectRoot: string,
  ): Promise<{ satisfied: boolean; rationale: string }> {
    let implContext = '';
    if (implFile) {
      const fullPath = path.resolve(projectRoot, implFile);
      if (fs.existsSync(fullPath)) {
        const code = fs.readFileSync(fullPath, 'utf8');
        implContext = `\n\nImplementation file (${implFile}):\n${truncateText(code, 3000)}`;
      }
    }

    const response = await llm.chat([
      {
        role: 'system',
        content: 'You are verifying whether a runtime output satisfies an acceptance criterion. '
          + 'Return JSON {"satisfied":boolean,"rationale":"short reason"}. '
          + 'Judge semantically: does the runtime behavior demonstrate the AC is met?',
      },
      {
        role: 'user',
        content: `AC: ${ac.acId} — ${ac.text}\n\nRuntime output:\n${truncateText(runtimeOutput, 3000)}${implContext}`,
      },
    ]);

    return safeJsonParse<{ satisfied: boolean; rationale: string }>(response, {
      satisfied: false,
      rationale: response.trim(),
    });
  }

  private async executeCheck(
    projectRoot: string,
    defaultType: L3RuntimeVerifierInput['projectType'],
    check: RuntimeDomainCheck,
  ): Promise<{ command: string; output: string; transportOk: boolean; evidence: L3RuntimeEntry['evidence'] }> {
    const type = check.type ?? defaultType;
    if (type === 'web') return this.executeWeb(check);
    if (type === 'library') return this.executeLibrary(projectRoot, check);
    if (type === 'hook' || type === 'plugin') return this.executeHook(projectRoot, check);
    return this.executeCli(projectRoot, check);
  }

  private executeCli(projectRoot: string, check: RuntimeDomainCheck) {
    const command = check.command ?? 'npm --version';
    const result = spawnSync(command, {
      cwd: check.cwd ?? projectRoot,
      shell: true,
      encoding: 'utf8',
      timeout: check.timeoutMs ?? 5 * 60 * 1000,
    });
    const exitCode = typeof result.status === 'number' ? result.status : null;
    return {
      command,
      output: `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? `\n${result.error.message}` : ''}`.trim(),
      transportOk: exitCode === 0 && !result.error,
      evidence: { exitCode },
    };
  }

  private async executeWeb(check: RuntimeDomainCheck) {
    const url = check.url ?? 'http://127.0.0.1/';
    try {
      const response = await fetch(url);
      const body = await response.text();
      return {
        command: `GET ${url}`,
        output: body,
        transportOk: response.ok,
        evidence: { httpStatus: response.status },
      };
    } catch (err) {
      return {
        command: `GET ${url}`,
        output: (err as Error).message,
        transportOk: false,
        evidence: { httpStatus: 0 },
      };
    }
  }

  private async executeLibrary(projectRoot: string, check: RuntimeDomainCheck) {
    const modulePath = check.modulePath ? path.resolve(projectRoot, check.modulePath) : projectRoot;
    const importUrl = JSON.stringify(pathToFileURL(modulePath).href);
    const exportName = JSON.stringify(check.exportName ?? 'default');
    const args = JSON.stringify(check.args ?? []);
    const command = `node -e ${JSON.stringify(`import(${importUrl}).then(async m=>{const v=m[${exportName}]; const r=typeof v==='function'?await v(...${args}):v; console.log(JSON.stringify(r));}).catch(e=>{console.error(e.message); process.exit(1);})`)}`;
    const result = spawnSync(command, {
      cwd: projectRoot,
      shell: true,
      encoding: 'utf8',
      timeout: check.timeoutMs ?? 5 * 60 * 1000,
    });
    const exitCode = typeof result.status === 'number' ? result.status : null;
    return {
      command: `import ${check.modulePath ?? projectRoot}${check.exportName ? `#${check.exportName}` : ''}`,
      output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
      transportOk: exitCode === 0 && !result.error,
      evidence: { exitCode },
    };
  }

  private async executeHook(projectRoot: string, check: RuntimeDomainCheck) {
    const result = await this.executeLibrary(projectRoot, check);
    const sideEffect = check.expectedSideEffectPath
      ? path.resolve(projectRoot, check.expectedSideEffectPath)
      : undefined;
    const sideEffectExists = sideEffect ? fs.existsSync(sideEffect) : result.transportOk;
    return {
      ...result,
      transportOk: result.transportOk && sideEffectExists,
      evidence: { ...result.evidence, sideEffect: sideEffect ? (sideEffectExists ? sideEffect : `missing:${sideEffect}`) : undefined },
    };
  }

  private validateOutput(check: RuntimeDomainCheck, output: string): { valid: boolean; judgment: string } {
    if (!check.outputValidator) return { valid: true, judgment: 'No output validator configured.' };
    try {
      if (check.outputValidator instanceof RegExp) {
        return check.outputValidator.test(output)
          ? { valid: true, judgment: 'Output validator matched.' }
          : { valid: false, judgment: `Output validator ${check.outputValidator.toString()} did not match.` };
      }
      if (typeof check.outputValidator === 'string') {
        return output.includes(check.outputValidator)
          ? { valid: true, judgment: 'Output validator matched.' }
          : { valid: false, judgment: `Output does not include expected text: ${check.outputValidator}` };
      }
      const passed = check.outputValidator(output);
      return passed
        ? { valid: true, judgment: 'Output validator passed.' }
        : { valid: false, judgment: 'Output validator returned false.' };
    } catch (err) {
      return { valid: false, judgment: `Output validator threw: ${(err as Error).message}` };
    }
  }

  private async judge(
    llm: { chat(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<string> },
    output: string,
  ): Promise<MeaningJudgment> {
    if (!output.trim()) return { meaningful: false, judgment: 'Output is empty.' };

    const response = await llm.chat([
      { role: 'system', content: 'Judge whether runtime output is meaningful product output. Return JSON {"meaningful":boolean,"judgment":"short reason"}. Empty, placeholder, help-only, default template, and error output are not meaningful.' },
      { role: 'user', content: truncateText(output, 4000) },
    ]);
    return safeJsonParse<MeaningJudgment>(response, { meaningful: false, judgment: response.trim() });
  }
}
