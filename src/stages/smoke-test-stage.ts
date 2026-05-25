import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import type { ArtifactRef, GateConclusion, StageId } from '../types/index.js';
import type { Stage } from './spec-types.js';
import type {
  SmokeTestStageInput,
  SmokeTestStageOutput,
  SmokeTestStageOptions,
  SmokeTestReport,
  SmokeTestCheck,
  SmokeTestFailureDetail,
  SmokeTestTarget,
} from './smoke-test-types.js';

export class SmokeTestStage implements Stage<SmokeTestStageInput, SmokeTestStageOutput> {
  readonly stageId: StageId = 'smoke-test' as const;
  private readonly now: () => string;

  constructor(private readonly options: SmokeTestStageOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async execute(input: SmokeTestStageInput): Promise<SmokeTestStageOutput> {
    const checks: SmokeTestCheck[] = [];

    // AC-4.24p: Cover core-path, build-integrity, entry-crash dimensions
    for (const target of input.targets) {
      const check = await this.runCheck(target, input);
      checks.push(check);
    }

    const failedChecks = checks.filter((c) => c.status === 'fail');
    const gateConclusion = deriveConclusion(failedChecks);

    // AC-4.24q: Failed checks include reproduction steps
    const failureDetails: SmokeTestFailureDetail[] = failedChecks
      .filter((c) => c.detail)
      .map((c) => ({
        checkId: c.id,
        reproductionSteps: c.detail!,
      }));

    const report: SmokeTestReport = {
      checks,
      gateConclusion,
      failedChecks,
      failureDetails,
    };

    const timestamp = this.now();
    const artifact = await this.writeArtifact(input, report, timestamp);

    const passed = checks.filter((c) => c.status === 'pass').length;
    const skipped = checks.filter((c) => c.status === 'skip').length;

    return {
      smokeTestReport: report,
      metadata: {
        gateConclusion,
        totalChecks: checks.length,
        passed,
        failed: failedChecks.length,
        skipped,
        executedAt: timestamp,
      },
      artifact,
    };
  }

  private async runCheck(
    target: SmokeTestTarget,
    input: SmokeTestStageInput,
  ): Promise<SmokeTestCheck> {
    if (!this.options.adapter.runSmokeCheck) {
      return {
        id: target.id,
        dimension: target.dimension,
        description: target.description,
        status: 'skip',
        detail: 'No smoke test adapter provided',
      };
    }

    const response = await this.options.adapter.runSmokeCheck({
      target,
      implementationArtifacts: input.implementationArtifacts,
    });

    return {
      id: target.id,
      dimension: target.dimension,
      description: target.description,
      status: response.status,
      detail: response.detail ?? response.reproductionSteps,
    };
  }

  private async writeArtifact(
    input: SmokeTestStageInput,
    report: SmokeTestReport,
    timestamp: string,
  ): Promise<ArtifactRef> {
    const basePath = input.artifactBasePath
      ?? path.join(process.cwd(), 'artifacts', 'smoke-test');
    await mkdir(basePath, { recursive: true });

    const filePath = path.join(basePath, `${input.taskId}-smoke-test-report.json`);
    await writeFile(filePath, JSON.stringify({ ...report, executedAt: timestamp }, null, 2), 'utf8');

    return {
      id: `${input.taskId}:smoke-test-report`,
      type: 'smoke-test-report',
      path: filePath,
      createdAt: timestamp,
      metadata: { checkCount: report.checks.length, gateConclusion: report.gateConclusion },
    };
  }
}

/** AC-4.24q: Any failure blocks subsequent stages. */
function deriveConclusion(failedChecks: SmokeTestCheck[]): GateConclusion {
  if (failedChecks.length > 0) return 'rejected';
  return 'passed';
}
