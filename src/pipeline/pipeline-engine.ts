/**
 * Pipeline Engine — core orchestrator.
 *
 * Responsibilities:
 *  - Create pipelines from RoutingResult
 *  - Advance stages via advance()
 *  - Persist state (write-tmp + rename, §8.5)
 *  - Append events (events.jsonl, append-only)
 *  - Handle parallel branches (delegate to parallel-branch)
 */

import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  StageId,
  StageRecord,
  StageResult,
  StageTransition,
  PipelineState,
  PipelineEvent,
  RoutingResult,
  ArtifactRef,
  RuleVerdict,
  TaskLevel,
} from '../types/index.js';
import { appendJsonLineWithRotation } from '../utils/event-log.js';
import {
  BlockingLevel,
  ClarificationType,
  ResolutionSink,
  type ClarificationCoordinator,
  type ClarificationRecord,
  AmbiguityDetector,
  type AmbiguitySignal,
} from '../clarification/index.js';
import {
  CLARIFICATION_SCANNABLE_STAGES,
  BLOCK_REASONS,
  STAGE_IDS,
} from '../constants.js';
import { GateEngine } from '../gate/gate-engine.js';
import { createSpecReviewGateEngine } from '../gate/default-spec-review-gate-engine.js';
import type { SemanticRuleOptions } from '../gate/rules/semantic-rule-utils.js';
import { route } from '../router/router.js';
import { EventLedger, type LedgerEvent } from './ledger.js';
import type { ClarificationScanResult } from '../stages/spec-stage.js';

import { assertTransition, isTerminal, canActivate } from './stage-machine.js';
import {
  getActivatableStages,
  arePrerequisitesMet,
  shouldBlockImplement,
} from './parallel-branch.js';
import {
  FixLoopManager,
  type FixLoopState,
  type FixOutcome,
  DEFAULT_FIX_LOOP_CONFIG,
} from './fix-loop.js';
import {
  StageRollback,
  DEFAULT_ROLLBACK_CONFIG,
  type RollbackConfig,
  type RollbackDecision,
} from './stage-rollback.js';

// ─── Persistence helpers (§8.5 constraints) ───

