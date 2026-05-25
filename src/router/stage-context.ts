/**
 * Stage Context — tracks current stage, transition history, and per-stage artifacts.
 * (arc42 §5.1)
 */

import type { ArtifactRef, GateVerdict, StageId } from '../types/index.js';

/** A recorded transition between stages. */
export interface TransitionRecord {
  from: StageId;
  to: StageId;
  verdict: GateVerdict;
  timestamp: string;
}

/** Mutable context tracking pipeline stage progression. */
export class StageContext {
  private currentStage: StageId;
  private readonly history: TransitionRecord[] = [];
  private readonly artifacts: Map<StageId, ArtifactRef[]> = new Map();

  constructor(initialStage: StageId) {
    this.currentStage = initialStage;
  }

  getCurrentStage(): StageId {
    return this.currentStage;
  }

  getHistory(): readonly TransitionRecord[] {
    return this.history;
  }

  /** Record a transition and update current stage. */
  recordTransition(from: StageId, to: StageId, verdict: GateVerdict): void {
    this.history.push({
      from,
      to,
      verdict,
      timestamp: new Date().toISOString(),
    });
    this.currentStage = to;
  }

  /** Register artifacts produced during a stage. */
  addArtifacts(stage: StageId, refs: ArtifactRef[]): void {
    const existing = this.artifacts.get(stage) ?? [];
    this.artifacts.set(stage, [...existing, ...refs]);
  }

  /** Get artifacts for a specific stage. */
  getArtifacts(stage: StageId): readonly ArtifactRef[] {
    return this.artifacts.get(stage) ?? [];
  }
}
