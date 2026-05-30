import { execFileSync as nodeExecFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ArtifactRef, StageId } from '../types/index.js';
import type { Stage } from './spec-types.js';
import type {
  CleanInstallCheck,
  CleanInstallDeclaredCheck,
  CleanInstallFailedCheck,
  CleanInstallFixTask,
  CleanInstallLayer,
  CleanInstallVerificationInput,
  CleanInstallVerificationOutput,
  CleanInstallVerificationReport,
  CleanInstallVerificationStageOptions,
  CleanInstallExecResult,
} from './clean-install-verification-types.js';
import { mergeCleanInstallChecks } from './clean-install-default-checks.js';

const DEFAULT_L1_SCRIPT_RELATIVE_PATHS = [
  // npm package / source checkout: scripts/verify-l1.js
  '../../scripts/verify-l1.js',
  // Fallback if the package is laid out with dist/ under a nested runtime path.
  '../scripts/verify-l1.js',
] as const;
const COMMAND_TIMEOUT_MS = 300_000;
const MAX_BUFFER = 1024 * 1024 * 5;

function defaultExecFile(
  file: string,
  args: string[],
  execOptions: { cwd: string; encoding: 'utf8'; timeout: number; maxBuffer: number },
): CleanInstallExecResult {
  return {
    stdout: nodeExecFileSync(file, args, execOptions),
  };
}

export class CleanInstallVerificationStage implements Stage<CleanInstallVerificationInput, CleanInstallVerificationOutput> {
  readonly stageId: StageId = 'clean-install-verification' as StageId;
  private readonly execFile: NonNullable<CleanInstallVerificationStageOptions['execFile']>;
  private readonly now: () => string;