/** Atomic write: write to tmp file then rename (idempotent, no half-writes). */
function atomicWriteJson(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = filePath + '.tmp.' + randomUUID().slice(0, 8);
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

/** Append a single event line (O_APPEND semantics). */
function appendEvent(eventsPath: string, event: PipelineEvent): void {
  appendJsonLineWithRotation(eventsPath, event);
}

// ─── Path helpers ───

function pipelineDir(basePath: string, pipelineId: string): string {
  return path.join(basePath, 'pipelines', pipelineId);
}

function statePath(basePath: string, pipelineId: string): string {
  return path.join(pipelineDir(basePath, pipelineId), 'state.json');
}

function eventsPath(basePath: string, pipelineId: string): string {
  return path.join(pipelineDir(basePath, pipelineId), 'events.jsonl');
}

// ─── Pipeline Engine ───

export interface PipelineEngineOptions {
  clarificationCoordinator?: ClarificationCoordinator;
  /** FR-11: AmbiguityDetector for explicit spec ambiguity scanning at pipeline entry. */
  ambiguityDetector?: AmbiguityDetector;
}

export class PipelineEngine {
  private readonly basePath: string;
  private readonly clarificationCoordinator?: ClarificationCoordinator;
  private readonly ambiguityDetector: AmbiguityDetector;

  constructor(basePath: string, options?: PipelineEngineOptions) {
    this.basePath = basePath;
    this.clarificationCoordinator = options?.clarificationCoordinator;
    this.ambiguityDetector = options?.ambiguityDetector ?? new AmbiguityDetector();
  }

  /** Create a new pipeline from a routing result. */
  create(routing: RoutingResult): PipelineState {
    const pipelineId = randomUUID();
    const now = new Date().toISOString();

    const stages = {} as Record<StageId, StageRecord>;
    for (const sid of routing.requiredStages) {
      stages[sid] = {
        stageId: sid,
        status: 'pending',
        artifacts: [],
      };
    }

    const state: PipelineState = {
      pipelineId,
      taskId: routing.taskId,
      level: routing.level,
      requiredStages: routing.requiredStages,
      stages,
      currentStage: null,
      createdAt: now,
      updatedAt: now,
    };

    // Persist
    atomicWriteJson(statePath(this.basePath, pipelineId), state);
    const firstStage = routing.requiredStages[0] ?? STAGE_IDS.SPEC;
    this.emitEvent(pipelineId, firstStage, 'pipeline_created', {
      taskId: routing.taskId,
      level: routing.level,
    });

    // Auto-activate first eligible stages
    this.activateNext(state);

    return state;
  }

  /** Load pipeline state from disk. */
  load(pipelineId: string): PipelineState {
    const fp = statePath(this.basePath, pipelineId);
    const raw = fs.readFileSync(fp, 'utf-8');
    return JSON.parse(raw) as PipelineState;
  }

  /**
   * Advance a pipeline: mark current stage result, then activate next eligible stages.
   * This is the primary API for driving the pipeline forward.
   */
  advance(pipelineId: string, stageResult: StageResult): StageTransition {
    const state = this.load(pipelineId);
    const { stageId, outcome, artifacts, failureReason } = stageResult;

    const record = state.stages[stageId];
    if (!record) {
      throw new Error(`Stage '${stageId}' not found in pipeline '${pipelineId}'`);
    }

    this.registerArtifacts(pipelineId, stageId, record, artifacts);

    if (outcome === 'failed') {
      return this.handleFailedStage(state, pipelineId, stageId, record, artifacts, failureReason);
    }

    const clarificationBlocked = this.scanClarifications(state, stageId);
    const refreshedRecord = state.stages[stageId];

    if (clarificationBlocked) {
      refreshedRecord.completedAt = undefined;
      state.updatedAt = new Date().toISOString();
      atomicWriteJson(statePath(this.basePath, pipelineId), state);
      return { pipelineId, fromStage: stageId, toStage: stageId, status: refreshedRecord.status, artifacts, nextTriggered: false };
    }

    return this.handlePassedStage(state, pipelineId, stageId, refreshedRecord, artifacts, outcome);
  }

  /**
   * Activate a specific stage (e.g. for retry from failed/repair-required).
   */
  activate(pipelineId: string, stageId: StageId): void {
    const state = this.load(pipelineId);
    const record = state.stages[stageId];
    if (!record) throw new Error(`Stage '${stageId}' not in pipeline`);
    if (!canActivate(record.status)) {
      throw new Error(`Cannot activate stage '${stageId}' from status '${record.status}'`);
    }

    assertTransition(record.status, 'active');
    record.status = 'active';
    record.startedAt = new Date().toISOString();
    state.currentStage = stageId;
    state.updatedAt = new Date().toISOString();

    atomicWriteJson(statePath(this.basePath, pipelineId), state);
    this.emitEvent(pipelineId, stageId, 'stage_activated', {});
  }

  resolveClarification(pipelineId: string, clarificationId: string): StageTransition {
    if (!this.clarificationCoordinator) {
      throw new Error('ClarificationCoordinator is not configured');
    }

    const state = this.load(pipelineId);
    const record = this.clarificationCoordinator.getRecord(clarificationId);
    if (!record) {
      throw new Error(`Clarification '${clarificationId}' not found`);
    }

    const stage = state.stages[record.stageId];
    if (!stage) {
      throw new Error(`Stage '${record.stageId}' not found in pipeline '${pipelineId}'`);
    }

    this.emitEvent(pipelineId, record.stageId, 'clarification_resolved', {
      clarificationId, responderId: record.responder, resolvedAt: record.resolvedAt,
    });

    const settledArtifacts = this.settleClarificationArtifacts(
      pipelineId, record.stageId, clarificationId, stage,
    );

    this.tryUnblockClarification(pipelineId, record, stage, clarificationId);

    stage.clarificationSummary = this.buildClarificationSummary(record.stageId);
    state.updatedAt = new Date().toISOString();
    atomicWriteJson(statePath(this.basePath, pipelineId), state);

    return {
      pipelineId, fromStage: record.stageId, toStage: record.stageId,
      status: stage.status, artifacts: settledArtifacts,
    };
  }

  /**
   * Check if the pipeline is fully complete (all required stages terminal).
   */
  isComplete(pipelineId: string): boolean {
    const state = this.load(pipelineId);
    return state.requiredStages.every((s: StageId) => isTerminal(state.stages[s].status));
  }

  /**
   * AC-13.4: Roll back a failed stage to a prior stage for re-execution.
   *
   * Called when fix-loop retries are exhausted. Resolves the rollback target,
   * transitions states and emits repair-required advisories when exhausted.
   */
  rollback(pipelineId: string, failedStage: StageId, reason: string): RollbackDecision {
    const state = this.load(pipelineId);
    const rollback = new StageRollback();

    // Check if pipeline-level rollback budget is exhausted
    if (rollback.isExhausted(state)) {
      rollback.markRepairRequired(state, `Rollback budget exhausted (max ${DEFAULT_ROLLBACK_CONFIG.maxRollbacks})`);
      this.emitEvent(pipelineId, failedStage, 'stage_rolled_back', {
        outcome: 'repair-required',
        reason: 'rollback_budget_exhausted',
        rollbackCount: state.rollbackCount ?? 0,
      });
      atomicWriteJson(statePath(this.basePath, pipelineId), state);
      return {
        executed: false,
        failedStage,
        targetStage: null,
        reason: 'Rollback budget exhausted — repair-required advisory recorded',
        halted: false,
      };
    }

    // Resolve rollback target
    const target = rollback.resolveTarget(state, failedStage);

    // First stage cannot roll back — record repair-required advisory.
    if (target === null) {
      rollback.markRepairRequired(state, `First stage '${failedStage}' cannot roll back`);
      this.emitEvent(pipelineId, failedStage, 'stage_rolled_back', {
        outcome: 'repair-required',
        reason: 'no_rollback_target',
        failedStage,
      });
      atomicWriteJson(statePath(this.basePath, pipelineId), state);
      return {
        executed: false,
        failedStage,
        targetStage: null,
        reason: `First stage '${failedStage}' has no rollback target — repair-required advisory recorded`,
        halted: false,
      };
    }

    // Execute the rollback
    const decision = rollback.execute({ state, failedStage, target, reason });

    // Emit rollback event
    this.emitEvent(pipelineId, failedStage, 'stage_rolled_back', {
      outcome: 'executed',
      failedStage,
      targetStage: target,
      reason,
      rollbackCount: state.rollbackCount,
    });

    // Persist
    atomicWriteJson(statePath(this.basePath, pipelineId), state);

    return decision;
  }

  // ─── Internal ───

  private registerArtifacts(
    pipelineId: string, stageId: StageId, record: StageRecord, artifacts: ArtifactRef[],
  ): void {
    for (const art of artifacts) {
      record.artifacts.push(art);
      this.emitEvent(pipelineId, stageId, 'artifact_registered', {
        artifactId: art.id, type: art.type, path: art.path,
      });
    }
  }

  private handleFailedStage(
    state: PipelineState, pipelineId: string, stageId: StageId,
    record: StageRecord, artifacts: ArtifactRef[], failureReason?: string,
  ): StageTransition {
    // AC-13.3: Gate stages enter fix_pending instead of direct failed
    if (this.isGateStage(stageId)) {
      return this.enterFixPending(state, pipelineId, stageId, record, artifacts, failureReason);
    }

    // 原则：SEVO 流水线永远往前走。stage 失败不是终态——不再写 'failed' 终结
    // 该 stage，而是转入 fix_pending 修复循环（与 gate stage 的 enterFixPending
    // 一致），使下一次 advance 重新选中它进入重试。唯一合法终态是 passed/skipped
    // 或用户主动 cancel。
    return this.enterFixPending(state, pipelineId, stageId, record, artifacts, failureReason);
  }

  /**
   * AC-13.3: Transition a gate stage to fix_pending and initiate the fix loop.
   */
  private enterFixPending(
    state: PipelineState, pipelineId: string, stageId: StageId,
    record: StageRecord, artifacts: ArtifactRef[], failureReason?: string,
  ): StageTransition {
    assertTransition(record.status, 'fix_pending');
    record.status = 'fix_pending';
    if (failureReason) record.failureReason = failureReason;
    record.fixAttempts = 1;
    state.updatedAt = new Date().toISOString();

    this.emitEvent(pipelineId, stageId, 'fix_attempt', {
      attempt: 1,
      failureReason: failureReason ?? 'gate evaluation failed',
      taskId: null,
      outcome: 'pending',
    });

    atomicWriteJson(statePath(this.basePath, pipelineId), state);
    return { pipelineId, fromStage: stageId, toStage: stageId, status: 'fix_pending', artifacts, nextTriggered: false };
  }

  /**
   * AC-13.3: Handle completion of a fix task. Re-evaluates and decides next action.
   * Called by advance-on-complete when a fix subagent finishes.
   */
  handleFixComplete(
    pipelineId: string,
    stageId: StageId,
    fixResult: { passed: boolean; artifacts: ArtifactRef[] },
    fixLoopManager?: FixLoopManager,
  ): { outcome: FixOutcome; transition: StageTransition } {
    const state = this.load(pipelineId);
    const record = state.stages[stageId];
    if (!record) throw new Error(`Stage '${stageId}' not found in pipeline '${pipelineId}'`);
    if (record.status !== 'fix_pending') {
      throw new Error(`handleFixComplete called on stage '${stageId}' with status '${record.status}', expected 'fix_pending'`);
    }

    const manager = fixLoopManager ?? new FixLoopManager();
    const currentAttempt = record.fixAttempts ?? 1;

    // Build a minimal FixLoopState for the manager
    const loopState: FixLoopState = {
      stageId,
      pipelineId,
      gateFailureReason: record.failureReason ?? 'unknown',
      artifactPaths: record.artifacts.map((a) => a.path),
      attempts: Array.from({ length: currentAttempt }, (_, i) => ({
        attempt: i + 1,
        triggeredAt: new Date().toISOString(),
        taskId: null,
        outcome: i < currentAttempt - 1 ? 'failed' as const : 'pending' as const,
      })),
    };

    const outcome = manager.onFixComplete(loopState, fixResult);

    if (outcome === 'advance') {
      // Fix succeeded — transition back to active, then advance normally
      assertTransition(record.status, 'active');
      record.status = 'active';
      record.fixAttempts = undefined;
      record.failureReason = undefined;
      state.updatedAt = new Date().toISOString();

      this.emitEvent(pipelineId, stageId, 'fix_attempt', {
        attempt: currentAttempt,
        outcome: 'passed',
        taskId: null,
      });

      atomicWriteJson(statePath(this.basePath, pipelineId), state);

      // Now advance the stage as passed
      const transition = this.advance(pipelineId, {
        stageId,
        outcome: 'passed',
        artifacts: fixResult.artifacts,
      });
      return { outcome, transition };
    }

    if (outcome === 'retry') {
      // Still in fix_pending, increment attempt counter
      record.fixAttempts = currentAttempt + 1;
      state.updatedAt = new Date().toISOString();

      this.emitEvent(pipelineId, stageId, 'fix_attempt', {
        attempt: currentAttempt,
        outcome: 'failed',
        taskId: null,
        nextAttempt: currentAttempt + 1,
      });

      atomicWriteJson(statePath(this.basePath, pipelineId), state);
      return {
        outcome,
        transition: { pipelineId, fromStage: stageId, toStage: stageId, status: 'fix_pending', artifacts: fixResult.artifacts, nextTriggered: false },
      };
    }

    // outcome === 'rollback' — delegate to engine.rollback() for full rollback logic
    this.emitEvent(pipelineId, stageId, 'fix_loop_exhausted', {
      attempts: currentAttempt,
      failureReason: record.failureReason,
    });

    const rollbackDecision = this.rollback(
      pipelineId,
      stageId,
      `Fix loop exhausted after ${currentAttempt} attempts: ${record.failureReason ?? 'unknown'}`,
    );

    // Reload state after rollback mutated and persisted it
    const updatedState = this.load(pipelineId);
    const updatedRecord = updatedState.stages[stageId];
    const toStage = rollbackDecision.targetStage ?? stageId;

    return {
      outcome,
      transition: {
        pipelineId,
        fromStage: stageId,
        toStage,
        status: updatedRecord?.status ?? 'rolled_back',
        artifacts: fixResult.artifacts,
        nextTriggered: rollbackDecision.executed,
      },
    };
  }

  /** Check if a stage is a gate stage (contains 'gate' in its ID). */
  private isGateStage(stageId: StageId): boolean {
    return stageId.includes('gate');
  }

  private handlePassedStage(
    state: PipelineState, pipelineId: string, stageId: StageId,
    record: StageRecord, artifacts: ArtifactRef[], outcome: string,
  ): StageTransition {
    assertTransition(record.status, 'passed');
    record.status = 'passed';
    record.completedAt = new Date().toISOString();
    state.updatedAt = new Date().toISOString();

    this.emitEvent(pipelineId, stageId, 'stage_completed', {
      outcome, artifacts: artifacts.map((a: ArtifactRef) => a.id),
    });

    atomicWriteJson(statePath(this.basePath, pipelineId), state);

    const activated = this.activateNext(state);
    const firstActivated = activated[0];
    const toStage: StageId = firstActivated !== undefined ? firstActivated : stageId;
    const toRecord = state.stages[toStage];

    const allDone = state.requiredStages.every((s: StageId) => isTerminal(state.stages[s].status));
    if (allDone) {
      this.emitEvent(pipelineId, stageId, 'pipeline_completed', { pipelineId });
    }

    return {
      pipelineId, fromStage: stageId, toStage,
      status: toRecord?.status ?? record.status, artifacts,
      nextTriggered: activated.length > 0,
    };
  }

  private settleClarificationArtifacts(
    pipelineId: string, stageId: StageId, clarificationId: string, stage: StageRecord,
  ): ArtifactRef[] {
    const settledArtifacts = this.clarificationCoordinator!.applyResolution(clarificationId);
    stage.clarificationRefs = [...(stage.clarificationRefs ?? []), ...settledArtifacts];
    stage.clarificationSummary = this.buildClarificationSummary(stageId);

    this.emitEvent(pipelineId, stageId, 'clarification_settled', {
      clarificationId, artifacts: settledArtifacts.map((a) => a.id),
    });
    for (const artifact of settledArtifacts) {
      this.emitEvent(pipelineId, stageId, 'artifact_registered', {
        artifactId: artifact.id, type: artifact.type, path: artifact.path,
      });
    }
    return settledArtifacts;
  }

  private tryUnblockClarification(
    pipelineId: string, record: ClarificationRecord, stage: StageRecord, clarificationId: string,
  ): void {
    const outstandingBlocking = this.clarificationCoordinator!.listRecords().some(
      (item) =>
        item.stageId === record.stageId &&
        item.stageAttempt === record.stageAttempt &&
        item.blockingLevel === BlockingLevel.BLOCKING &&
        item.status !== 'settled',
    );

    if (!outstandingBlocking && (stage.status === 'clarification-blocked' || stage.status === 'fix_pending')) {
      stage.status = 'active';
      stage.blockReason = undefined;
      stage.failureReason = undefined;
      stage.completedAt = undefined;
      this.emitEvent(pipelineId, record.stageId, 'stage_activated', {
        advisoryResolved: true, clarificationId,
      });
    }
  }

  /**
   * Scan for pending stages whose prerequisites are met, activate them.
   * Handles parallel branches and the implement-blocked-by-test-case rule.
   */
  private activateNext(state: PipelineState): StageId[] {
    const activatable = getActivatableStages(state);
    const activated: StageId[] = [];

    for (const sid of activatable) {
      if (this.tryBlockImplement(state, sid)) continue;
      this.activateStageRecord(state, sid);
      activated.push(sid);
    }

    this.tryUnblockStages(state, activated);
    this.persistIfChanged(state, activated, activatable);

    return activated;
  }

  /**
   * 原则：SEVO 流水线永远往前走。即使 test-case-authoring 尚未通过（ADR-004
   * 历史阻断规则），也不再把 implement 冻结为 'blocked'。仅发一条 advisory
   * 事件提示测试用例未就绪，由上层审计→修复循环消化；implement 照常激活推进。
   * 始终返回 false，使 activateNext 正常激活该 stage。
   */
  private tryBlockImplement(state: PipelineState, sid: StageId): boolean {
    if (sid !== STAGE_IDS.IMPLEMENT || !shouldBlockImplement(state)) return false;

    const record = state.stages[sid];
    if (record.status !== 'pending') return false;

    this.emitEvent(state.pipelineId, sid, 'advance_decision', {
      reason: BLOCK_REASONS.TEST_CASE,
      advisory: 'test-case-authoring not yet passed; implement proceeds (pipeline kept moving forward)',
    });
    return false;
  }

  /** Activate a single stage record: pending → active. */
  private activateStageRecord(state: PipelineState, sid: StageId): void {
    const record = state.stages[sid];
    assertTransition(record.status, 'active');
    record.status = 'active';
    record.startedAt = new Date().toISOString();
    state.currentStage = sid;
    this.emitEvent(state.pipelineId, sid, 'stage_activated', {});
  }

  /** Check if any blocked stages can now be unblocked. */
  private tryUnblockStages(state: PipelineState, activated: StageId[]): void {
    for (const sid of state.requiredStages) {
      const record = state.stages[sid];
      if (record.status !== 'blocked' && record.status !== 'clarification-blocked') continue;
      if (sid === STAGE_IDS.IMPLEMENT && record.status === 'blocked' && !shouldBlockImplement(state)) {
        assertTransition(record.status, 'active');
        record.status = 'active';
        record.blockReason = undefined;
        state.currentStage = sid;
        activated.push(sid);
        this.emitEvent(state.pipelineId, sid, 'stage_activated', {
          unblocked: true,
        });
      }
    }
  }

  /** Persist state if any activations occurred. */
  private persistIfChanged(
    state: PipelineState,
    activated: StageId[],
    activatable: StageId[],
  ): void {
    if (activated.length > 0 || activatable.length > 0) {
      state.updatedAt = new Date().toISOString();
      atomicWriteJson(statePath(this.basePath, state.pipelineId), state);
    }
  }

  /**
   * FR-11: Run AmbiguityDetector on text artifacts for the given stage.
   * Reads .md/.txt artifact files and detects ambiguity signals,
   * converting them into ClarificationFindings for the coordinator.
   */
  private detectAmbiguities(state: PipelineState, stageId: StageId): void {
    if (!this.clarificationCoordinator) return;
    if (!CLARIFICATION_SCANNABLE_STAGES.includes(stageId)) return;

    const stageRecord = state.stages[stageId];
    const textArtifacts = stageRecord.artifacts.filter(
      (a) => a.path && /\.(md|txt|spec)$/i.test(a.path),
    );

    for (const artifact of textArtifacts) {
      const artifactPath = path.isAbsolute(artifact.path)
        ? artifact.path
        : path.join(pipelineDir(this.basePath, state.pipelineId), artifact.path);

      let content: string;
      try {
        content = fs.readFileSync(artifactPath, 'utf-8');
      } catch {
        continue; // Skip unreadable artifacts
      }

      const signals = this.ambiguityDetector.detect(content, stageId);
      if (signals.length === 0) continue;

      this.emitEvent(state.pipelineId, stageId, 'clarification_opened', {
        artifactId: artifact.id,
        signalCount: signals.length,
        severities: signals.map((s: AmbiguitySignal) => s.severity),
      });
    }
  }

  private scanClarifications(
    state: PipelineState,
    stageId: StageId,
  ): boolean {
    if (!this.clarificationCoordinator) return false;
    if (!CLARIFICATION_SCANNABLE_STAGES.includes(stageId)) return false;

    // FR-11: Explicitly run AmbiguityDetector on spec/contract artifacts
    this.detectAmbiguities(state, stageId);

    const stageRecord = state.stages[stageId];
    const findings = this.clarificationCoordinator.scan(stageRecord, stageRecord.artifacts);
    if (findings.length === 0) {
      stageRecord.clarificationSummary = this.buildClarificationSummary(stageId);
      return false;
    }

    const opened = this.clarificationCoordinator.open(
      findings.map((finding) => ({
        ...finding,
        pipelineId: state.pipelineId,
      })),
    );
    let clarificationBlocked = false;
    const clarificationRefs: ArtifactRef[] = [];

    for (const clarification of opened) {
      this.clarificationCoordinator.dispatch(clarification);
      const clarificationRef = this.toClarificationArtifactRef(clarification);
      clarificationRefs.push(clarificationRef);
      this.emitEvent(state.pipelineId, stageId, 'clarification_opened', {
        clarificationId: clarification.clarificationId,
        blocking: clarification.blockingLevel === BlockingLevel.BLOCKING,
      });
      this.emitEvent(state.pipelineId, stageId, 'artifact_registered', {
        artifactId: clarificationRef.id,
        type: clarificationRef.type,
        path: clarificationRef.path,
      });
      if (clarification.blockingLevel === BlockingLevel.BLOCKING) {
        clarificationBlocked = true;
      }
    }

    if (clarificationRefs.length > 0) {
      stageRecord.clarificationRefs = [...(stageRecord.clarificationRefs ?? []), ...clarificationRefs];
    }

    if (clarificationBlocked) {
      stageRecord.status = 'fix_pending';
      stageRecord.failureReason = BLOCK_REASONS.CLARIFICATION;
      stageRecord.fixAttempts = (stageRecord.fixAttempts ?? 0) + 1;
      this.emitEvent(state.pipelineId, stageId, 'stage_advisory', {
        reason: stageRecord.failureReason,
        kind: 'clarification',
        repairTask: 'clarification-required',
      });
    }

    stageRecord.clarificationSummary = this.buildClarificationSummary(stageId);
    state.updatedAt = new Date().toISOString();
    return clarificationBlocked;
  }

  private buildClarificationSummary(stageId: StageId) {
    if (!this.clarificationCoordinator) return undefined;
    const records = this.clarificationCoordinator.listRecords().filter((record) => record.stageId === stageId);
    if (records.length === 0) {
      return {
        open: 0,
        resolved: 0,
        settled: 0,
        blockingOpen: 0,
      };
    }

    let open = 0;
    let resolved = 0;
    let settled = 0;
    let blockingOpen = 0;
    for (const record of records) {
      if (record.status === 'open') {
        open += 1;
        if (record.blockingLevel === BlockingLevel.BLOCKING) blockingOpen += 1;
      } else if (record.status === 'resolved') {
        resolved += 1;
      } else if (record.status === 'settled') {
        settled += 1;
      }
    }

    return { open, resolved, settled, blockingOpen };
  }

  private toClarificationArtifactRef(record: ClarificationRecord): ArtifactRef {
    return {
      id: record.clarificationId,
      type: 'clarification',
      path: `clarifications/${record.clarificationId}.json`,
      createdAt: record.createdAt,
      metadata: {
        stageId: record.stageId,
        blockingLevel: record.blockingLevel,
        status: record.status,
      },
    };
  }

  private emitEvent(
    pipelineId: string,
    stage: StageId,
    eventType: PipelineEvent['eventType'],
    payload: Record<string, unknown>,
  ): void {
    const event: PipelineEvent = {
      timestamp: new Date().toISOString(),
      pipelineId,
      stage,
      eventType,
      payload,
    };
    appendEvent(eventsPath(this.basePath, pipelineId), event);
  }
}



// ── Pipeline-level status (distinct from stage-level StageStatus) ──

export type PipelineLifecycle = 'created' | 'running' | 'completed' | 'failed' | 'paused' | 'cancelled' | 'awaiting-clarification';

export interface PipelineSummary {
  pipelineId: string;
  slug: string;
  description: string;
  level: TaskLevel;
  lifecycle: PipelineLifecycle;
  currentStage: StageId | null;
  stages: StageId[];
  createdAt: string;
  updatedAt: string;
}

export interface AdvanceResult {
  transition: StageTransition | null;
  lifecycle: PipelineLifecycle;
  gateVerdict?: RuleVerdict;
  events: readonly LedgerEvent[];
}

export interface PipelineStepInput {
  type: 'advance' | 'complete-stage' | 'activate';
  pipelineId: string;
  stageResult?: StageResult;
  stageId?: StageId;
}

export interface PipelineStepResult extends AdvanceResult {
  action: PipelineStepInput['type'];
}

// ── Internal record for pipeline metadata ──

interface PipelineRecord {
  pipelineId: string;
  slug: string;
  description: string;
  level: TaskLevel;
  lifecycle: PipelineLifecycle;
  state: PipelineState;
  createdAt: string;
  updatedAt: string;
}

// ── PipelineEngine facade ──

export interface PipelineEngineFacadeOptions {
  /** Custom GateEngine instance. If omitted, spec-review-gate LLM semantic rules are registered by default. */
  gateEngine?: GateEngine;
  /** Options forwarded to default spec-review-gate semantic LLM rules. Ignored when gateEngine is provided. */
  specReviewGateRuleOptions?: SemanticRuleOptions;
  /** Custom EventLedger instance. If omitted, a new one is created. */
  ledger?: EventLedger;
  /** FR-11 ambiguity detector used when entering the spec stage. */
  ambiguityDetector?: AmbiguityDetector;
  /** Project root used for spec clarification scan output. */
  projectRoot?: string;
  /** Optional adapter used to dispatch clarification questions. */
  clarificationAdapter?: {
    requestClarification(target: { type: 'user'; id?: string }, payload: { clarificationId: string; question: string; suggestedOptions?: string[]; context: string }): unknown;
  };
}

export class PipelineEngineFacade {
  private readonly pipelines = new Map<string, PipelineRecord>();
  private readonly gateEngine: GateEngine;
  private readonly ledger: EventLedger;
  private readonly ambiguityDetector: AmbiguityDetector;
  private readonly projectRoot: string;
  private readonly clarificationAdapter?: PipelineEngineFacadeOptions['clarificationAdapter'];

  constructor(options?: PipelineEngineFacadeOptions) {
    this.gateEngine = options?.gateEngine ?? createSpecReviewGateEngine(options?.specReviewGateRuleOptions);
    this.ledger = options?.ledger ?? new EventLedger();
    this.ambiguityDetector = options?.ambiguityDetector ?? new AmbiguityDetector();
    this.projectRoot = options?.projectRoot ?? process.cwd();
    this.clarificationAdapter = options?.clarificationAdapter;
  }

  /**
   * Create a new pipeline for a project.
   *
   * Routes the task based on level, initializes the stage queue,
   * and sets lifecycle to 'created'.
   */
  async createPipeline(slug: string, description: string, level: TaskLevel): Promise<PipelineSummary> {
    const taskId = `${slug}-${randomUUID().slice(0, 8)}`;

    const routeResult = await route({
      taskId,
      title: slug,
      description,
      scope: this.levelToScope(level),
    });

    if (!routeResult.ok) {
      throw new Error(`Routing failed for '${slug}': ${routeResult.error.message}`);
    }

    const routing = routeResult.value;
    const pipelineId = randomUUID();
    const now = new Date().toISOString();

    // Build PipelineState from routing
    const stages = {} as Record<StageId, PipelineState['stages'][StageId]>;
    for (const sid of routing.requiredStages) {
      stages[sid] = { stageId: sid, status: 'pending', artifacts: [] };
    }

    const state: PipelineState = {
      pipelineId,
      taskId,
      level: routing.level,
      requiredStages: routing.requiredStages,
      stages,
      currentStage: null,
      createdAt: now,
      updatedAt: now,
    };

    const record: PipelineRecord = {
      pipelineId,
      slug,
      description,
      level: routing.level,
      lifecycle: 'created',
      state,
      createdAt: now,
      updatedAt: now,
    };

    this.pipelines.set(pipelineId, record);

    this.ledger.append(pipelineId, {
      type: 'pipeline_created',
      detail: { slug, description, level: routing.level, stages: routing.requiredStages },
    });

    return this.toSummary(record);
  }

  /**
   * Advance a pipeline to the next stage.
   *
   * If lifecycle is 'created', transitions to 'running' and activates the first stage.
   * If lifecycle is 'running', evaluates the current stage's gate and advances if passed.
   * Returns the transition result and updated lifecycle.
   */
  advance(pipelineId: string): AdvanceResult {
    const record = this.getRecord(pipelineId);
    if (record.lifecycle === 'running' && record.state.currentStage === 'spec-review-gate') {
      throw new Error('spec-review-gate requires asynchronous LLM evaluation; use advanceAsync');
    }
    return this.advanceSyncInternal(pipelineId);
  }

  /** Async variant required by spec-review-gate LLM semantic rules. */
  async advanceAsync(pipelineId: string): Promise<AdvanceResult> {
    const record = this.getRecord(pipelineId);
    const eventsBefore = this.ledger.getHistory(pipelineId).length;

    if (record.lifecycle === 'completed' || record.lifecycle === 'failed' || record.lifecycle === 'cancelled' || record.lifecycle === 'paused' || record.lifecycle === 'awaiting-clarification') {
      return {
        transition: null,
        lifecycle: record.lifecycle,
        events: this.ledger.getHistory(pipelineId).slice(eventsBefore),
      };
    }

    if (record.lifecycle === 'created') {
      return this.activateFirst(record, eventsBefore);
    }

    // lifecycle === 'running' (legacy blocked records are treated as running by callers)
    return this.advanceRunningAsync(record, eventsBefore);
  }

  /** Get the current status of a pipeline. */
  getStatus(pipelineId: string): PipelineSummary {
    return this.toSummary(this.getRecord(pipelineId));
  }

  /** List all pipelines. */
  listPipelines(): PipelineSummary[] {
    return Array.from(this.pipelines.values()).map((r) => this.toSummary(r));
  }

  /** Get the underlying GateEngine (for rule registration). */
  getGateEngine(): GateEngine {
    return this.gateEngine;
  }

  /** Get the event ledger (for audit queries). */
  getLedger(): EventLedger {
    return this.ledger;
  }

  /**
   * Record a pause request as advisory while keeping the pipeline running.
   * Throws if pipeline is not in 'running' state.
   */
  pause(pipelineId: string): PipelineSummary {
    const record = this.getRecord(pipelineId);
    if (record.lifecycle !== 'running') {
      throw new Error(
        `Cannot pause pipeline '${pipelineId}': current lifecycle is '${record.lifecycle}', expected 'running'`,
      );
    }
    record.updatedAt = new Date().toISOString();
    record.state.updatedAt = record.updatedAt;

    this.ledger.append(pipelineId, { type: 'pipeline_paused' });
    return this.toSummary(record);
  }

  /**
   * Acknowledge an advisory-only pause request.
   * The lifecycle remains running because SEVO no longer stores a paused state.
   */
  resume(pipelineId: string): PipelineSummary {
    const record = this.getRecord(pipelineId);
    if (record.lifecycle !== 'running') {
      throw new Error(
        `Cannot resume pipeline '${pipelineId}': current lifecycle is '${record.lifecycle}', expected 'running'`,
      );
    }
    record.updatedAt = new Date().toISOString();
    record.state.updatedAt = record.updatedAt;

    this.ledger.append(pipelineId, { type: 'pipeline_resumed' });
    return this.toSummary(record);
  }

  /**
   * Cancel a pipeline from any non-terminal state.
   * Transitions lifecycle: * → cancelled (except completed/failed/cancelled).
   * Throws if pipeline is already in a terminal state.
   */
  cancel(pipelineId: string): PipelineSummary {
    const record = this.getRecord(pipelineId);
    const terminal: PipelineLifecycle[] = ['completed', 'failed', 'cancelled'];
    if (terminal.includes(record.lifecycle)) {
      throw new Error(
        `Cannot cancel pipeline '${pipelineId}': current lifecycle is '${record.lifecycle}' (terminal)`,
      );
    }
    record.lifecycle = 'cancelled';
    record.updatedAt = new Date().toISOString();
    record.state.updatedAt = record.updatedAt;

    this.ledger.append(pipelineId, { type: 'pipeline_cancelled' });
    return this.toSummary(record);
  }

  /**
   * Recover interrupted pipelines.
   * Scans all pipelines with lifecycle 'running' and checks if their
   * current active stage has been running without update for too long.
   * Returns the list of pipeline IDs that were found interrupted.
   */
  recoverInterrupted(staleThresholdMs: number = 30 * 60 * 1000): string[] {
    const interrupted: string[] = [];
    const now = Date.now();

    for (const [pipelineId, record] of this.pipelines) {
      if (record.lifecycle !== 'running') continue;

      const currentStage = record.state.currentStage;
      if (!currentStage) continue;

      const stageRecord = record.state.stages[currentStage];
      if (!stageRecord || stageRecord.status !== 'active') continue;

      const startedAt = stageRecord.startedAt
        ? new Date(stageRecord.startedAt).getTime()
        : new Date(record.updatedAt).getTime();

      if (now - startedAt >= staleThresholdMs) {
        interrupted.push(pipelineId);
        // 原则：SEVO 流水线永远往前走。stale interrupted stage 不再冻结为
        // 'blocked'，而是退回 fix_pending（canActivate 接受）让下一次 advance
        // 重新激活它继续推进；pipeline lifecycle 保持 'running'（非 blocked 终态）。
        record.lifecycle = 'running';
        record.updatedAt = new Date().toISOString();
        record.state.updatedAt = record.updatedAt;
        stageRecord.status = 'fix_pending';
        stageRecord.fixAttempts = (stageRecord.fixAttempts ?? 0) + 1;
        stageRecord.blockReason = 'Recovered from interrupted state (stale active stage)';

        this.ledger.append(pipelineId, {
          type: 'fix_attempt_initiated',
          stageId: currentStage,
          detail: { reason: 'stale_interrupted', staleMs: now - startedAt, attempt: stageRecord.fixAttempts },
        });
        this.ledger.append(pipelineId, {
          type: 'pipeline_running',
          stageId: currentStage,
          detail: { advisory: 'stale interrupted stage re-queued for fix loop, pipeline kept running' },
        });
      }
    }

    return interrupted;
  }

  /**
   * Complete a stage with a result, then auto-advance.
   * This is the primary API for driving the pipeline forward from external events.
   */
  completeStage(pipelineId: string, stageResult: StageResult): AdvanceResult {
    const record = this.getRecord(pipelineId);
    const eventsBefore = this.ledger.getHistory(pipelineId).length;
    const { stageId, outcome, artifacts, failureReason } = stageResult;

    const stageRecord = record.state.stages[stageId];
    if (!stageRecord) {
      throw new Error(`Stage '${stageId}' not found in pipeline '${pipelineId}'`);
    }

    if (outcome === 'failed') {
      // 原则：SEVO 流水线永远往前走。stage 失败不是终态——不再写
      // lifecycle='failed' 终结整条 pipeline，而是转入 fix_pending 修复循环
      // （与 applyFacadeGateVerdict 的 gate-reject 分支一致），pipeline 生命周期
      // 保持 'running'，由上层 adapter/fix-loop 据 fix_pending 派发修复任务后复验。
      // 唯一合法终态是 completed 或用户主动 cancel。
      stageRecord.status = 'fix_pending';
      stageRecord.completedAt = undefined;
      stageRecord.fixAttempts = (stageRecord.fixAttempts ?? 0) + 1;
      if (failureReason) stageRecord.failureReason = failureReason;
      this.appendArtifacts(stageRecord, artifacts);

      this.ledger.append(pipelineId, {
        type: 'stage_failed',
        stageId,
        detail: { failureReason },
      });
      this.ledger.append(pipelineId, {
        type: 'fix_attempt_initiated',
        stageId,
        detail: { attempt: stageRecord.fixAttempts, failureReason },
      });

      record.lifecycle = 'running';
      record.updatedAt = new Date().toISOString();
      record.state.updatedAt = record.updatedAt;

      return {
        transition: { pipelineId, fromStage: stageId, toStage: stageId, status: 'fix_pending', artifacts },
        lifecycle: 'running',
        events: this.ledger.getHistory(pipelineId).slice(eventsBefore),
      };
    }

    // outcome === 'passed'
    stageRecord.status = 'passed';
    stageRecord.completedAt = new Date().toISOString();
    this.appendArtifacts(stageRecord, artifacts);

    this.ledger.append(pipelineId, {
      type: 'stage_completed',
      stageId,
      detail: { artifacts: artifacts.map((a) => a.id) },
    });

    if (stageId === 'spec') {
      const scanBlock = this.runSpecClarificationScan(record, stageRecord, artifacts, eventsBefore);
      if (scanBlock) return scanBlock;
    }

    // Check if all stages are done
    const allDone = record.state.requiredStages.every(
      (s) => isTerminal(record.state.stages[s].status),
    );

    if (allDone) {
      record.lifecycle = 'completed';
      record.updatedAt = new Date().toISOString();
      record.state.updatedAt = record.updatedAt;
      this.ledger.append(pipelineId, { type: 'pipeline_completed' });

      return {
        transition: { pipelineId, fromStage: stageId, toStage: stageId, status: 'passed', artifacts },
        lifecycle: 'completed',
        events: this.ledger.getHistory(pipelineId).slice(eventsBefore),
      };
    }

    // Activate next stage
    const nextStage = this.findNextPending(record);
    if (nextStage) {
      return this.activateStage(record, stageId, nextStage, artifacts, eventsBefore);
    }

    // 原则：SEVO 流水线永远往前走。没有 pending stage 但 pipeline 未全完成时，
    // 不再把 lifecycle 写成阻断终态。先扫描任何可激活的非终态 stage
    // （fix_pending / failed / blocked / clarification-blocked，见 canActivate），
    // 找到就直接激活继续推进；这是 parallel 分支或依赖未就绪的正常恢复路径。
    const recoverable = record.state.requiredStages.find(
      (s) => canActivate(record.state.stages[s].status),
    );
    if (recoverable) {
      return this.activateStage(record, stageId, recoverable, artifacts, eventsBefore);
    }

    // 确实没有可激活 stage（全部 active/in-flight）：保持 running 并写一条 advisory
    // 诊断事件（非 pipeline_blocked 终态），由下一次 advance / 修复循环接管，
    // 而不是把 pipeline 冻结在 blocked。
    record.lifecycle = 'running';
    record.updatedAt = new Date().toISOString();
    record.state.updatedAt = record.updatedAt;
    this.ledger.append(pipelineId, {
      type: 'pipeline_running',
      stageId,
      detail: { advisory: 'no-next-pending: awaiting in-flight stages, pipeline kept running' },
    });

    return {
      transition: { pipelineId, fromStage: stageId, toStage: stageId, status: 'passed', artifacts },
      lifecycle: 'running',
      events: this.ledger.getHistory(pipelineId).slice(eventsBefore),
    };
  }

  /**
   * AC-13F: Single engine entry for all programmatic stage progression.
   * CLI, SDK, and plugin adapters should call this instead of duplicating
   * stage advance / complete / activate branching logic.
   */
  async runStep(input: PipelineStepInput): Promise<PipelineStepResult> {
    if (input.type === 'advance') {
      return { ...await this.advanceAsync(input.pipelineId), action: input.type };
    }

    if (input.type === 'complete-stage') {
      if (!input.stageResult) {
        throw new Error('stageResult is required for complete-stage');
      }
      return { ...this.completeStage(input.pipelineId, input.stageResult), action: input.type };
    }

    if (!input.stageId) {
      throw new Error('stageId is required for activate');
    }
    this.activatePipelineStage(input.pipelineId, input.stageId);
    const status = this.getStatus(input.pipelineId);
    return {
      action: input.type,
      transition: {
        pipelineId: input.pipelineId,
        fromStage: input.stageId,
        toStage: input.stageId,
        status: 'active',
        artifacts: [],
      },
      lifecycle: status.lifecycle,
      events: this.ledger.getHistory(input.pipelineId).slice(-1),
    };
  }

  /**
   * Activate a pending/blocked stage through the same facade used by runStep().
   */
  activatePipelineStage(pipelineId: string, stageId: StageId): AdvanceResult {
    const record = this.getRecord(pipelineId);
    const eventsBefore = this.ledger.getHistory(pipelineId).length;
    const stageRecord = record.state.stages[stageId];
    if (!stageRecord) {
      throw new Error(`Stage '${stageId}' not found in pipeline '${pipelineId}'`);
    }
    if (!canActivate(stageRecord.status)) {
      throw new Error(`Cannot activate stage '${stageId}' from status '${stageRecord.status}'`);
    }
    return this.activateStage(record, stageId, stageId, [], eventsBefore);
  }

  // ── Internal helpers ──

  private getRecord(pipelineId: string): PipelineRecord {
    const record = this.pipelines.get(pipelineId);
    if (!record) {
      throw new Error(`Pipeline '${pipelineId}' not found`);
    }
    return record;
  }

  private activateFirst(record: PipelineRecord, eventsBefore: number): AdvanceResult {
    const firstStage = record.state.requiredStages[0];
    if (!firstStage) {
      record.lifecycle = 'completed';
      record.updatedAt = new Date().toISOString();
      this.ledger.append(record.pipelineId, { type: 'pipeline_completed' });
      return {
        transition: null,
        lifecycle: 'completed',
        events: this.ledger.getHistory(record.pipelineId).slice(eventsBefore),
      };
    }

    record.lifecycle = 'running';
    record.updatedAt = new Date().toISOString();
    record.state.updatedAt = record.updatedAt;

    this.ledger.append(record.pipelineId, { type: 'pipeline_running' });

    const stageRecord = record.state.stages[firstStage];
    stageRecord.status = 'active';
    stageRecord.startedAt = new Date().toISOString();
    record.state.currentStage = firstStage;

    this.ledger.append(record.pipelineId, {
      type: 'stage_started',
      stageId: firstStage,
    });

    if (firstStage === 'spec') {
      this.recordSpecAmbiguitySignals(record);
    }

    return {
      transition: {
        pipelineId: record.pipelineId,
        fromStage: firstStage,
        toStage: firstStage,
        status: 'active',
        artifacts: [],
      },
      lifecycle: 'running',
      events: this.ledger.getHistory(record.pipelineId).slice(eventsBefore),
    };
  }

  private advanceSyncInternal(pipelineId: string): AdvanceResult {
    const record = this.getRecord(pipelineId);
    const eventsBefore = this.ledger.getHistory(pipelineId).length;

    if (record.lifecycle === 'completed' || record.lifecycle === 'failed' || record.lifecycle === 'cancelled' || record.lifecycle === 'paused' || record.lifecycle === 'awaiting-clarification') {
      return {
        transition: null,
        lifecycle: record.lifecycle,
        events: this.ledger.getHistory(pipelineId).slice(eventsBefore),
      };
    }

    if (record.lifecycle === 'created') {
      return this.activateFirst(record, eventsBefore);
    }

    return this.advanceRunningSync(record, eventsBefore);
  }

  private advanceRunningSync(record: PipelineRecord, eventsBefore: number): AdvanceResult {
    const currentStage = record.state.currentStage;
    if (!currentStage) {
      return { transition: null, lifecycle: record.lifecycle, events: [] };
    }

    const stageRecord = record.state.stages[currentStage];
    if (!stageRecord || stageRecord.status !== 'active') {
      return { transition: null, lifecycle: record.lifecycle, events: [] };
    }

    const gateVerdict = this.gateEngine.evaluateGate(currentStage, stageRecord.artifacts);
    return this.applyFacadeGateVerdict(record, eventsBefore, currentStage, stageRecord, gateVerdict);
  }

  private async advanceRunningAsync(record: PipelineRecord, eventsBefore: number): Promise<AdvanceResult> {
    const currentStage = record.state.currentStage;
    if (!currentStage) {
      return { transition: null, lifecycle: record.lifecycle, events: [] };
    }

    const stageRecord = record.state.stages[currentStage];
    if (!stageRecord || stageRecord.status !== 'active') {
      return { transition: null, lifecycle: record.lifecycle, events: [] };
    }

    // Evaluate gate for current stage
    const gateVerdict = await this.gateEngine.evaluateGateAsync(
      currentStage,
      stageRecord.artifacts,
    );

    return this.applyFacadeGateVerdict(record, eventsBefore, currentStage, stageRecord, gateVerdict);
  }

  private applyFacadeGateVerdict(
    record: PipelineRecord,
    eventsBefore: number,
    currentStage: StageId,
    stageRecord: StageRecord,
    gateVerdict: RuleVerdict,
  ): AdvanceResult {
    if (!gateVerdict.pass) {
      stageRecord.status = 'fix_pending';
      stageRecord.blockReason = gateVerdict.blockers.join('; ');
      stageRecord.fixAttempts = 1;
      // 原则：SEVO 流水线永远往前走。gate 未过 → stage 进 fix_pending 修复循环，
      // pipeline lifecycle 保持 'running'（而非 'blocked' 静默卡死），由上层
      // 据 fix_pending 派发修复任务后复验。
      record.lifecycle = 'running';
      record.updatedAt = new Date().toISOString();
      record.state.updatedAt = record.updatedAt;

      this.ledger.append(record.pipelineId, {
        type: 'gate_rejected',
        stageId: currentStage,
        detail: { blockers: gateVerdict.blockers, score: gateVerdict.score },
      });
      this.ledger.append(record.pipelineId, {
        type: 'fix_attempt_initiated',
        stageId: currentStage,
        detail: { attempt: 1, blockers: gateVerdict.blockers },
      });

      return {
        transition: {
          pipelineId: record.pipelineId,
          fromStage: currentStage,
          toStage: currentStage,
          status: 'fix_pending',
          artifacts: stageRecord.artifacts,
        },
        lifecycle: 'running',
        gateVerdict,
        events: this.ledger.getHistory(record.pipelineId).slice(eventsBefore),
      };
    }

    this.ledger.append(record.pipelineId, {
      type: 'gate_passed',
      stageId: currentStage,
      detail: { score: gateVerdict.score },
    });

    stageRecord.status = 'passed';
    stageRecord.completedAt = new Date().toISOString();

    this.ledger.append(record.pipelineId, {
      type: 'stage_completed',
      stageId: currentStage,
    });

    if (currentStage === 'spec') {
      const scanBlock = this.runSpecClarificationScan(record, stageRecord, stageRecord.artifacts, eventsBefore);
      if (scanBlock) {
        scanBlock.gateVerdict = gateVerdict;
        return scanBlock;
      }
    }

    const allDone = record.state.requiredStages.every(
      (s) => isTerminal(record.state.stages[s].status),
    );

    if (allDone) {
      record.lifecycle = 'completed';
      record.updatedAt = new Date().toISOString();
      record.state.updatedAt = record.updatedAt;
      this.ledger.append(record.pipelineId, { type: 'pipeline_completed' });

      return {
        transition: {
          pipelineId: record.pipelineId,
          fromStage: currentStage,
          toStage: currentStage,
          status: 'passed',
          artifacts: stageRecord.artifacts,
        },
        lifecycle: 'completed',
        gateVerdict,
        events: this.ledger.getHistory(record.pipelineId).slice(eventsBefore),
      };
    }

    const nextStage = this.findNextPending(record);
    if (nextStage) {
      const result = this.activateStage(record, currentStage, nextStage, stageRecord.artifacts, eventsBefore);
      result.gateVerdict = gateVerdict;
      return result;
    }

    return {
      transition: {
        pipelineId: record.pipelineId,
        fromStage: currentStage,
        toStage: currentStage,
        status: 'passed',
        artifacts: stageRecord.artifacts,
      },
      lifecycle: record.lifecycle,
      gateVerdict,
      events: this.ledger.getHistory(record.pipelineId).slice(eventsBefore),
    };
  }

  private activateStage(
    record: PipelineRecord,
    fromStage: StageId,
    toStage: StageId,
    artifacts: ArtifactRef[],
    eventsBefore: number,
  ): AdvanceResult {
    const nextRecord = record.state.stages[toStage];
    nextRecord.status = 'active';
    nextRecord.startedAt = new Date().toISOString();
    record.state.currentStage = toStage;
    record.lifecycle = 'running';
    record.updatedAt = new Date().toISOString();
    record.state.updatedAt = record.updatedAt;

    // AC-4.3: Record inter-stage artifact flow
    if (artifacts.length > 0) {
      this.ledger.append(record.pipelineId, {
        type: 'artifact_passed',
        stageId: toStage,
        detail: {
          fromStage,
          toStage,
          artifactIds: artifacts.map((a) => a.id),
          artifactCount: artifacts.length,
        },
      });
    }

    this.ledger.append(record.pipelineId, {
      type: 'stage_started',
      stageId: toStage,
    });

    if (toStage === 'spec') {
      this.recordSpecAmbiguitySignals(record);
    }

    return {
      transition: {
        pipelineId: record.pipelineId,
        fromStage,
        toStage,
        status: 'active',
        artifacts,
      },
      lifecycle: 'running',
      events: this.ledger.getHistory(record.pipelineId).slice(eventsBefore),
    };
  }

  private runSpecClarificationScan(
    record: PipelineRecord,
    stageRecord: StageRecord,
    artifacts: ArtifactRef[],
    eventsBefore: number,
  ): AdvanceResult | null {
    const specArtifact = artifacts.find((artifact) => /\.(md|txt|json|spec)$/i.test(artifact.path));
    if (!specArtifact) return null;

    const specPath = path.isAbsolute(specArtifact.path)
      ? specArtifact.path
      : path.join(this.projectRoot, specArtifact.path);
    if (!fs.existsSync(specPath)) return null;

    const scanResult = this.scanSpecArtifact(specPath);
    const scanArtifact: ArtifactRef = {
      id: `${record.pipelineId}:clarification-scan`,
      type: 'clarification-scan',
      path: path.join(path.dirname(specPath), 'clarification-scan.json'),
      createdAt: scanResult.scannedAt,
      metadata: { ambiguityCount: scanResult.ambiguities.length },
    };
    stageRecord.artifacts.push(scanArtifact);

    this.ledger.append(record.pipelineId, {
      type: 'clarification_opened',
      stageId: 'spec',
      detail: {
        scanPath: scanArtifact.path,
        ambiguityCount: scanResult.ambiguities.length,
        blockingCount: scanResult.ambiguities.filter((item) => item.severity === 'blocking').length,
        ambiguities: scanResult.ambiguities,
      },
    });

    const blocking = scanResult.ambiguities.filter((item) => item.severity === 'blocking');
    stageRecord.clarificationSummary = {
      open: scanResult.ambiguities.length,
      resolved: 0,
      settled: 0,
      blockingOpen: blocking.length,
    };

    if (blocking.length === 0) return null;

    stageRecord.status = 'fix_pending';
    stageRecord.failureReason = `Awaiting clarification for ${blocking.length} ambiguity advisory point(s)`;
    stageRecord.fixAttempts = (stageRecord.fixAttempts ?? 0) + 1;
    stageRecord.completedAt = undefined;
    record.lifecycle = 'running';
    record.updatedAt = new Date().toISOString();
    record.state.updatedAt = record.updatedAt;

    this.dispatchSpecClarificationRequests(record.pipelineId, blocking);
    this.ledger.append(record.pipelineId, {
      type: 'stage_advisory',
      stageId: 'spec',
      detail: { reason: stageRecord.failureReason, kind: 'clarification', repairTask: 'clarification-required' },
    });
    this.ledger.append(record.pipelineId, {
      type: 'fix_attempt_initiated',
      stageId: 'spec',
      detail: { reason: stageRecord.failureReason, attempt: stageRecord.fixAttempts },
    });

    return {
      transition: {
        pipelineId: record.pipelineId,
        fromStage: 'spec',
        toStage: 'spec',
        status: 'fix_pending',
        artifacts: stageRecord.artifacts,
      },
      lifecycle: 'running',
      events: this.ledger.getHistory(record.pipelineId).slice(eventsBefore),
    };
  }

  private scanSpecArtifact(specPath: string): ClarificationScanResult {
    const content = fs.readFileSync(specPath, 'utf8');
    const signals = this.ambiguityDetector.detect(content, 'spec');
    const scannedAt = new Date().toISOString();
    const result: ClarificationScanResult = {
      scannedAt,
      ambiguities: signals.map((signal) => ({
        location: signal.location,
        signal: signal.description,
        type: this.mapSignalType(signal.type),
        severity: signal.severity === 'high' || signal.severity === 'critical' ? 'blocking' : 'non-blocking',
      })),
    };
    fs.writeFileSync(path.join(path.dirname(specPath), 'clarification-scan.json'), JSON.stringify(result, null, 2), 'utf8');
    return result;
  }

  private mapSignalType(signalType: string): ClarificationType {
    if (signalType.includes('contradiction')) return ClarificationType.CORRECTION;
    if (signalType.includes('dependency') || signalType.includes('interface')) return ClarificationType.DECISION;
    if (signalType.includes('term') || signalType.includes('boundary')) return ClarificationType.BOUNDARY;
    return ClarificationType.BOUNDARY;
  }

  private dispatchSpecClarificationRequests(
    pipelineId: string,
    ambiguities: ClarificationScanResult['ambiguities'],
  ): void {
    if (!this.clarificationAdapter) return;
    for (const ambiguity of ambiguities) {
      const clarificationId = `clr-${randomUUID()}`;
      this.clarificationAdapter.requestClarification(
        { type: 'user' },
        {
          clarificationId,
          question: `请澄清 Spec 模糊点：${ambiguity.signal}（位置：${ambiguity.location}）`,
          context: `pipeline=${pipelineId}; stage=spec; sink=${ResolutionSink.SPEC_PACKAGE}`,
        },
      );
      this.ledger.append(pipelineId, {
        type: 'clarification_opened',
        stageId: 'spec',
        detail: { clarificationId, ambiguity },
      });
    }
  }

  private recordSpecAmbiguitySignals(record: PipelineRecord): AmbiguitySignal[] {
    if (!record.state.requiredStages.includes('spec' as StageId)) return [];

    const signals = this.ambiguityDetector.detect(record.description, 'spec' as StageId);
    const specRecord = record.state.stages['spec' as StageId];
    if (specRecord && signals.length > 0) {
      specRecord.clarificationSummary = {
        open: signals.length,
        resolved: 0,
        settled: 0,
        blockingOpen: signals.filter((signal) => signal.severity === 'high' || signal.severity === 'critical').length,
      };
    }

    this.ledger.append(record.pipelineId, {
      type: 'clarification_opened',
      stageId: 'spec',
      detail: {
        signalCount: signals.length,
        signals: signals.map((signal) => ({
          type: signal.type,
          severity: signal.severity,
          location: signal.location,
          description: signal.description,
        })),
      },
    });

    return signals;
  }

  private findNextPending(record: PipelineRecord): StageId | undefined {
    return record.state.requiredStages.find(
      (s) => record.state.stages[s].status === 'pending',
    );
  }

  private appendArtifacts(stageRecord: PipelineState['stages'][StageId], artifacts: ArtifactRef[]): void {
    for (const art of artifacts) {
      stageRecord.artifacts.push(art);
    }
  }

  private levelToScope(level: TaskLevel): { estimatedFiles?: number; estimatedLines?: number; affectedDomains?: string[]; isNewModule?: boolean; userExplicitLevel?: TaskLevel; userExplicitL0?: boolean; userExplicitFullPipeline?: boolean } {
    switch (level) {
      case 'L0':
        // Caller explicitly chose L0 via the API — honor it via userExplicitL0.
        return { estimatedFiles: 1, estimatedLines: 20, userExplicitLevel: 'L0', userExplicitL0: true };
      case 'L1':
        return { estimatedFiles: 5, estimatedLines: 200, userExplicitLevel: 'L1' };
      case 'L2+':
        return { estimatedFiles: 15, estimatedLines: 800, affectedDomains: ['core', 'api'], isNewModule: true, userExplicitLevel: 'L2+', userExplicitFullPipeline: true };
    }
  }

  private toSummary(record: PipelineRecord): PipelineSummary {
    return {
      pipelineId: record.pipelineId,
      slug: record.slug,
      description: record.description,
      level: record.level,
      lifecycle: record.lifecycle,
      currentStage: record.state.currentStage,
      stages: record.state.requiredStages,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
