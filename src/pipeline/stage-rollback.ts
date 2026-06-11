/**
 * Stage Rollback — AC-13.4 stage rollback mechanism.
 *
 * When fix-loop retries are exhausted, the pipeline rolls back to a prior stage
 * so it can be re-executed. This module resolves the rollback target, executes
 * the state transitions, and determines when the pipeline is exhausted.
 *
 * Rollback target resolution (architecture §4.1):
 *   1. Stage-level `rollbackTarget` config (explicit override)
 *   2. Previous stage in `requiredStages` ordering
 *   3. null — first stage cannot roll back (records repair-required advisory)
 *
 * State transitions (architecture §4.2):
 *   failedStage (fix_pending) → rolled_back (terminal)
 *   targetStage (passed)      → active      (re-execution, guarded by reason='rollback')
 *
 * Pipeline-level exhaustion:
 *   rollbackCount >= maxRollbacks → pipeline.pipelineStatus = 'repair-required'
 */

import type {
  StageId,
  PipelineState,
} from '../types/index.js';

import { assertTransition } from './stage-machine.js';

// ── Configuration ───────────────────────────────────────────────

export interface RollbackConfig {
  /** Maximum number of rollbacks allowed per pipeline before repair-required advisory. Default: 2. */
  maxRollbacks: number;
}

export const DEFAULT_ROLLBACK_CONFIG: RollbackConfig = {
  maxRollbacks: 2,
};

// ── Result type ─────────────────────────────────────────────────

export interface RollbackDecision {
  executed: boolean;
  failedStage: StageId;
  targetStage: StageId | null;
  reason: string;
  blocked: boolean;
}

// ── StageRollback ───────────────────────────────────────────────

export class StageRollback {
  private readonly config: RollbackConfig;

  constructor(config?: Partial<RollbackConfig>) {
    this.config = { ...DEFAULT_ROLLBACK_CONFIG, ...config };
  }

  /**
   * Resolve the rollback target for a failed stage.
   *
   * Priority:
   *   1. Stage's explicit `rollbackTarget` field
   *   2. Previous stage in requiredStages ordering
   *   3. null (first stage — cannot roll back)
   */
  resolveTarget(state: PipelineState, failedStage: StageId): StageId | null {
    const stageRecord = state.stages[failedStage];

    // 1. Explicit rollback target configured on the stage
    if (stageRecord?.rollbackTarget) {
      // Validate that the target exists in the pipeline
      if (state.stages[stageRecord.rollbackTarget]) {
        return stageRecord.rollbackTarget;
      }
    }

    // 2. Previous stage in requiredStages ordering
    const idx = state.requiredStages.indexOf(failedStage);
    if (idx > 0) {
      return state.requiredStages[idx - 1] ?? null;
    }

    // 3. First stage — no predecessor, cannot roll back
    return null;
  }

  /**
   * Execute the rollback: transition failedStage → rolled_back, target → active.
   * Writes state transitions but does NOT persist to disk (caller handles persistence).
   */
  execute(ctx: {
    state: PipelineState;
    failedStage: StageId;
    target: StageId;
    reason: string;
  }): RollbackDecision {
    const { state, failedStage, target, reason } = ctx;

    const failedRecord = state.stages[failedStage];
    const targetRecord = state.stages[target];

    if (!failedRecord || !targetRecord) {
      return {
        executed: false,
        failedStage,
        targetStage: target,
        reason: `Stage record not found for '${!failedRecord ? failedStage : target}'`,
        blocked: false,
      };
    }

    // Transition failed stage → rolled_back
    assertTransition(failedRecord.status, 'rolled_back');
    failedRecord.status = 'rolled_back';
    failedRecord.completedAt = new Date().toISOString();

    // Transition target stage → active (rollback-guarded)
    assertTransition(targetRecord.status, 'active', { reason: 'rollback' });
    targetRecord.status = 'active';
    targetRecord.startedAt = new Date().toISOString();
    targetRecord.completedAt = undefined;

    // Update pipeline-level rollback count
    state.rollbackCount = (state.rollbackCount ?? 0) + 1;
    state.currentStage = target;
    state.updatedAt = new Date().toISOString();

    return {
      executed: true,
      failedStage,
      targetStage: target,
      reason,
      blocked: false,
    };
  }

  /**
   * Check if the pipeline has exhausted its rollback budget.
   */
  isExhausted(state: PipelineState): boolean {
    return (state.rollbackCount ?? 0) >= this.config.maxRollbacks;
  }

  /**
   * Mark the pipeline as repair-required (no more rollbacks available or first stage failed).
   * Mutates state in place; caller handles persistence.
   */
  markRepairRequired(state: PipelineState, reason: string): void {
    state.pipelineStatus = 'repair-required';
    state.updatedAt = new Date().toISOString();
  }
}
