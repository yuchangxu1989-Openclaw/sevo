/**
 * L1 LLM Scanner — FR-29 semantic coverage analysis.
 *
 * Instead of matching filenames to FR IDs (which fails when code doesn't follow
 * `fr-xx` naming), this scanner uses LLM to semantically map each FR to source files
 * by analyzing code content against FR descriptions.
 *
 * Falls back to ScanMappingGenerator if no pre-generated sevo.scan.json exists.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

import type { CommandCheckResult, L1FrCoverageEntry, L1ScanInput, L1ScanReport, ScanCommand } from './types.js';
import { ScanMappingGenerator, ScanMappingLoader } from './scan-mapping.js';
import type { ScanMappingConfig } from './scan-mapping.js';
import { listSourceFiles, parseSpecMarkdown, readFileExcerpt, relativeTo, truncateText, writeJson } from './utils.js';
import type { LLMProviderConfig } from '../llm/index.js';
import { LLMProvider } from '../llm/index.js';

export interface L1LlmScanInput extends L1ScanInput {
  /** LLM config for semantic mapping. Uses env vars if not provided. */
  llm?: LLMProviderConfig;
  /** If true, regenerate sevo.scan.json even if it exists. */
  regenerateMap?: boolean;
}

export class L1LlmScanner {
  private readonly scanMappingLoader = new ScanMappingLoader();
  private readonly scanMappingGenerator = new ScanMappingGenerator();

  async scan(input: L1LlmScanInput): Promise<L1ScanReport> {
    const projectRoot = this.inferProjectRoot(input.specPath, input.sourceDir);
    const sourceFiles = listSourceFiles(input.sourceDir);
    const frs = parseSpecMarkdown(input.specPath);
    const compile = this.runCommand(input.compileCommand, projectRoot, 'npx tsc --noEmit');
    const tests = this.runCommand(input.testCommand, projectRoot, 'npm test -- --run');

    // Get or generate LLM-based FR→file mapping
    const frFileMap = await this.getOrGenerateMapping(projectRoot, input);

    const entries: L1FrCoverageEntry[] = frs.map((fr) => {
      const mappedFiles = frFileMap[fr.frId] ?? frFileMap[fr.frId.toLowerCase()] ?? [];
      // Resolve mapped files against source directory
      const files = this.resolveFiles(mappedFiles, input.sourceDir, sourceFiles, projectRoot);
      const covered = files.length > 0;
      return {
        frId: fr.frId,
        status: covered ? 'covered' : 'uncovered',
        compilePassed: compile.passed,
        testsPassed: tests.passed,
        evidence: { files },
        reason: covered ? undefined : this.reason(files, compile, tests),
      };
    });

    const report: L1ScanReport = {
      level: 'l1',
      pass: entries.every((e) => e.status === 'covered') && compile.passed && tests.passed,
      timestamp: new Date().toISOString(),
      entries,
      compile,
      tests,
    };

    if (input.writeReport !== false && input.outputPath) {
      writeJson(input.outputPath, report);
    }

    return report;
  }

  private async getOrGenerateMapping(
    projectRoot: string,
    input: L1LlmScanInput,
  ): Promise<Record<string, string[]>> {
    const scanJsonPath = path.join(projectRoot, 'sevo.scan.json');

    // Try loading existing mapping first (unless regenerate requested)
    if (!input.regenerateMap && fs.existsSync(scanJsonPath)) {
      const loaded = this.scanMappingLoader.load(projectRoot);
      if (Object.keys(loaded).length > 0) return loaded;
    }

    // Generate mapping via LLM
    const llmProvider = new LLMProvider(input.llm);
    const adapter = {
      callLlm: (messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>) =>
        llmProvider.chat(messages),
    };

    const codeMap = this.scanMappingGenerator.generateCodeMap(projectRoot, ['src']);
    const config: ScanMappingConfig = await this.scanMappingGenerator.generate({
      specPath: input.specPath,
      codeMap,
      adapter: adapter as never,
    });

    // Write the generated mapping for future use
    this.scanMappingGenerator.write(projectRoot, config);

    // Convert to simple map
    return Object.fromEntries(
      Object.entries(config.frFileMap).map(([frId, entry]) => [frId, [...entry.files]]),
    );
  }

  private resolveFiles(
    mappedFiles: string[],
    sourceDir: string,
    sourceFiles: string[],
    projectRoot: string,
  ): string[] {
    const sourceRoot = path.resolve(sourceDir);
    const resolved: string[] = [];

    for (const file of mappedFiles) {
      // Try resolving from project root
      const fromProject = path.resolve(projectRoot, file);
      if (sourceFiles.includes(fromProject)) {
        resolved.push(relativeTo(sourceRoot, fromProject));
        continue;
      }
      // Try resolving from source root
      const fromSource = path.resolve(sourceRoot, file);
      if (sourceFiles.includes(fromSource)) {
        resolved.push(relativeTo(sourceRoot, fromSource));
        continue;
      }
      // Try partial match (file might be relative without src/ prefix)
      const match = sourceFiles.find((sf) => sf.endsWith(`/${file}`) || sf.endsWith(`\\${file}`));
      if (match) {
        resolved.push(relativeTo(sourceRoot, match));
      }
    }

    return Array.from(new Set(resolved));
  }

  private inferProjectRoot(specPath: string, sourceDir: string): string {
    const specDir = path.resolve(path.dirname(specPath));
    const sourceRoot = path.resolve(sourceDir);
    const specParts = specDir.split(path.sep).filter(Boolean);
    const sourceParts = sourceRoot.split(path.sep).filter(Boolean);
    const common: string[] = [];

    for (let i = 0; i < Math.min(specParts.length, sourceParts.length); i += 1) {
      if (specParts[i] !== sourceParts[i]) break;
      common.push(specParts[i] as string);
    }

    if (common.length === 0) return path.parse(sourceRoot).root;
    return `${path.parse(sourceRoot).root}${common.join(path.sep)}`;
  }

  private runCommand(command: ScanCommand | undefined, defaultCwd: string, fallback: string): CommandCheckResult {
    const commandLine = command?.command ?? fallback;
    const result = spawnSync(commandLine, {
      cwd: command?.cwd ?? defaultCwd,
      shell: true,
      encoding: 'utf8',
      timeout: command?.timeoutMs ?? 10 * 60 * 1000,
    });

    const exitCode = typeof result.status === 'number' ? result.status : null;
    const output = truncateText(`${result.stdout ?? ''}${result.stderr ?? ''}`, 2000);

    return {
      command: commandLine,
      passed: exitCode === 0 && !result.error,
      exitCode,
      output: result.error ? `${output}\n${result.error.message}`.trim() : output,
    };
  }

  private reason(files: string[], compile: CommandCheckResult, tests: CommandCheckResult): string {
    const reasons: string[] = [];
    if (files.length === 0) reasons.push('no implementation files found by LLM semantic analysis');
    if (!compile.passed) reasons.push('compile command failed');
    if (!tests.passed) reasons.push('test command failed');
    return reasons.join('; ');
  }
}
