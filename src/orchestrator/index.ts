/**
 * Orchestrator module barrel exports.
 */

export { TaskOrchestrator } from './task-orchestrator.js';
export { PipelineRun } from './pipeline-run.js';
export type { PipelineStatus, TaskPayload } from './pipeline-run.js';
export {
  OrchestratorEmitter,
} from './orchestrator-events.js';
export type {
  PipelineStartedEvent,
  StageEnteredEvent,
  GateEvaluatedEvent,
  StageAdvancedEvent,
  PipelineCompletedEvent,
  PipelineFailedEvent,
  ClarificationOpenedEvent,
  ClarificationSettledEvent,
  OrchestratorEventMap,
} from './orchestrator-events.js';
