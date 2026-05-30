/**
 * Artifact Collector — gathers artifact references from pipeline stages.
 *
 * Walks every required stage in a PipelineState and collects:
 *  - ArtifactRef[] (flattened, deduplicated by id)
 *  - StageRecord[] (ordered by pipeline sequence)
 */

import * as path from 'node:path';

import type {
  PipelineState,
  ArtifactRef,
  StageRecord,
  StageId,
} from '../types/index.js';

export const ENDGAME_ARTIFACT_TYPES = {
  README_DIFF: 'readme_diff',
  VERSION_CHANGE: 'version_change',
  PUBLISH_RESULT: 'publish_result',
  GAP_SCAN_REPORT: 'gap_scan_report',
} as const;

export type EndgameArtifactType = (typeof ENDGAME_ARTIFACT_TYPES)[keyof typeof ENDGAME_ARTIFACT_TYPES];


/** Collect all artifacts from every required stage, deduplicated by id. */
export function collectArtifacts(state: PipelineState): ArtifactRef[] {
  const seen = new Set<string>();
  const result: ArtifactRef[] = [];

  for (const stageId of state.requiredStages) {
    const record: StageRecord | undefined = state.stages[stageId];
    if (!record) continue;
    for (const art of record.artifacts) {
      if (!seen.has(art.id)) {
        seen.add(art.id);
        result.push(art);
      }
    }
  }

  return result;
}

/** Collect stage records in pipeline-defined order. */
export function collectStageRecords(state: PipelineState): StageRecord[] {
  const records: StageRecord[] = [];
  for (const stageId of state.requiredStages) {
    const record: StageRecord | undefined = state.stages[stageId];
    if (record) {
      records.push(record);
    }
  }
  return records;
}

/**
 * Check whether all required (non-skipped) stages have passed.
 * Skipped stages are considered acceptable for delivery.
 */
export function allRequiredStagesPassed(state: PipelineState): boolean {
  return state.requiredStages.every((sid: StageId) => {
    const record: StageRecord | undefined = state.stages[sid];
    return record !== undefined &&
      (record.status === 'passed' || record.status === 'skipped');
  });
}

/** Collect clarificationRefs from all required stages, deduplicated by id. */
export function collectClarificationRefs(state: PipelineState): ArtifactRef[] {
  const seen = new Set<string>();
  const result: ArtifactRef[] = [];

  for (const stageId of state.requiredStages) {
    const record: StageRecord | undefined = state.stages[stageId];
    if (!record?.clarificationRefs) continue;
    for (const ref of record.clarificationRefs) {
      if (!seen.has(ref.id)) {
        seen.add(ref.id);
        result.push(ref);
      }
    }
  }

  return result;
}

export function inferEndgameArtifactType(filePath: string): EndgameArtifactType | null {
  const normalized = path.basename(filePath).toLowerCase();
  if (normalized.includes('readme') && normalized.includes('diff')) return ENDGAME_ARTIFACT_TYPES.README_DIFF;
  if (normalized.includes('version') || normalized.includes('package')) return ENDGAME_ARTIFACT_TYPES.VERSION_CHANGE;
  if (normalized.includes('publish')) return ENDGAME_ARTIFACT_TYPES.PUBLISH_RESULT;
  if (normalized.includes('gap') || normalized.includes('post-release')) return ENDGAME_ARTIFACT_TYPES.GAP_SCAN_REPORT;
  return null;
}
