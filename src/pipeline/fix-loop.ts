/**
 * Fix Loop Manager — AC-13.3 gate failure auto-fix state machine.
 *
 * When a gate fails, the pipeline enters fix_pending state. This module
 * manages the retry loop: dispatching fix tasks, re-evaluating gates,
 * and deciding whether to advance, retry, or trigger rollback.
 *
 * Data flow (architecture §3.3):
 *   gate failed → stage.status = fix_pending → fixLoop.initiate()
 *     → adapter.dispatchFixTask(prompt)
 *     → subagent_ended → fixLoop.onFixComplete()
 *       → gateEngine.evaluate()
 *         → passed: return 'advance'
 *         → failed & attempt < max: return 'retry'
 *         → failed & attempt >= max: return 'rollback'
 */

import type {
  StageId,
  GateVerdict,
  ArtifactRef,
} from '../types/index.js';

// ── Configuration ───────────────────────────────────────────────

export interface FixLoopConfig {
  /** Maximum number of fix attempts before triggering rollback. Default: 3. */
  maxRetries: number;
  /** Timeout for each fix task in milliseconds. Default: 600_000 (10 min). */
  fixTimeoutMs: number;
}

export const DEFAULT_FIX_LOOP_CONFIG: FixLoopConfig = {
  maxRetries: 3,
  fixTimeoutMs: 600_000,
};

// ── State ───────────────────────────────────────────────────────

export interface FixAttempt {
  attempt: number;
  triggeredAt: string;
  taskId: string | null;
  outcome: 'pending' | 'passed' | 'failed' | 'timeout';
}

export interface FixLoopState {
  stageId: StageId;
  pipelineId: string;
  gateFailureReason: string;
  artifactPaths: string[];
  attempts: FixAttempt[];
}

// ── Gate re-evaluation interface (decoupled from GateEngine import) ──

export interface GateEvaluator {
  evaluate(gateId: string, reviewBundles: Array<{ reviewer: string; role: string; conclusion: 'passed' | 'conditional' | 'rejected'; issues: string[] }>): { ok: boolean; value?: GateVerdict; error?: unknown };
}

// ── Fix Loop Manager ────────────────────────────────────────────

export type FixOutcome = 'advance' | 'retry' | 'rollback';

export class FixLoopManager {
  private readonly config: FixLoopConfig;

  constructor(config?: Partial<FixLoopConfig>) {
    this.config = { ...DEFAULT_FIX_LOOP_CONFIG, ...config };
  }

  /**
   * Initiate a fix loop when a gate fails.
   * Creates the initial state and records the first attempt as pending.
   */
  initiate(ctx: {
    pipelineId: string;
    stageId: StageId;
    gateVerdict: GateVerdict;
    artifacts: ArtifactRef[];
  }): FixLoopState {
    const failureReason = this.extractFailureReason(ctx.gateVerdict);
    const artifactPaths = ctx.artifacts.map((a) => a.path);

    const state: FixLoopState = {
      stageId: ctx.stageId,
      pipelineId: ctx.pipelineId,
      gateFailureReason: failureReason,
      artifactPaths,
      attempts: [
        {
          attempt: 1,
          triggeredAt: new Date().toISOString(),
          taskId: null,
          outcome: 'pending',
        },
      ],
    };

    return state;
  }

  /**
   * Handle fix task completion. Re-evaluates the gate and decides next action.
   *
   * @returns 'advance' if gate now passes, 'retry' if another attempt is available,
   *          'rollback' if max retries exhausted.
   */
  onFixComplete(
    state: FixLoopState,
    fixResult: { artifacts: ArtifactRef[]; passed: boolean },
  ): FixOutcome {
    const currentAttempt = state.attempts[state.attempts.length - 1];
    if (!currentAttempt) {
      return 'rollback';
    }

    if (fixResult.passed) {
      currentAttempt.outcome = 'passed';
      return 'advance';
    }

    currentAttempt.outcome = 'failed';

    // Check if we've exhausted retries
    if (state.attempts.length >= this.config.maxRetries) {
      return 'rollback';
    }

    // Queue next attempt
    state.attempts.push({
      attempt: state.attempts.length + 1,
      triggeredAt: new Date().toISOString(),
      taskId: null,
      outcome: 'pending',
    });

    return 'retry';
  }

  /**
   * Build a fix prompt containing failure context for the fix agent.
   * Includes: failure reason, artifact paths, attempt number, and guidance.
   */
  buildFixPrompt(state: FixLoopState): string {
    const attemptNum = state.attempts.length;
    const previousFailures = state.attempts
      .filter((a) => a.outcome === 'failed')
      .map((a) => `  - Attempt ${a.attempt} (${a.triggeredAt}): failed`)
      .join('\n');

    return [
      `## Gate Fix Required (Attempt ${attemptNum}/${this.config.maxRetries})`,
      '',
      `**Pipeline:** ${state.pipelineId}`,
      `**Stage:** ${state.stageId}`,
      '',
      `### Failure Reason`,
      state.gateFailureReason,
      '',
      `### Artifacts to Fix`,
      ...state.artifactPaths.map((p) => `- ${p}`),
      '',
      ...(previousFailures
        ? ['### Previous Attempts', previousFailures, '']
        : []),
      `### Instructions`,
      `Fix the issues described above. The gate will be re-evaluated after your changes.`,
      `If this is attempt ${attemptNum} of ${this.config.maxRetries}, ensure thorough fixes — no more retries after this.`,
    ].join('\n');
  }

  /**
   * Record the dispatched task ID for the current pending attempt.
   */
  recordTaskId(state: FixLoopState, taskId: string): void {
    const currentAttempt = state.attempts[state.attempts.length - 1];
    if (currentAttempt && currentAttempt.outcome === 'pending') {
      currentAttempt.taskId = taskId;
    }
  }

  /**
   * Check if the fix loop is exhausted (all retries used).
   */
  isExhausted(state: FixLoopState): boolean {
    const lastAttempt = state.attempts[state.attempts.length - 1];
    return state.attempts.length >= this.config.maxRetries &&
      lastAttempt?.outcome !== 'pending';
  }

  /**
   * Get the current attempt number.
   */
  getCurrentAttempt(state: FixLoopState): number {
    return state.attempts.length;
  }

  // ── Private ───────────────────────────────────────────────────

  private extractFailureReason(verdict: GateVerdict): string {
    const parts: string[] = [];

    if (verdict.blockers.length > 0) {
      parts.push('Blockers:');
      for (const b of verdict.blockers) {
        parts.push(`  - [${b.owner}] ${b.item}`);
      }
    }

    if (verdict.reviewBundles.length > 0) {
      const rejected = verdict.reviewBundles.filter((r) => r.conclusion === 'rejected');
      if (rejected.length > 0) {
        parts.push('Rejected reviews:');
        for (const r of rejected) {
          parts.push(`  - ${r.reviewer} (${r.role}): ${r.issues.join('; ')}`);
        }
      }
    }

    if (parts.length === 0) {
      parts.push(`Gate '${verdict.gateId}' concluded: ${verdict.conclusion}`);
    }

    return parts.join('\n');
  }
}
