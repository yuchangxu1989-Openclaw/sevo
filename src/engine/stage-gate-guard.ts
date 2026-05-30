import type { PipelineState, StageId } from '../types/index.js';
import { arePrerequisitesMet } from '../pipeline/parallel-branch.js';
import type { AdvanceDecision } from './advance-decision-log.js';

export interface StageGateResult {
  pass: boolean;
  pipelineId?: string;
  currentStage?: StageId | null;
  targetStage?: StageId;
  reason?: string;
  decision?: AdvanceDecision;
}

export interface StageGateRequest {
  pipelineId: string;
  targetStage: StageId;
  label?: string;
}

export function evaluateStageGate(state: PipelineState | null, request: StageGateRequest): StageGateResult {
  if (!state) return { pass: true, pipelineId: request.pipelineId, targetStage: request.targetStage };

  const record = state.stages[request.targetStage];
  if (!record) {
    return block(state, request, `stage '${request.targetStage}' not in pipeline`);
  }

  if (record.status === 'active') {
    return { pass: true, pipelineId: state.pipelineId, currentStage: state.currentStage, targetStage: request.targetStage };
  }

  const prereqMet = arePrerequisitesMet(request.targetStage, state);
  const reason = prereqMet
    ? `Stage '${request.targetStage}' is '${record.status}', not active.`
    : `Stage '${request.targetStage}' prerequisites are not met. Current stage: ${state.currentStage ?? 'none'}.`;
  return block(state, request, reason);
}

export function evaluateStageGateByLoader(
  request: StageGateRequest,
  getPipelineState: (pipelineId: string) => PipelineState | null,
): StageGateResult {
  return evaluateStageGate(getPipelineState(request.pipelineId), request);
}

function block(state: PipelineState, request: StageGateRequest, reason: string): StageGateResult {
  const decision: AdvanceDecision = {
    timestamp: new Date().toISOString(),
    pipelineId: state.pipelineId,
    fromStage: state.currentStage ?? request.targetStage,
    toStage: request.targetStage,
    verdict: 'block',
    reason,
    blockedRequestLabel: request.label,
  };
  return {
    pass: false,
    pipelineId: state.pipelineId,
    currentStage: state.currentStage,
    targetStage: request.targetStage,
    reason,
    decision,
  };
}
