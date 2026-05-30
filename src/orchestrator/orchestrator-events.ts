/**
 * Orchestrator Events — typed event definitions using EventEmitter pattern.
 * (arc42 §5, spec §FR-01/FR-02)
 */

import { EventEmitter } from 'node:events';
import type { GateVerdict, StageId, ArtifactRef } from '../types/index.js';
import type { PipelineStatus } from './pipeline-run.js';

// ── Event payload types ─────────────────────────────────────────

export interface PipelineStartedEvent {
  runId: string;
  initialStage: StageId;
  timestamp: string;
}

export interface StageEnteredEvent {
  runId: string;
  stage: StageId;
  timestamp: string;
}

export interface GateEvaluatedEvent {
  runId: string;
  stage: StageId;
  verdict: GateVerdict;
  timestamp: string;
}

export interface StageAdvancedEvent {
  runId: string;
  fromStage: StageId;
  toStage: StageId;
  timestamp: string;
}

export interface PipelineCompletedEvent {
  runId: string;
  finalStage: StageId;
  timestamp: string;
}

export interface PipelineFailedEvent {
  runId: string;
  stage: StageId;
  reason: string;
  timestamp: string;
}

export interface ClarificationOpenedEvent {
  runId: string;
  stage: StageId;
  clarificationId: string;
  blocking: boolean;
  timestamp: string;
}

export interface ClarificationSettledEvent {
  runId: string;
  stage: StageId;
  clarificationId: string;
  resumed: boolean;
  timestamp: string;
}

// ── Event map for type-safe listeners ───────────────────────────

export interface OrchestratorEventMap {
  'pipeline:started': PipelineStartedEvent;
  'pipeline:completed': PipelineCompletedEvent;
  'pipeline:failed': PipelineFailedEvent;
  'stage:entered': StageEnteredEvent;
  'stage:advanced': StageAdvancedEvent;
  'gate:evaluated': GateEvaluatedEvent;
  'clarification:opened': ClarificationOpenedEvent;
  'clarification:settled': ClarificationSettledEvent;
}

// ── Typed EventEmitter ──────────────────────────────────────────

export class OrchestratorEmitter extends EventEmitter {
  override emit<K extends keyof OrchestratorEventMap>(
    event: K,
    payload: OrchestratorEventMap[K],
  ): boolean {
    return super.emit(event, payload);
  }

  override on<K extends keyof OrchestratorEventMap>(
    event: K,
    listener: (payload: OrchestratorEventMap[K]) => void,
  ): this {
    return super.on(event, listener);
  }

  override once<K extends keyof OrchestratorEventMap>(
    event: K,
    listener: (payload: OrchestratorEventMap[K]) => void,
  ): this {
    return super.once(event, listener);
  }
}
