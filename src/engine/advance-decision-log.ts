import type { StageId, PipelineEvent, GateVerdict, RuleVerdict } from '../types/index.js';
import { join } from 'node:path';
import { appendJsonLineWithRotation } from '../utils/event-log.js';

export interface AdvanceDecision {
  timestamp: string;
  pipelineId: string;
  fromStage: StageId;
  toStage: StageId;
  verdict: 'advance' | 'block' | 'retry';
  reason: string;
  gateVerdict?: GateVerdict | RuleVerdict | Record<string, unknown>;
  blockedRequestLabel?: string;
  durationMs?: number;
}

export function pipelineEventsPath(basePath: string, pipelineId: string): string {
  return join(basePath, 'pipelines', pipelineId, 'events.jsonl');
}

export function appendAdvanceDecision(basePath: string, decision: AdvanceDecision): void {
  const event: PipelineEvent = {
    timestamp: decision.timestamp,
    pipelineId: decision.pipelineId,
    stage: decision.fromStage,
    eventType: 'advance_decision',
    payload: { ...decision },
  };
  const eventsPath = pipelineEventsPath(basePath, decision.pipelineId);
  appendJsonLineWithRotation(eventsPath, event);
}
