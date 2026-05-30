/**
 * SEVO Constants — centralized magic strings, numbers, and thresholds.
 *
 * All stage names, timeout values, retry counts, and threshold numbers
 * that were previously scattered across multiple files live here.
 */

import type { StageId } from './types/index.js';

// ─── Stage Names (canonical order, spec §4, arc42 §6.1) ───

export const STAGE_IDS = {
  SPEC: 'spec' as StageId,
  SPEC_REVIEW_GATE: 'spec-review-gate' as StageId,
  TEST_CASE_AUTHORING: 'test-case-authoring' as StageId,
  UX_ACCEPTANCE_AUTHORING: 'ux-acceptance-authoring' as StageId,
  COMMERCIAL_ACCEPTANCE_AUTHORING: 'commercial-acceptance-authoring' as StageId,
  UX_INTERACTION_DESIGN: 'ux-interaction-design' as StageId,
  ARCHITECTURE_DESIGN: 'architecture-design' as StageId,
  CONTRACT: 'contract' as StageId,
  CONTRACT_REVIEW_GATE: 'contract-review-gate' as StageId,
  IMPLEMENT: 'implement' as StageId,
  REVIEW: 'review' as StageId,
  SMOKE_TEST: 'smoke-test' as StageId,
  UX_ACCEPTANCE: 'ux-acceptance' as StageId,
  PM_COMMERCIAL_REVIEW: 'pm-commercial-review' as StageId,
  REGRESSION: 'regression' as StageId,
  PUBLISH_GENERALIZATION_GATE: 'publish-generalization-gate' as StageId,
  DEPLOY: 'deploy' as StageId,
  VERIFY: 'verify' as StageId,
  POST_RELEASE_VALIDATION: 'post-release-validation' as StageId,
  CLEAN_INSTALL_VERIFICATION: 'clean-install-verification' as StageId,
  LEDGER: 'ledger' as StageId,
} as const;

/** All stages in canonical order. */
export const ALL_STAGES: readonly StageId[] = [
  STAGE_IDS.SPEC,
  STAGE_IDS.SPEC_REVIEW_GATE,
  STAGE_IDS.TEST_CASE_AUTHORING,
  STAGE_IDS.UX_ACCEPTANCE_AUTHORING,
  STAGE_IDS.COMMERCIAL_ACCEPTANCE_AUTHORING,
  STAGE_IDS.UX_INTERACTION_DESIGN,
  STAGE_IDS.ARCHITECTURE_DESIGN,
  STAGE_IDS.CONTRACT,
  STAGE_IDS.CONTRACT_REVIEW_GATE,
  STAGE_IDS.IMPLEMENT,
  STAGE_IDS.REVIEW,
  STAGE_IDS.SMOKE_TEST,
  STAGE_IDS.UX_ACCEPTANCE,
  STAGE_IDS.PM_COMMERCIAL_REVIEW,
  STAGE_IDS.REGRESSION,
  STAGE_IDS.PUBLISH_GENERALIZATION_GATE,
  STAGE_IDS.DEPLOY,
  STAGE_IDS.VERIFY,
  STAGE_IDS.POST_RELEASE_VALIDATION,
  STAGE_IDS.CLEAN_INSTALL_VERIFICATION,
  STAGE_IDS.LEDGER,
] as const;

// ─── L0 Routing Constants ───

/** Stages required for L0 (micro-change) pipelines. */
export const L0_REQUIRED_STAGES: ReadonlySet<StageId> = new Set<StageId>([
  STAGE_IDS.IMPLEMENT,
  STAGE_IDS.REVIEW,
  STAGE_IDS.REGRESSION,
  STAGE_IDS.VERIFY,
  STAGE_IDS.LEDGER,
]);

