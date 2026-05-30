/**
 * Parallel Branch handling — manages the Test Case Authoring ∥ Contract
 * parallel fork after Spec Review Gate passes (ADR-004).
 *
 * Rules:
 *  - spec-review-gate passed → activate both 'contract' and 'test-case-authoring'
 *  - contract-review-gate only waits for 'contract' (not test-case-authoring)
 *  - 'implement' requires BOTH contract-review-gate passed AND test-case-authoring passed
 *    (if test-case-authoring not passed yet → implement stays blocked)
 *  - smoke-test passed → activate both 'ux-acceptance' and 'pm-commercial-review'
 *  - 'regression' requires BOTH ux-acceptance AND pm-commercial-review passed (parallel join)
 */

import type { StageId, PipelineState } from '../types/index.js';
import {
  PARALLEL_FORK_AFTER_SPEC_REVIEW,
  STAGE_IDS,
} from '../constants.js';

export { PARALLEL_FORK_AFTER_SPEC_REVIEW };

/** For a given stage, return prerequisite stages that must be 'passed' before it can activate. */
export function getPrerequisites(
  stageId: StageId,
  requiredStages: StageId[],
): StageId[] {
  // Only consider stages that are actually in the pipeline
  const inPipeline = (s: StageId) => requiredStages.includes(s);

  switch (stageId) {
    // Parallel branches after spec-review-gate
    case STAGE_IDS.CONTRACT:
    case STAGE_IDS.TEST_CASE_AUTHORING:
    case STAGE_IDS.UX_ACCEPTANCE_AUTHORING:
    case STAGE_IDS.COMMERCIAL_ACCEPTANCE_AUTHORING:
    case STAGE_IDS.UX_INTERACTION_DESIGN:
    case STAGE_IDS.ARCHITECTURE_DESIGN:
      return inPipeline(STAGE_IDS.SPEC_REVIEW_GATE) ? [STAGE_IDS.SPEC_REVIEW_GATE] : [];

    // Contract review gate waits for contract and any selected design stages.
    case STAGE_IDS.CONTRACT_REVIEW_GATE: {
      const deps: StageId[] = [];
      if (inPipeline(STAGE_IDS.CONTRACT)) deps.push(STAGE_IDS.CONTRACT);
      if (inPipeline(STAGE_IDS.UX_INTERACTION_DESIGN)) deps.push(STAGE_IDS.UX_INTERACTION_DESIGN);
      if (inPipeline(STAGE_IDS.ARCHITECTURE_DESIGN)) deps.push(STAGE_IDS.ARCHITECTURE_DESIGN);
      return deps;
    }

    // Implement can be activated once contract-review-gate passes.
    // If test-case-authoring is still pending, implement will be blocked
    // (handled by shouldBlockImplement in pipeline-engine).
    case STAGE_IDS.IMPLEMENT: {
      const deps: StageId[] = [];
      if (inPipeline(STAGE_IDS.CONTRACT_REVIEW_GATE)) deps.push(STAGE_IDS.CONTRACT_REVIEW_GATE);
      return deps;
    }

    // ux-acceptance and pm-commercial-review both depend on smoke-test (parallel fork)
    case STAGE_IDS.UX_ACCEPTANCE:
    case STAGE_IDS.PM_COMMERCIAL_REVIEW:
      return inPipeline(STAGE_IDS.SMOKE_TEST) ? [STAGE_IDS.SMOKE_TEST] : [];

    // regression is a parallel join — waits for both ux-acceptance and pm-commercial-review
    case STAGE_IDS.REGRESSION: {
      const deps: StageId[] = [];
      if (inPipeline(STAGE_IDS.UX_ACCEPTANCE)) deps.push(STAGE_IDS.UX_ACCEPTANCE);
      if (inPipeline(STAGE_IDS.PM_COMMERCIAL_REVIEW)) deps.push(STAGE_IDS.PM_COMMERCIAL_REVIEW);
      // If neither parallel branch is in the pipeline, fall back to previous stage in order
      if (deps.length === 0) {
        const idx = requiredStages.indexOf(stageId);
        if (idx > 0) {
          const prev = requiredStages[idx - 1];
          if (prev) deps.push(prev);
        }
      }
      return deps;
    }

    // Default: previous stage in requiredStages order
    default: {
      const idx = requiredStages.indexOf(stageId);
      if (idx <= 0) return [];
      // Walk backwards to find the immediate predecessor that isn't a parallel sibling
      const prev = requiredStages[idx - 1];
      return prev ? [prev] : [];
    }
  }
}

/** Check whether all prerequisites for a stage are satisfied (status === 'passed'). */
export function arePrerequisitesMet(
  stageId: StageId,
  state: PipelineState,
): boolean {
  const prereqs = getPrerequisites(stageId, state.requiredStages);
  return prereqs.every((dep) => {
    const record = state.stages[dep];
    return record && record.status === 'passed';
  });
}

/**
 * Determine which pending stages should be activated next given current state.
 * Returns stage IDs that are pending and have all prerequisites met.
 */
export function getActivatableStages(state: PipelineState): StageId[] {
  return state.requiredStages.filter((sid: StageId) => {
    const record = state.stages[sid];
    if (!record || record.status !== 'pending') return false;
    return arePrerequisitesMet(sid, state);
  });
}

/**
 * Determine if 'implement' should be blocked because test-case-authoring
 * is still in progress (ADR-004 blocking rule).
 */
export function shouldBlockImplement(state: PipelineState): boolean {
  if (!state.requiredStages.includes(STAGE_IDS.TEST_CASE_AUTHORING)) return false;
  const tcRecord = state.stages[STAGE_IDS.TEST_CASE_AUTHORING];
  return !tcRecord || tcRecord.status !== 'passed';
}
