import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import type { ArtifactRef, StageId } from '../types/index.js';
import type { Stage } from './spec-types.js';
import type {
  CommercialAcceptanceCheck,
  CommercialAcceptanceChecklist,
  CommercialAcceptanceStageInput,
  CommercialAcceptanceStageOutput,
  CommercialAcceptanceStageOptions,
  CommercialAcceptanceTarget,
} from './commercial-acceptance-types.js';

export class CommercialAcceptanceStage implements Stage<CommercialAcceptanceStageInput, CommercialAcceptanceStageOutput> {
  readonly stageId: StageId = 'commercial-acceptance-authoring' as const;
  private readonly now: () => string;

  constructor(private readonly options: CommercialAcceptanceStageOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async execute(input: CommercialAcceptanceStageInput): Promise<CommercialAcceptanceStageOutput> {
    const checks: CommercialAcceptanceCheck[] = [];

    for (const target of input.targets) {
      const check = await this.runCheck(target);
      checks.push(check);
    }

    const failedChecks = checks.filter((c) => c.status === 'fail');
    const allPassed = failedChecks.length === 0;

    const checklist: CommercialAcceptanceChecklist = { checks, allPassed, failedChecks };

    const timestamp = this.now();
    const artifact = await this.writeArtifact(input, checklist, timestamp);

    const passed = checks.filter((c) => c.status === 'pass').length;
    const skipped = checks.filter((c) => c.status === 'skip').length;

    return {
      checklist,
      metadata: {
        totalChecks: checks.length,
        passed,
        failed: failedChecks.length,
        skipped,
        authoredAt: timestamp,
        authorRole: 'product',
      },
      artifact,
    };
  }

  private async runCheck(target: CommercialAcceptanceTarget): Promise<CommercialAcceptanceCheck> {
    if (!this.options.adapter.runCommercialCheck) {
      return {
        id: target.id,
        description: target.description,
        category: target.category,
        status: 'skip',
        detail: 'No commercial acceptance adapter provided',
      };
    }

    const response = await this.options.adapter.runCommercialCheck({ target });
    return {
      id: target.id,
      description: target.description,
      category: target.category,
      status: response.status,
      detail: response.detail,
    };
  }

  private async writeArtifact(
    input: CommercialAcceptanceStageInput,
    checklist: CommercialAcceptanceChecklist,
    timestamp: string,
  ): Promise<ArtifactRef> {
    const basePath = input.artifactBasePath
      ?? path.join(process.cwd(), 'artifacts', 'commercial-acceptance');
    await mkdir(basePath, { recursive: true });

    const filePath = path.join(basePath, `${input.taskId}-commercial-acceptance.json`);
    await writeFile(filePath, JSON.stringify({ ...checklist, authoredAt: timestamp }, null, 2), 'utf8');

    return {
      id: `${input.taskId}:commercial-acceptance`,
      type: 'commercial-acceptance-checklist',
      path: filePath,
      createdAt: timestamp,
      metadata: { checkCount: checklist.checks.length, allPassed: checklist.allPassed },
    };
  }
}