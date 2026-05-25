/**
 * Task Orchestrator — coordinates StageRouter + GateEngine + Ledger
 * into a complete pipeline execution flow.
 * (arc42 §5, spec §FR-01/FR-02/FR-04)
 */

import type { ArtifactRef, ClarificationSummary, GateVerdict, RuleVerdict, StageId } from '../types/index.js';
import { StageRouter } from '../router/stage-router.js';
import { GateEngine } from '../gate/gate-engine.js';
import { createSpecReviewGateEngine } from '../gate/default-spec-review-gate-engine.js';
import type { SemanticRuleOptions } from '../gate/rules/semantic-rule-utils.js';
import { OrchestratorEmitter } from './orchestrator-events.js';
import { PipelineRun, type PipelineStatus, type TaskPayload } from './pipeline-run.js';
import type { ClarificationCoordinator } from '../clarification/index.js';
import type { ClarificationRecord } from '../clarification/clarification-record.js';
import { BlockingLevel, Status } from '../clarification/clarification-types.js';

export interface OrchestratorOptions {
  /** Maximum retained runs. When exceeded, oldest completed/failed runs are evicted. */
  maxRuns?: number;
  /** Optional ClarificationCoordinator for FR-11 proactive clarification. */
  clarificationCoordinator?: ClarificationCoordinator;
  /** Options forwarded to default spec-review-gate semantic LLM rules. Ignored when gateEngine is provided. */
  specReviewGateRuleOptions?: SemanticRuleOptions;
}

export class TaskOrchestrator {
  private readonly router: StageRouter;
  private readonly gateEngine: GateEngine;
  private readonly runs: Map<string, PipelineRun> = new Map();
  private readonly maxRuns: number | undefined;
  private readonly clarificationCoordinator?: ClarificationCoordinator;
  readonly events: OrchestratorEmitter;

  constructor(router?: StageRouter, gateEngine?: GateEngine, options?: OrchestratorOptions) {
    this.router = router ?? new StageRouter();
    this.gateEngine = gateEngine ?? createSpecReviewGateEngine(options?.specReviewGateRuleOptions);
    this.events = new OrchestratorEmitter();
    this.maxRuns = options?.maxRuns;
    this.clarificationCoordinator = options?.clarificationCoordinator;
  }

  /**
   * Start a new pipeline run.
   */
  startPipeline(payload: TaskPayload): PipelineRun {
    const run = new PipelineRun(payload);
    this.runs.set(run.runId, run);
    this.evictIfNeeded();

    this.events.emit('pipeline:started', {
      runId: run.runId,
      initialStage: payload.initialStage,
      timestamp: run.startedAt,
    });

    this.events.emit('stage:entered', {
      runId: run.runId,
      stage: payload.initialStage,
      timestamp: run.startedAt,
    });

    return run;
  }

  /**
   * Submit artifacts for the current stage of a pipeline run.
   */
  submitArtifacts(runId: string, artifacts: ArtifactRef[]): void {
    const run = this.getRun(runId);
    const currentStage = run.getCurrentStage();
    run.addArtifacts(currentStage, artifacts);
  }

  /**
   * Synchronous compatibility API for non-LLM gate paths.
   * spec-review-gate uses async semantic rules, so callers must use evaluateAndAdvanceAsync there.
   */
  evaluateAndAdvance(runId: string): { verdict: GateVerdict; nextStage: StageId | null } {
    const run = this.getRun(runId);
    const currentStage = run.getCurrentStage();
    if (currentStage === 'spec-review-gate') {
      throw new Error('spec-review-gate requires asynchronous LLM evaluation; use evaluateAndAdvanceAsync');
    }
    const artifacts = [...run.getArtifacts(currentStage)];
    const ruleVerdict = this.gateEngine.evaluateGate(currentStage, artifacts);
    return this.applyRuleVerdict(runId, currentStage, ruleVerdict);
  }

  /** Async variant required by LLM semantic rules. */
  async evaluateAndAdvanceAsync(runId: string): Promise<{ verdict: GateVerdict; nextStage: StageId | null }> {
    const run = this.getRun(runId);
    const currentStage = run.getCurrentStage();
    const artifacts = [...run.getArtifacts(currentStage)];

    const ruleVerdict = await this.gateEngine.evaluateGateAsync(currentStage, artifacts);
    return this.applyRuleVerdict(runId, currentStage, ruleVerdict);
  }

