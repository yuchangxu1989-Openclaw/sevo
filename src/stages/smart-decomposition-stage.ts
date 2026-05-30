import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import type { ArtifactRef, StageId } from '../types/index.js';
import type { Stage } from './spec-types.js';
import type {
  SmartDecompositionInput,
  SmartDecompositionOutput,
  SmartDecompositionStageOptions,
  SmartTask,
  SmartDecomposeResponse,
} from './smart-decomposition-types.js';

/**
 * SMART Decomposition stage.
 *
 * Takes the FR list from the Spec stage and decomposes each FR into
 * a SMART-qualified task (Specific / Measurable / Achievable /
 * Relevant / Time-bound). When an OKR tree is present, each task's
 * "Relevant" dimension maps to the corresponding KR.
 *
 * Graceful skip: when no FRs are provided, returns an empty task list.
 */
export class SmartDecompositionStage implements Stage<SmartDecompositionInput, SmartDecompositionOutput> {
  readonly stageId: StageId = 'spec' as const; // Runs within spec phase
  private readonly now: () => string;

  constructor(private readonly options: SmartDecompositionStageOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async execute(input: SmartDecompositionInput): Promise<SmartDecompositionOutput> {
    if (input.functionalRequirements.length === 0) {
      const timestamp = this.now();
      const artifact = await this.writeArtifact(input, [], timestamp);
      return {
        tasks: [],
        metadata: { totalTasks: 0, krCoverage: 0, decomposedAt: timestamp },
        artifact,
      };
    }

    const tasks = await this.decompose(input);
    const timestamp = this.now();
    const artifact = await this.writeArtifact(input, tasks, timestamp);

    const tasksWithKr = tasks.filter((t) => t.krId);
    const allKrIds = input.okrTree
      ? new Set(input.okrTree.flatMap((o) => o.keyResults.map((kr) => kr.krId)))
      : new Set<string>();
    const coveredKrIds = new Set(tasksWithKr.map((t) => t.krId));
    const krCoverage = allKrIds.size > 0
      ? coveredKrIds.size / allKrIds.size
      : 0;

    return {
      tasks,
      metadata: {
        totalTasks: tasks.length,
        krCoverage: Math.round(krCoverage * 100) / 100,
        decomposedAt: timestamp,
      },
      artifact,
    };
  }

  /**
   * Decompose FRs into SMART tasks.
   * Uses the adapter when available; falls back to a deterministic
   * mapping that extracts SMART dimensions from FR metadata.
   */
  private async decompose(input: SmartDecompositionInput): Promise<SmartTask[]> {
    if (this.options.adapter.decomposeSmart) {
      const response = await this.options.adapter.decomposeSmart({
        functionalRequirements: input.functionalRequirements,
        okrTree: input.okrTree,
        krMapping: input.krMapping,
      });
      return this.normalizeResponse(response);
    }

    // Fallback: derive SMART dimensions from FR structure
    return input.functionalRequirements.map((fr, idx) => {
      const krId = input.krMapping?.[fr.id] ?? fr.tracesTo;
      const acSummary = fr.acceptanceCriteria
        .map((ac) => ac.description)
        .join('; ');

      return {
        id: `SMART-${String(idx + 1).padStart(3, '0')}`,
        frId: fr.id,
        specific: fr.description,
        measurable: acSummary || `All AC for ${fr.id} pass`,
        achievable: 'Feasible within current architecture',
        relevant: krId
          ? `Traces to ${krId}`
          : 'General project objective',
        timeBound: 'Current pipeline iteration',
        ...(krId ? { krId } : {}),
      };
    });
  }

  private normalizeResponse(response: SmartDecomposeResponse): SmartTask[] {
    return response.tasks.map((t, idx) => ({
      id: `SMART-${String(idx + 1).padStart(3, '0')}`,
      frId: t.frId,
      specific: t.specific,
      measurable: t.measurable,
      achievable: t.achievable,
      relevant: t.relevant,
      timeBound: t.timeBound,
      ...(t.krId ? { krId: t.krId } : {}),
    }));
  }

  private async writeArtifact(
    input: SmartDecompositionInput,
    tasks: SmartTask[],
    timestamp: string,
  ): Promise<ArtifactRef> {
    const basePath = input.artifactBasePath
      ?? path.join(process.cwd(), 'artifacts', 'smart');
    await mkdir(basePath, { recursive: true });

    const filePath = path.join(basePath, `${input.taskId}-smart-tasks.json`);
    await writeFile(
      filePath,
      JSON.stringify({ tasks, decomposedAt: timestamp }, null, 2),
      'utf8',
    );

    return {
      id: `${input.taskId}:smart-tasks`,
      type: 'smart-tasks',
      path: filePath,
      createdAt: timestamp,
      metadata: {
        taskCount: tasks.length,
        withKrMapping: tasks.filter((t) => t.krId).length,
      },
    };
  }
}