  constructor(private readonly options: CleanInstallVerificationStageOptions = {}) {
    this.execFile = options.execFile ?? defaultExecFile;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async execute(input: CleanInstallVerificationInput): Promise<CleanInstallVerificationOutput> {
    const hasDeclaredOverrides = input.l2Checks !== undefined || input.l3Checks !== undefined;
    const checksToRun = input.skip
      ? { l2: [], l3: [] }
      : hasDeclaredOverrides
        ? {
            l2: input.l2Checks ?? [],
            l3: input.l3Checks ?? [],
          }
        : {
            l2: mergeCleanInstallChecks('l2', input.projectRoot, input.cliBin, input.l2Checks),
            l3: mergeCleanInstallChecks('l3', input.projectRoot, input.cliBin, input.l3Checks),
          };

    const report = input.skip
      ? this.createSkippedReport()
      : await this.withIsolatedCleanDirectory(input, (cleanRoot) => {
          this.installPackageIntoCleanRoot(input, cleanRoot);
          return this.createReport(
            this.runL1(input, cleanRoot),
            this.runDeclaredChecks('l2', cleanRoot, checksToRun.l2),
            this.runDeclaredChecks('l3', cleanRoot, checksToRun.l3),
          );
        });

    const timestamp = this.now();
    const artifact = await this.writeArtifact(input, report, timestamp);

    return {
      report,
      canComplete: report.overall === 'pass',
      artifact,
    };
  }

  private installPackageIntoCleanRoot(input: CleanInstallVerificationInput, cleanRoot: string): void {
    const packageSpec = buildPackageSpec(input.packageName, input.version);
    this.execFile('bash', ['-lc', `npm init -y --silent >/dev/null 2>&1 && npm install ${shellQuote(packageSpec)} --no-audit --no-fund`], {
      cwd: cleanRoot,
      encoding: 'utf8',
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
    });
  }

  private runL1(input: CleanInstallVerificationInput, cleanRoot: string): CleanInstallCheck[] {
    const scriptPath = input.l1ScriptPath ?? resolveBundledL1Script();
    const packageSpec = buildPackageSpec(input.packageName, input.version);

    try {
      const result = this.execFile('bash', [
        scriptPath,
        '--package',
        packageSpec,
        '--bin',
        input.cliBin,
        '--commands',
        `${input.cliBin} --help`,
        `${input.cliBin} init --help`,
      ], {
        cwd: cleanRoot,
        encoding: 'utf8',
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
      });

      return [{
        id: 'l1-npm-stranger-verify',
        description: 'Run npm-stranger-verify.sh for npm install, CLI --help, and init availability.',
        status: 'pass',
        output: this.outputFrom(result),
      }];
    } catch (err: unknown) {
      return [{
        id: 'l1-npm-stranger-verify',
        description: 'Run npm-stranger-verify.sh for npm install, CLI --help, and init availability.',
        status: 'fail',
        output: this.errorOutput(err),
        suggestion: 'Fix clean install, CLI help, or init command behavior until npm-stranger-verify exits 0.',
      }];
    }
  }

  private runDeclaredChecks(
    layer: CleanInstallLayer,
    projectRoot: string,
    declaredChecks: CleanInstallDeclaredCheck[],
  ): CleanInstallCheck[] {
    if (declaredChecks.length === 0) {
      return [{
        id: `${layer}-declared-checks`,
        description: `${layer.toUpperCase()} checks declared in sevo.config.json`,
        status: 'pass',
        output: 'No declared checks.',
      }];
    }

    return declaredChecks.map((check) => this.runDeclaredCheck(check, projectRoot));
  }

  private runDeclaredCheck(check: CleanInstallDeclaredCheck, projectRoot: string): CleanInstallCheck {
    try {
      const result = this.execFile('bash', ['-lc', `PATH=${shellQuote(`${projectRoot}/node_modules/.bin:${process.env.PATH ?? ''}`)} HOME=${shellQuote(projectRoot)} ${check.command}`], {
        cwd: projectRoot,
        encoding: 'utf8',
        timeout: COMMAND_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
      });

      return {
        id: check.id,
        description: check.description,
        status: 'pass',
        output: this.outputFrom(result),
      };
    } catch (err: unknown) {
      return {
        id: check.id,
        description: check.description,
        status: 'fail',
        output: this.errorOutput(err),
        suggestion: check.suggestion ?? `Fix declared clean-install check ${check.id}.`,
      };
    }
  }

  private createReport(
    l1Checks: CleanInstallCheck[],
    l2Checks: CleanInstallCheck[],
    l3Checks: CleanInstallCheck[],
  ): CleanInstallVerificationReport {
    const l1 = { pass: l1Checks.every((check) => check.status === 'pass'), checks: l1Checks };
    const l2 = { pass: l2Checks.every((check) => check.status === 'pass'), checks: l2Checks };
    const l3 = { pass: l3Checks.every((check) => check.status === 'pass'), checks: l3Checks };
    const failedChecks = this.collectFailedChecks({ l1: l1.checks, l2: l2.checks, l3: l3.checks });
    const fixTasks = this.createFixTasks(failedChecks, { l1: l1.checks, l2: l2.checks, l3: l3.checks });

    return {
      l1,
      l2,
      l3,
      overall: l1.pass && l2.pass && l3.pass ? 'pass' : 'fail',
      failedChecks,
      fixTasks,
    };
  }

  private createSkippedReport(): CleanInstallVerificationReport {
    const skipped: CleanInstallCheck = {
      id: 'clean-install-skipped-l0',
      description: 'L0 micro-change skips clean-install verification.',
      status: 'pass',
      output: 'Skipped by L0 routing.',
    };

    return this.createReport([skipped], [skipped], [skipped]);
  }

  private collectFailedChecks(checksByLayer: Record<CleanInstallLayer, CleanInstallCheck[]>): CleanInstallFailedCheck[] {
    const failedChecks: CleanInstallFailedCheck[] = [];
    for (const layer of ['l1', 'l2', 'l3'] as const) {
      for (const check of checksByLayer[layer]) {
        if (check.status === 'fail') {
          failedChecks.push({
            layer,
            checkId: check.id,
            description: check.description,
            output: check.output,
          });
        }
      }
    }
    return failedChecks;
  }

  private createFixTasks(
    failedChecks: CleanInstallFailedCheck[],
    checksByLayer: Record<CleanInstallLayer, CleanInstallCheck[]>,
  ): CleanInstallFixTask[] {
    return failedChecks.map((failed) => {
      const check = checksByLayer[failed.layer].find((item) => item.id === failed.checkId);
      return {
        layer: failed.layer,
        checkId: failed.checkId,
        suggestion: check?.suggestion ?? `Fix ${failed.layer.toUpperCase()} clean-install check ${failed.checkId}.`,
      };
    });
  }

  private async writeArtifact(
    input: CleanInstallVerificationInput,
    report: CleanInstallVerificationReport,
    timestamp: string,
  ): Promise<ArtifactRef> {
    const docsPath = input.artifactBasePath ?? path.join(input.projectRoot, 'docs');
    await mkdir(docsPath, { recursive: true });

    const filePath = path.join(docsPath, 'clean-install-report.json');
    await writeFile(filePath, JSON.stringify(report, null, 2), 'utf8');

    return {
      id: `${input.taskId}:clean-install-verification`,
      type: 'clean-install-verification-report',
      path: filePath,
      createdAt: timestamp,
      metadata: {
        pipelineId: input.pipelineId,
        projectSlug: input.projectSlug,
        overall: report.overall,
        failedChecks: report.failedChecks.length,
      },
    };
  }

  private async withIsolatedCleanDirectory(
    input: CleanInstallVerificationInput,
    run: (cleanRoot: string) => CleanInstallVerificationReport,
  ): Promise<CleanInstallVerificationReport> {
    const base = input.isolationBasePath ?? os.tmpdir();
    const cleanRoot = await mkdtemp(path.join(base, `stranger-verify-${input.taskId}-`));
    try {
      return run(cleanRoot);
    } finally {
      if (input.keepIsolationDir !== true) {
        await rm(cleanRoot, { recursive: true, force: true });
      }
    }
  }

  private outputFrom(result: { stdout?: string | Buffer; stderr?: string | Buffer }): string {
    return [result.stdout, result.stderr]
      .filter((value): value is string | Buffer => value !== undefined && value !== null)
      .map((value) => String(value).trim())
      .filter(Boolean)
      .join('\n')
      .slice(0, MAX_BUFFER);
  }

  private errorOutput(err: unknown): string {
    const execErr = err as { stdout?: string | Buffer; stderr?: string | Buffer; message?: string };
    return [execErr.stdout, execErr.stderr, execErr.message]
      .filter((value): value is string | Buffer => value !== undefined && value !== null)
      .map((value) => String(value).trim())
      .filter(Boolean)
      .join('\n')
      .slice(0, MAX_BUFFER);
  }
}

function resolveBundledL1Script(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  for (const relativePath of DEFAULT_L1_SCRIPT_RELATIVE_PATHS) {
    const candidate = path.resolve(currentDir, relativePath);
    if (existsSync(candidate)) return candidate;
  }

  return path.resolve(currentDir, DEFAULT_L1_SCRIPT_RELATIVE_PATHS[0]);
}

function buildPackageSpec(packageName: string, version: string): string {
  if (packageName.startsWith('.') || packageName.startsWith('/') || packageName.startsWith('file:')) {
    return packageName;
  }

  return `${packageName}@${version}`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