/** Skip reasons for L0 stages. */
export const L0_SKIP_REASONS: Readonly<Record<string, string>> = {
  [STAGE_IDS.SPEC]: 'L0 微小改动，直接进入 Implement',
  [STAGE_IDS.SPEC_REVIEW_GATE]: 'L0 无 Spec 阶段，无需 Spec Review Gate',
  [STAGE_IDS.TEST_CASE_AUTHORING]: 'L0 微小改动，无需独立测试用例编写',
  [STAGE_IDS.UX_ACCEPTANCE_AUTHORING]: 'L0 微小改动，无需 UX 开箱即用评测',
  [STAGE_IDS.COMMERCIAL_ACCEPTANCE_AUTHORING]: 'L0 微小改动，无需商用评测',
  [STAGE_IDS.UX_INTERACTION_DESIGN]: 'L0 微小改动，无需 UX 交互设计',
  [STAGE_IDS.ARCHITECTURE_DESIGN]: 'L0 微小改动，无需架构详设',
  [STAGE_IDS.CONTRACT]: 'L0 微小改动，无需架构契约',
  [STAGE_IDS.CONTRACT_REVIEW_GATE]: 'L0 无 Contract 阶段，无需 Contract Review Gate',
  [STAGE_IDS.SMOKE_TEST]: 'L0 微小改动，无需 Smoke Test',
  [STAGE_IDS.UX_ACCEPTANCE]: 'L0 微小改动，无需 UX 视觉验收',
  [STAGE_IDS.PM_COMMERCIAL_REVIEW]: 'L0 微小改动，无需 PM 商用就绪评审',
  [STAGE_IDS.PUBLISH_GENERALIZATION_GATE]: 'L0 微小改动，无需发布通用化门禁',
  [STAGE_IDS.DEPLOY]: 'L0 微小改动，无需正式发布流程',
  [STAGE_IDS.POST_RELEASE_VALIDATION]: 'L0 微小改动，无需发布后验证',
  [STAGE_IDS.CLEAN_INSTALL_VERIFICATION]: 'L0 微小改动，无需干净环境验证',
};

// ─── Level Classifier Thresholds ───

export const L2_THRESHOLDS = {
  lines: 500,
  files: 10,
  domains: 2,
} as const;

export const L0_THRESHOLDS = {
  maxFiles: 1,
  maxLines: 50,
} as const;

// ─── Pipeline Engine Constants ───

/** Stages that support clarification scanning. */
export const CLARIFICATION_SCANNABLE_STAGES: readonly StageId[] = [
  STAGE_IDS.SPEC,
  STAGE_IDS.CONTRACT,
  STAGE_IDS.IMPLEMENT,
];

/** Block reasons used by the pipeline engine. */
export const BLOCK_REASONS = {
  TEST_CASE: 'Test Case Document not ready (ADR-004)',
  CLARIFICATION: 'Blocking clarification open',
} as const;

// ─── Parallel Branch Constants ───

/** Stages that fork in parallel after spec-review-gate. */
export const PARALLEL_FORK_AFTER_SPEC_REVIEW: readonly StageId[] = [
  STAGE_IDS.CONTRACT,
  STAGE_IDS.TEST_CASE_AUTHORING,
  STAGE_IDS.UX_ACCEPTANCE_AUTHORING,
  STAGE_IDS.COMMERCIAL_ACCEPTANCE_AUTHORING,
  STAGE_IDS.UX_INTERACTION_DESIGN,
  STAGE_IDS.ARCHITECTURE_DESIGN,
];

// ─── Review Fix Loop Constants ───

export const REVIEW_FIX_LOOP = {
  DEFAULT_MAX_ATTEMPTS: 3,
  MAX_DEFERRED_ROUNDS: 3,
} as const;

// ─── Default Config Constants ───

export const DEFAULT_STAGES: StageId[] = [
  STAGE_IDS.SPEC,
  STAGE_IDS.SPEC_REVIEW_GATE,
  STAGE_IDS.IMPLEMENT,
  STAGE_IDS.REVIEW,
  STAGE_IDS.SMOKE_TEST,
  STAGE_IDS.UX_ACCEPTANCE,
  STAGE_IDS.PM_COMMERCIAL_REVIEW,
  STAGE_IDS.PUBLISH_GENERALIZATION_GATE,
  STAGE_IDS.DEPLOY,
  STAGE_IDS.LEDGER,
];
