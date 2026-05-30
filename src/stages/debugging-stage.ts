import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import type { ArtifactRef, StageId } from '../types/index.js';
import type { Stage } from './spec-types.js';
import type {
  DebuggingStageInput,
  DebuggingStageOutput,
  DebuggingStageOptions,
  DebuggingRecord,
  DebuggingPhaseRecord,
  DebuggingPhaseRequest,
  DebuggingIssue,
} from './debugging-types.js';
import { DEBUGGING_PHASE_ORDER } from './debugging-types.js';

export class SystematicDebuggingStage implements Stage<DebuggingStageInput, DebuggingStageOutput> {
  readonly stageId: StageId = 'implement' as const; // runs within implement context
  private readonly now: () => string;

  constructor(private readonly options: DebuggingStageOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async execute(input: DebuggingStageInput): Promise<DebuggingStageOutput> {
    const records: DebuggingRecord[] = [];

    for (const issue of input.issues) {
      const record = await this.debugIssue(issue);
      records.push(record);
    }

    const resolved = records.filter((r) => r.fixApplied && r.regressionCovered).length;
    const timestamp = this.now();

    const artifact = await this.writeArtifact(input, records, timestamp);

    return {
      records,
      metadata: {
        totalIssues: records.length,
        resolved,
        unresolved: records.length - resolved,
        generatedAt: timestamp,
      },
      artifact,
    };
  }

  private async debugIssue(issue: DebuggingIssue): Promise<DebuggingRecord> {
    const phases: DebuggingPhaseRecord[] = [];
    let rootCause: string | null = null;
    let fixApplied = false;
    let regressionCovered = false;

    // AC-4.20c: Four phases execute in strict order, cannot skip reproduce
    for (const phase of DEBUGGING_PHASE_ORDER) {
      const priorPhases = [...phases];

      if (this.options.adapter.executePhase) {
        const request: DebuggingPhaseRequest = { issue, phase, priorPhases };
        const response = await this.options.adapter.executePhase(request);
        const timestamp = this.now();

        const phaseRecord: DebuggingPhaseRecord = {
          phase,
          status: response.status,
          evidence: response.evidence.map((e) => ({
            type: e.type,
            content: e.content,
            timestamp,
          })),
          conclusion: response.conclusion,
        };

        phases.push(phaseRecord);

        // AC-4.20c: If reproduce fails, halt — cannot proceed without reproduction
        if (phase === 'reproduce' && response.status === 'failed') {
          break;
        }

        // Extract root cause from analyze phase
        if (phase === 'analyze' && response.status === 'passed') {
          rootCause = response.conclusion;
        }

        // Track verify phase outcomes (AC-4.20e)
        if (phase === 'verify' && response.status === 'passed') {
          fixApplied = true;
          regressionCovered = true;
        }
      } else {
        // No adapter: record as pending
        phases.push({
          phase,
          status: 'skipped',
          evidence: [{
            type: 'reproduction_steps',
            content: 'No debugging adapter configured.',
            timestamp: this.now(),
          }],
          conclusion: 'Skipped — no adapter.',
        });
      }
    }

    return { issueId: issue.id, phases, rootCause, fixApplied, regressionCovered };
  }

  private async writeArtifact(
    input: DebuggingStageInput,
    records: DebuggingRecord[],
    timestamp: string,
  ): Promise<ArtifactRef> {
    const basePath = input.artifactBasePath
      ?? path.join(process.cwd(), 'artifacts', 'debugging');
    await mkdir(basePath, { recursive: true });

    const filePath = path.join(basePath, `${input.taskId}-debugging-records.json`);
    await writeFile(filePath, JSON.stringify({ records, generatedAt: timestamp }, null, 2), 'utf8');

    return {
      id: `${input.taskId}:debugging-records`,
      type: 'debugging-records',
      path: filePath,
      createdAt: timestamp,
      metadata: { issueCount: records.length },
    };
  }
}
