/**
 * PipelineRun — encapsulates a single pipeline execution lifecycle.
 * Tracks stage progression, artifacts per stage, and gate verdicts.
 */

import { randomUUID } from 'node:crypto';
import type { ArtifactRef, GateVerdict, StageId } from '../types/index.js';
import { StageContext } from '../router/stage-context.js';

/** Pipeline execution status snapshot. */
export interface PipelineStatus {
  runId: string;
  currentStage: StageId;
  history: Array<{ from: StageId; to: StageId; timestamp: string }>;
  verdict?: GateVerdict;
  startedAt: string;
  updatedAt: string;
}

/** Payload to start a pipeline. */
export interface TaskPayload {
  taskId: string;
  title: string;
  initialStage: StageId;
  stages: StageId[];
}

/** A complete pipeline run instance. */
export class PipelineRun {
  readonly runId: string;
  readonly payload: TaskPayload;
  readonly stageContext: StageContext;
  readonly startedAt: string;
  private updatedAt: string;
  private lastVerdict?: GateVerdict;
  private readonly artifactsByStage: Map<StageId, ArtifactRef[]> = new Map();
  private readonly verdictsByGate: Map<StageId, GateVerdict> = new Map();
  private completed = false;
  private failed = false;
  private failureReason?: string;

  constructor(payload: TaskPayload) {
    this.runId = randomUUID();
    this.payload = payload;
    this.stageContext = new StageContext(payload.initialStage);
    const now = new Date().toISOString();
    this.startedAt = now;
    this.updatedAt = now;
  }

  getCurrentStage(): StageId {
    return this.stageContext.getCurrentStage();
  }

  addArtifacts(stage: StageId, artifacts: ArtifactRef[]): void {
    const existing = this.artifactsByStage.get(stage) ?? [];
    this.artifactsByStage.set(stage, [...existing, ...artifacts]);
    this.stageContext.addArtifacts(stage, artifacts);
    this.touch();
  }

  getArtifacts(stage: StageId): readonly ArtifactRef[] {
    return this.artifactsByStage.get(stage) ?? [];
  }

  recordVerdict(stage: StageId, verdict: GateVerdict): void {
    this.verdictsByGate.set(stage, verdict);
    this.lastVerdict = verdict;
    this.touch();
  }

  getVerdict(stage: StageId): GateVerdict | undefined {
    return this.verdictsByGate.get(stage);
  }

  advanceTo(nextStage: StageId, verdict: GateVerdict): void {
    const from = this.getCurrentStage();
    this.stageContext.recordTransition(from, nextStage, verdict);
    this.touch();
  }

  markCompleted(): void {
    this.completed = true;
    this.touch();
  }

  markFailed(reason: string): void {
    this.failed = true;
    this.failureReason = reason;
    this.touch();
  }

  isCompleted(): boolean {
    return this.completed;
  }

  isFailed(): boolean {
    return this.failed;
  }

  getStatus(): PipelineStatus {
    return {
      runId: this.runId,
      currentStage: this.getCurrentStage(),
      history: this.stageContext.getHistory().map((h) => ({
        from: h.from,
        to: h.to,
        timestamp: h.timestamp,
      })),
      verdict: this.lastVerdict,
      startedAt: this.startedAt,
      updatedAt: this.updatedAt,
    };
  }

  private touch(): void {
    this.updatedAt = new Date().toISOString();
  }
}
