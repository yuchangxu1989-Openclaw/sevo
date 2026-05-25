import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import type { ArtifactRef, StageId } from '../types/index.js';
import type { Stage } from './spec-types.js';
import type {
  RegressionStageInput,
  RegressionStageOutput,
  RegressionStageOptions,
  RegressionBundle,
  RegressionCheck,
  RegressionCheckRequest,
  RegressionTarget,
} from './regression-types.js';

export class RegressionStage implements Stage<RegressionStageInput, RegressionStageOutput> {
  readonly stageId: StageId = 'regression' as const;
  private readonly now: () => string;

  constructor(private readonly options: RegressionStageOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async execute(input: RegressionStageInput): Promise<RegressionStageOutput> {
    const checks: RegressionCheck[] = [];

    for (const target of input.targets) {
      const check = await this.runCheck(target);
      checks.push(check);
    }

    // AC-4.26: Separate recurrence prevention checks
    const recurrenceChecks = checks.filter((c) => c.isRecurrencePrevention);
    const failedChecks = checks.filter((c) => c.status === 'failed');

    // AC-4.28: Regression result feeds into Deploy/Verify decision
    const allPassed = failedChecks.length === 0;

    const bundle: RegressionBundle = {
      checks,
      allPassed,
      failedChecks,
      recurrenceChecks,
    };

    const timestamp = this.now();
    const artifact = await this.writeArtifact(input, bundle, timestamp);

    const passed = checks.filter((c) => c.status === 'passed').length;
    const failed = failedChecks.length;
    const skipped = checks.filter((c) => c.status === 'skipped').length;

    return {
      regressionBundle: bundle,
      metadata: {
        totalChecks: checks.length,
        passed,
        failed,
        skipped,
        generatedAt: timestamp,
      },
      artifact,
      deployReady: allPassed,
    };
  }

  private async runCheck(target: RegressionTarget): Promise<RegressionCheck> {
    if (!this.options.adapter.runCheck) {
      return {
        id: target.id,
        description: target.description,
        path: target.path,
        status: 'skipped',
        isRecurrencePrevention: target.isRecurrencePrevention ?? false,
      };
    }

    const request: RegressionCheckRequest = { target };
    const response = await this.options.adapter.runCheck(request);

    return {
      id: target.id,
      description: target.description,
      path: target.path,
      status: response.status,
      affectedScope: response.affectedScope,
      isRecurrencePrevention: target.isRecurrencePrevention ?? false,
    };
  }

  private async writeArtifact(
    input: RegressionStageInput,
    bundle: RegressionBundle,
    timestamp: string,
  ): Promise<ArtifactRef> {
    const basePath = input.artifactBasePath
      ?? path.join(process.cwd(), 'artifacts', 'regression');
    await mkdir(basePath, { recursive: true });

    const filePath = path.join(basePath, `${input.taskId}-regression-bundle.json`);
    await writeFile(filePath, JSON.stringify({ ...bundle, generatedAt: timestamp }, null, 2), 'utf8');

    return {
      id: `${input.taskId}:regression-bundle`,
      type: 'regression-bundle',
      path: filePath,
      createdAt: timestamp,
      metadata: { checkCount: bundle.checks.length },
    };
  }
}