  private applyRuleVerdict(runId: string, currentStage: StageId, ruleVerdict: RuleVerdict): { verdict: GateVerdict; nextStage: StageId | null } {
    const run = this.getRun(runId);

    // Convert RuleVerdict to GateVerdict
    const gateVerdict: GateVerdict = {
      gateId: `${currentStage}-gate`,
      conclusion: ruleVerdict.pass ? 'passed' : 'rejected',
      blockers: ruleVerdict.blockers.map((b) => ({ item: b, owner: 'system' })),
      reviewBundles: [],
    };

    run.recordVerdict(currentStage, gateVerdict);

    this.events.emit('gate:evaluated', {
      runId,
      stage: currentStage,
      verdict: gateVerdict,
      timestamp: new Date().toISOString(),
    });

    // Use router to determine next stage
    const nextStage = this.router.advance(currentStage, gateVerdict);

    if (nextStage !== null) {
      run.advanceTo(nextStage, gateVerdict);

      this.events.emit('stage:advanced', {
        runId,
        fromStage: currentStage,
        toStage: nextStage,
        timestamp: new Date().toISOString(),
      });

      this.events.emit('stage:entered', {
        runId,
        stage: nextStage,
        timestamp: new Date().toISOString(),
      });

      // Check if this is the terminal stage (no outgoing edges)
      const outgoing = this.router.getGraph().getOutgoing(nextStage);
      if (outgoing.length === 0) {
        run.markCompleted();
        this.events.emit('pipeline:completed', {
          runId,
          finalStage: nextStage,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return { verdict: gateVerdict, nextStage };
  }

  /**
   * Get the current status of a pipeline run.
   */
  getPipelineStatus(runId: string): PipelineStatus {
    const run = this.getRun(runId);
    return run.getStatus();
  }

  /**
   * Mark a pipeline as failed.
   */
  failPipeline(runId: string, reason: string): void {
    const run = this.getRun(runId);
    run.markFailed(reason);

    this.events.emit('pipeline:failed', {
      runId,
      stage: run.getCurrentStage(),
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Remove a completed or failed run from memory.
   * Returns true if the run was removed, false if it's still running or not found.
   */
  cleanupRun(runId: string): boolean {
    const run = this.runs.get(runId);
    if (!run) return false;
    if (!run.isCompleted() && !run.isFailed()) return false;
    this.runs.delete(runId);
    return true;
  }

  /** Get runtime GateEngine. */
  getGateEngine(): GateEngine {
    return this.gateEngine;
  }

  /**
   * Remove all completed/failed runs from memory.
   * Returns the number of runs removed.
   */
  cleanupCompleted(): number {
    let count = 0;
    for (const [id, run] of this.runs) {
      if (run.isCompleted() || run.isFailed()) {
        this.runs.delete(id);
        count++;
      }
    }
    return count;
  }

  /**
   * Scan stage artifacts for ambiguity, open clarification records,
   * and dispatch them. Returns opened records (empty if no coordinator or no findings).
   */
  scanClarifications(runId: string): ClarificationRecord[] {
    if (!this.clarificationCoordinator) return [];
    const run = this.getRun(runId);
    const stage = run.getCurrentStage();
    const artifacts = [...run.getArtifacts(stage)];
    const stageRecord = this.buildStageRecord(run);

    const findings = this.clarificationCoordinator.scan(stageRecord, artifacts);
    if (findings.length === 0) return [];

    const records = this.clarificationCoordinator.open(findings);
    for (const record of records) {
      this.clarificationCoordinator.dispatch(record);
      this.events.emit('clarification:opened', {
        runId,
        stage,
        clarificationId: record.clarificationId,
        blocking: record.blockingLevel === BlockingLevel.BLOCKING,
        timestamp: new Date().toISOString(),
      });
    }
    return records;
  }

  /**
   * Check whether the current stage is blocked by outstanding clarifications.
   */
  hasBlockingClarifications(runId: string): boolean {
    if (!this.clarificationCoordinator) return false;
    const run = this.getRun(runId);
    const stage = run.getCurrentStage();
    const records = this.clarificationCoordinator.listRecords();
    return records.some(
      (r) =>
        r.stageId === stage &&
        r.blockingLevel === BlockingLevel.BLOCKING &&
        r.status !== Status.SETTLED &&
        r.status !== Status.EXPIRED,
    );
  }

  /**
   * Build a ClarificationSummary for the current stage of a run.
   */
  getClarificationSummary(runId: string): ClarificationSummary | undefined {
    if (!this.clarificationCoordinator) return undefined;
    const run = this.getRun(runId);
    const stage = run.getCurrentStage();
    const records = this.clarificationCoordinator.listRecords().filter(
      (r) => r.stageId === stage,
    );
    if (records.length === 0) return undefined;

    let open = 0;
    let resolved = 0;
    let settled = 0;
    let blockingOpen = 0;
    for (const r of records) {
      if (r.status === Status.OPEN) {
        open++;
        if (r.blockingLevel === BlockingLevel.BLOCKING) blockingOpen++;
      } else if (r.status === Status.RESOLVED) {
        resolved++;
      } else if (r.status === Status.SETTLED) {
        settled++;
      }
    }
    return { open, resolved, settled, blockingOpen };
  }

  /**
   * Notify the orchestrator that a clarification has been settled.
   * Emits event and checks if stage can resume.
   */
  onClarificationSettled(runId: string, clarificationId: string): void {
    if (!this.clarificationCoordinator) return;
    const run = this.getRun(runId);
    const stage = run.getCurrentStage();
    const record = this.clarificationCoordinator.getRecord(clarificationId);
    const resumed = record?.stageId === stage && !this.hasBlockingClarifications(runId);

    this.events.emit('clarification:settled', {
      runId,
      stage,
      clarificationId,
      resumed,
      timestamp: new Date().toISOString(),
    });
  }

  private buildStageRecord(run: PipelineRun): import('../types/index.js').StageRecord {
    const stage = run.getCurrentStage();
    return {
      stageId: stage,
      status: 'active',
      attempt: 1,
      artifacts: [...run.getArtifacts(stage)],
    };
  }

  private getRun(runId: string): PipelineRun {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Pipeline run not found: ${runId}`);
    }
    return run;
  }

  /**
   * Auto-evict oldest completed/failed runs when maxRuns is exceeded.
   */
  private evictIfNeeded(): void {
    if (this.maxRuns === undefined) return;
    while (this.runs.size > this.maxRuns) {
      let oldestId: string | undefined;
      let oldestTime = Infinity;
      for (const [id, run] of this.runs) {
        if (run.isCompleted() || run.isFailed()) {
          const t = new Date(run.startedAt).getTime();
          if (t < oldestTime) {
            oldestTime = t;
            oldestId = id;
          }
        }
      }
      if (oldestId) {
        this.runs.delete(oldestId);
      } else {
        break; // no evictable runs left
      }
    }
  }
}
