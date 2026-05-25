import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import type { ArtifactRef, StageId } from '../types/index.js';
import type { Stage } from './spec-types.js';
import type {
  LedgerStageInput,
  LedgerStageOutput,
  LedgerStageOptions,
  LedgerEntryDetail,
} from './ledger-types.js';

export class LedgerStage implements Stage<LedgerStageInput, LedgerStageOutput> {
  readonly stageId: StageId = 'ledger' as const;
  private readonly now: () => string;

  constructor(private readonly options: LedgerStageOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async execute(input: LedgerStageInput): Promise<LedgerStageOutput> {
    const timestamp = this.now();

    // AC-4.36 / AC-4.38: Verify failure → aborted conclusion
    const conclusion = input.verifyPassed ? 'delivered' : 'aborted';

    // AC-4.54: Collect clarification artifacts from all stage records
    const collectedClarificationRefs = this.collectClarificationArtifacts(input);

    // AC-4.37: Trace all key artifacts from this pipeline run
    const entry: LedgerEntryDetail = {
      pipelineId: input.pipelineId,
      version: input.version,
      createdAt: timestamp,
      scope: input.scope,
      stages: input.stages,
      conclusion,
      evidence: input.evidence,
      // AC-4.54: Merge explicitly provided refs with collected ones
      clarificationRefs: collectedClarificationRefs,
      responsibilities: input.responsibilities ?? [],
      followUpActions: input.followUpActions ?? [],
      lessons: input.lessons ?? [],
    };

    // Persist via adapter if available
    if (this.options.adapter.persistEntry) {
      await this.options.adapter.persistEntry({ entry });
    }

    // AC-4.40: Write ledger artifact — no entry = no closure
    const artifact = await this.writeArtifact(input, entry, timestamp);

    return {
      ledgerEntry: entry,
      metadata: {
        pipelineId: input.pipelineId,
        conclusion,
        evidenceCount: input.evidence.length,
        lessonCount: entry.lessons.length,
        createdAt: timestamp,
      },
      artifact,
    };
  }

  private async writeArtifact(
    input: LedgerStageInput,
    entry: LedgerEntryDetail,
    timestamp: string,
  ): Promise<ArtifactRef> {
    const basePath = input.artifactBasePath
      ?? path.join(process.cwd(), 'artifacts', 'ledger');
    await mkdir(basePath, { recursive: true });

    const filePath = path.join(basePath, `${input.taskId}-ledger-entry.json`);
    await writeFile(filePath, JSON.stringify(entry, null, 2), 'utf8');

    return {
      id: `${input.taskId}:ledger-entry`,
      type: 'ledger-entry',
      path: filePath,
      createdAt: timestamp,
      metadata: { conclusion: entry.conclusion, evidenceCount: entry.evidence.length },
    };
  }

  /**
   * AC-4.54: Collect clarification artifacts from all stage records
   * and merge with explicitly provided refs.
   */
  private collectClarificationArtifacts(input: LedgerStageInput): ArtifactRef[] {
    const seen = new Set<string>();
    const refs: ArtifactRef[] = [];

    // First add explicitly provided refs
    for (const ref of input.clarificationRefs ?? []) {
      if (!seen.has(ref.id)) {
        seen.add(ref.id);
        refs.push(ref);
      }
    }

    // Then collect from stage records
    for (const stage of input.stages) {
      for (const ref of stage.clarificationRefs ?? []) {
        if (!seen.has(ref.id)) {
          seen.add(ref.id);
          refs.push(ref);
        }
      }
    }

    return refs;
  }
}
