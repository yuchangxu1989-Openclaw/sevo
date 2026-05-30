/**
 * FR-D01: Stage Transition Auto-Trigger.
 *
 * Automatically triggers gate checks when PipelineEngine transitions
 * between stages. On rejection, generates structured fixTasks and
 * emits 'gate-auto-triggered' event.
 *
 * (spec §FR-D01, AC-D01.1 through AC-D01.7)
 */

import type { StageId, ArtifactRef, RuleVerdict } from '../types/index.js';
import type { GateEngine } from '../gate/gate-engine.js';
import type {
  FixTask,
  FixTaskSeverity,
  GateAutoTriggerRecord,
  TransitionGateBinding,
} from './types.js';

/** Result of an auto-triggered gate evaluation. */
export interface AutoTriggerResult {
  /** Whether the gate passed. */
  passed: boolean;
  /** The full trigger record (AC-D01.6). */
  record: GateAutoTriggerRecord;
}

/**
 * StageTransitionTrigger — evaluates gates at stage transition points.
 *
 * AC-D01.1: Automatically triggers gate when stage transitions.
 * AC-D01.2: Reuses FR-23/FR-25 evaluator chain via GateEngine.
 * AC-D01.5: Does not change gate pass/block semantics.
 */
export class StageTransitionTrigger {
  private readonly gateEngine: GateEngine;
  private readonly bindings: TransitionGateBinding[];

  constructor(gateEngine: GateEngine, bindings: TransitionGateBinding[]) {
    this.gateEngine = gateEngine;
    this.bindings = bindings;
  }

  /**
   * Check if a transition point has a bound gate.
   */
  hasGateBinding(fromStage: StageId, toStage: StageId): boolean {
    return this.bindings.some(
      (b) => b.fromStage === fromStage && b.toStage === toStage,
    );
  }

  /**
   * Get the gate type for a transition point.
   */
  getGateType(fromStage: StageId, toStage: StageId): string | undefined {
    const binding = this.bindings.find(
      (b) => b.fromStage === fromStage && b.toStage === toStage,
    );
    return binding?.gateType;
  }

  /**
   * Evaluate the gate at a transition point.
   *
   * AC-D01.1: Auto-triggers without manual call.
   * AC-D01.2: Reuses GateEngine evaluation (FR-23/FR-25).
   * AC-D01.3: Generates fixTasks on rejection.
   * AC-D01.5: Same pass/block semantics as manual gate.
   * AC-D01.6: Returns full record for audit trail.
   */
  evaluate(
    fromStage: StageId,
    toStage: StageId,
    artifacts: ArtifactRef[],
  ): AutoTriggerResult | null {
    if (fromStage === 'spec-review-gate') {
      throw new Error('spec-review-gate requires asynchronous LLM evaluation; use evaluateAsync');
    }
    const binding = this.bindings.find(
      (b) => b.fromStage === fromStage && b.toStage === toStage,
    );

    if (!binding) {
      return null; // No gate bound to this transition
    }

    // AC-D01.2: Reuse GateEngine evaluation chain
    const verdict: RuleVerdict = this.gateEngine.evaluateGate(fromStage, artifacts);

    // AC-D01.3: Generate fixTasks on rejection
    const fixTasks: FixTask[] = verdict.pass
      ? []
      : this.generateFixTasks(verdict, fromStage);

    const record: GateAutoTriggerRecord = {
      triggeredAt: new Date().toISOString(),
      transitionPoint: `${fromStage}→${toStage}`,
      fromStage,
      toStage,
      gateType: binding.gateType,
      passed: verdict.pass,
      fixTasks,
      score: verdict.score,
      blockers: verdict.blockers,
    };

    return {
      passed: verdict.pass,
      record,
    };
  }

  /** Async variant required by spec-review-gate LLM semantic rules. */
  async evaluateAsync(
    fromStage: StageId,
    toStage: StageId,
    artifacts: ArtifactRef[],
  ): Promise<AutoTriggerResult | null> {
    const binding = this.bindings.find(
      (b) => b.fromStage === fromStage && b.toStage === toStage,
    );

    if (!binding) {
      return null;
    }

    const verdict: RuleVerdict = await this.gateEngine.evaluateGateAsync(fromStage, artifacts);
    const fixTasks: FixTask[] = verdict.pass
      ? []
      : this.generateFixTasks(verdict, fromStage);

    const record: GateAutoTriggerRecord = {
      triggeredAt: new Date().toISOString(),
      transitionPoint: `${fromStage}→${toStage}`,
      fromStage,
      toStage,
      gateType: binding.gateType,
      passed: verdict.pass,
      fixTasks,
      score: verdict.score,
      blockers: verdict.blockers,
    };

    return {
      passed: verdict.pass,
      record,
    };
  }

  /**
   * Generate structured fix tasks from gate verdict blockers (AC-D01.3).
   * Each blocker is mapped to a fix task with frId, acId, description, and severity.
   */
  private generateFixTasks(verdict: RuleVerdict, stageId: StageId): FixTask[] {
    return verdict.blockers.map((blocker, index) => {
      const severity = this.inferSeverity(verdict.score, index);
      return {
        frId: this.inferFrId(stageId, blocker),
        acId: this.inferAcId(blocker, index),
        description: blocker,
        severity,
      };
    });
  }

  /**
   * Infer severity from gate score and blocker position.
   * Lower scores and earlier blockers get higher severity.
   */
  private inferSeverity(score: number, index: number): FixTaskSeverity {
    if (score < 0.3) return 'P0';
    if (score < 0.7 || index === 0) return 'P1';
    return 'P2';
  }

  /**
   * Infer FR ID from stage and blocker text.
   * Maps stage to the most likely FR that owns it.
   */
  private inferFrId(stageId: StageId, _blocker: string): string {
    const stageToFr: Partial<Record<StageId, string>> = {
      'implement': 'FR-05',
      'review': 'FR-06',
      'deploy': 'FR-09',
      'verify': 'FR-10',
      'spec': 'FR-01',
      'regression': 'FR-07',
    };
    return stageToFr[stageId] ?? `FR-${stageId}`;
  }

  /**
   * Infer AC ID from blocker text and index.
   */
  private inferAcId(blocker: string, index: number): string {
    // Try to extract AC reference from blocker text
    const acMatch = blocker.match(/AC[-_]?(\d+[\.\d]*)/i);
    if (acMatch) return `AC-${acMatch[1]}`;
    return `AC-auto-${index + 1}`;
  }
}
