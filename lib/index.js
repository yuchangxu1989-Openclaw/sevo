import sevoPlugin from '../index.js';

export { default as plugin } from '../index.js';
export { default as sevoV2Plugin, ContextInjector, PIPELINE_STAGES } from '../src/index.js';
export * as runStore from '../src/run-store.js';
export {
  createRun,
  getRun,
  listActiveRuns,
  advanceStage,
  closeRun,
  archiveStaleRuns,
  markStale,
  restoreRun,
  resetStageForRetry,
  touch,
  patchRun,
  normalizePipelineRunId,
} from '../src/run-store.js';
export { handleCommand, DEFAULT_FULL_PIPELINE_STAGES } from '../src/pipeline-commands.js';
export { handleCompletion } from '../src/completion-handler.js';
export { buildInjection, isGoalVague } from '../src/prompt-injector.js';
export { encode, decode, isSevoLabel } from '../src/label-protocol.js';
export { FULL_PIPELINE_STAGES, PROTECTED_STAGE_IDS, isProtectedStage, canSkip, canEnterFrom } from '../src/stage-policy.js';
export { append as appendAdvisory, resolve as resolveAdvisory, listOpen as listOpenAdvisories } from '../src/advisory-ledger.js';
export { EVIDENCE_REQUIREMENTS, getEvidenceRequirement, validateCompletion } from '../src/evidence-contract.js';
export { buildAdvancePrompt, ADVANCE_PROMPT_REQUIRED_FIELDS } from '../src/advance-prompt-contract.js';
export { getCheckPlan, formatCheckPlan } from '../src/consistency-check-plan.js';
export {
  ROUTE_VECTOR_DB_PATH,
  ROUTE_VECTOR_DB_VERSION,
  ROUTE_VECTOR_DIRECT_THRESHOLD,
  ROUTE_VECTOR_FALLBACK_THRESHOLD,
  ROUTE_VECTOR_MIN_MARGIN,
  readEmbeddingConfig,
  embedText,
  loadRouteVectorDb,
  classifyPipelineRoute,
  classifyStageRoute,
  classifyCommandRoute,
  selfTestRouteVectors,
  saveRouteVectorDb,
} from '../src/route-classifier.js';

export default sevoPlugin;
