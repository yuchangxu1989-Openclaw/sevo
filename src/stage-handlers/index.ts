/**
 * Stage Handler Registry — central dispatch for the 14-stage SEVO pipeline.
 *
 * The PipelineEngine (src/pipeline/pipeline-engine.ts) drives state
 * transitions; this registry provides the per-stage "do real work" logic
 * that produces files under projects/<slug>/.
 *
 * Each handler is pure-ish: it takes a StageHandlerContext (project paths,
 * optional LLM, previous results) and returns a StageHandlerResult with
 * artifacts and verdict.
 *
 * Mapping handler key -> SEVO StageId:
 *   specify                       -> spec
 *   spec-review-gate              -> spec-review-gate
 *   contract                      -> contract
 *   contract-review-gate          -> contract-review-gate
 *   implement                     -> implement
 *   review                        -> review
 *   review-fix-loop               -> (sub-stage of fix-loop, no canonical stageId)
 *   regression                    -> regression
 *   publish-generalization-gate   -> publish-generalization-gate
 *   deploy                        -> deploy
 *   verify                        -> verify
 *   readme                        -> readme
 *   endgame-scan                  -> (cross-cuts post-release-validation + clean-install-verification)
 *   ledger                        -> ledger
 */

import type { StageId } from '../types/index.js';
import type { StageHandler } from './types.js';

import { contractHandler } from './contract-handler.js';
import { contractReviewGateHandler } from './contract-review-gate-handler.js';
import { deployHandler } from './deploy-handler.js';
import { endgameScanHandler } from './endgame-scan-handler.js';
import { implementHandler } from './implement-handler.js';
import { ledgerHandler } from './ledger-handler.js';
import { publishGeneralizationGateHandler } from './publish-generalization-gate-handler.js';
import { readmeHandler } from './readme-handler.js';
import { regressionHandler } from './regression-handler.js';
import { reviewFixLoopHandler } from './review-fix-loop-handler.js';
import { reviewHandler } from './review-handler.js';
import { specifyHandler } from './specify-handler.js';
import { specReviewGateHandler } from './spec-review-gate-handler.js';
import { verifyHandler } from './verify-handler.js';
import { verifyWithRealDataHandler } from '../stages/verify-real-data-gate.js';

export type StageHandlerKey =
  | 'specify'
  | 'spec-review-gate'
  | 'contract'
  | 'contract-review-gate'
  | 'implement'
  | 'review'
  | 'review-fix-loop'
  | 'regression'
  | 'verify-with-real-data'
  | 'publish-generalization-gate'
  | 'deploy'
  | 'verify'
  | 'readme'
  | 'endgame-scan'
  | 'ledger';

export const STAGE_HANDLERS: Record<StageHandlerKey, StageHandler> = {
  specify: specifyHandler,
  'spec-review-gate': specReviewGateHandler,
  contract: contractHandler,
  'contract-review-gate': contractReviewGateHandler,
  implement: implementHandler,
  review: reviewHandler,
  'review-fix-loop': reviewFixLoopHandler,
  regression: regressionHandler,
  'verify-with-real-data': verifyWithRealDataHandler,
  'publish-generalization-gate': publishGeneralizationGateHandler,
  deploy: deployHandler,
  verify: verifyHandler,
  readme: readmeHandler,
  'endgame-scan': endgameScanHandler,
  ledger: ledgerHandler,
};

export const STAGE_HANDLER_ORDER: readonly StageHandlerKey[] = [
  'specify',
  'spec-review-gate',
  'contract',
  'contract-review-gate',
  'implement',
  'review',
  'review-fix-loop',
  'regression',
  'verify-with-real-data',
  'publish-generalization-gate',
  'deploy',
  'verify',
  'readme',
  'endgame-scan',
  'ledger',
] as const;

/** Maps the 14-stage handler key to the canonical PipelineEngine StageId. */
export const STAGE_HANDLER_TO_STAGE_ID: Record<StageHandlerKey, StageId | null> = {
  specify: 'spec',
  'spec-review-gate': 'spec-review-gate',
  contract: 'contract',
  'contract-review-gate': 'contract-review-gate',
  implement: 'implement',
  review: 'review',
  'review-fix-loop': null, // sub-stage, no top-level pipeline stage
  regression: 'regression',
  'verify-with-real-data': null, // gate before publish, no canonical stageId
  'publish-generalization-gate': 'publish-generalization-gate',
  deploy: 'deploy',
  verify: 'verify',
  readme: 'readme',
  'endgame-scan': null, // covers post-release-validation + clean-install-verification
  ledger: 'ledger',
};

export function getStageHandler(key: StageHandlerKey): StageHandler {
  const handler = STAGE_HANDLERS[key];
  if (!handler) throw new Error(`Unknown stage handler: ${key}`);
  return handler;
}

export type { StageHandler, StageHandlerContext, StageHandlerResult, StageVerdict } from './types.js';
export { contractHandler } from './contract-handler.js';
export { contractReviewGateHandler } from './contract-review-gate-handler.js';
export { deployHandler } from './deploy-handler.js';
export { endgameScanHandler } from './endgame-scan-handler.js';
export { implementHandler } from './implement-handler.js';
export { ledgerHandler } from './ledger-handler.js';
export { publishGeneralizationGateHandler } from './publish-generalization-gate-handler.js';
export { readmeHandler } from './readme-handler.js';
export { regressionHandler } from './regression-handler.js';
export { reviewFixLoopHandler } from './review-fix-loop-handler.js';
export { reviewHandler } from './review-handler.js';
export { specifyHandler } from './specify-handler.js';
export { specReviewGateHandler } from './spec-review-gate-handler.js';
export { verifyHandler } from './verify-handler.js';
export { verifyWithRealDataHandler } from '../stages/verify-real-data-gate.js';
