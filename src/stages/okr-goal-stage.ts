import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import type { ArtifactRef, ObjectiveKeyResult, KeyResult, StageId } from '../types/index.js';
import type { Stage } from './spec-types.js';
import type {
  OkrGoalInput,
  OkrGoalOutput,
  OkrGoalStageOptions,
  OkrDecompositionResponse,
} from './okr-goal-types.js';

/**
 * OKR Goal Declaration stage.
 *
 * Receives an end-state goal (Objective) and decomposes it into
 * an OKR tree with 3-5 measurable Key Results via the adapter.
 * The tree is persisted as an artifact so downstream stages
 * (SMART decomposition, PDCA gap analysis) can read it as the
 * alignment baseline.
 *
 * Graceful skip: when no endStateGoal is provided, callers should
 * skip this stage entirely (the pipeline engine handles this via
 * routing).
 */
export class OkrGoalStage implements Stage<OkrGoalInput, OkrGoalOutput> {
  readonly stageId: StageId = 'spec' as const; // Runs within spec phase
  private readonly now: () => string;

  constructor(private readonly options: OkrGoalStageOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async execute(input: OkrGoalInput): Promise<OkrGoalOutput> {
    const okrTree = input.existingOkrTree?.length
      ? input.existingOkrTree
      : await this.decompose(input);

    const timestamp = this.now();
    const artifact = await this.writeArtifact(input, okrTree, timestamp);

    const totalKeyResults = okrTree.reduce(
      (sum, obj) => sum + obj.keyResults.length,
      0,
    );

    return {
      okrTree,
      metadata: {
        objectiveCount: okrTree.length,
        totalKeyResults,
        declaredAt: timestamp,
      },
      artifact,
    };
  }

  /**
   * Decompose the end-state goal into an OKR tree.
   * Uses the adapter when available; falls back to a single-objective
   * skeleton so the pipeline never breaks without an LLM.
   */
  private async decompose(input: OkrGoalInput): Promise<ObjectiveKeyResult[]> {
    if (this.options.adapter.decomposeOkr) {
      const response = await this.options.adapter.decomposeOkr({
        endStateGoal: input.endStateGoal,
        existingOkrTree: input.existingOkrTree,
      });
      return this.normalizeResponse(response);
    }

    // Fallback: single objective with one KR derived from the goal
    return [{
      objectiveId: 'OBJ-01',
      description: input.endStateGoal.description,
      keyResults: [{
        krId: 'KR-01',
        description: `Achieve: ${input.endStateGoal.description}`,
        measure: 'completion',
        status: 'not-started',
      }],
    }];
  }

  /**
   * Normalize adapter response into typed ObjectiveKeyResult[].
   * Assigns stable IDs (OBJ-NN, KR-NN.MM).
   */
  private normalizeResponse(response: OkrDecompositionResponse): ObjectiveKeyResult[] {
    return response.objectives.map((obj, objIdx) => {
      const objectiveId = `OBJ-${String(objIdx + 1).padStart(2, '0')}`;
      const keyResults: KeyResult[] = obj.keyResults.map((kr, krIdx) => ({
        krId: `KR-${String(objIdx + 1).padStart(2, '0')}.${krIdx + 1}`,
        description: kr.description,
        measure: kr.measure,
        ...(kr.threshold ? { threshold: kr.threshold } : {}),
        status: 'not-started' as const,
      }));

      return {
        objectiveId,
        description: obj.description,
        keyResults,
      };
    });
  }

  private async writeArtifact(
    input: OkrGoalInput,
    okrTree: ObjectiveKeyResult[],
    timestamp: string,
  ): Promise<ArtifactRef> {
    const basePath = input.artifactBasePath
      ?? path.join(process.cwd(), 'artifacts', 'okr');
    await mkdir(basePath, { recursive: true });

    const filePath = path.join(basePath, `${input.taskId}-okr-tree.json`);
    await writeFile(
      filePath,
      JSON.stringify({ okrTree, declaredAt: timestamp }, null, 2),
      'utf8',
    );

    return {
      id: `${input.taskId}:okr-tree`,
      type: 'okr-tree',
      path: filePath,
      createdAt: timestamp,
      metadata: {
        objectiveCount: okrTree.length,
        totalKeyResults: okrTree.reduce((s, o) => s + o.keyResults.length, 0),
      },
    };
  }
}
