/**
 * Stage display-label fallback (non-authoritative).
 *
 * AC-45.3 contract: this is NOT a stage definition and NOT a fixed stage set.
 * It carries human-readable labels for known stage ids only and falls back to
 * the raw stageId for anything not listed, so real pipelines may add or drop
 * stages without editing this file. The authoritative stage queue always comes
 * from real pipeline state (state/active-pipelines.json,
 * data/pipelines/<id>/state.json) via engine-service; this map never enumerates,
 * counts, gates, or filters stages.
 */

const STAGE_DISPLAY_LABELS: Record<string, string> = {
  spec: '需求澄清',
  'spec-review-gate': '需求评审',
  'test-case-authoring': '测试设计',
  'ux-acceptance-authoring': 'UX 验收编写',
  'commercial-acceptance-authoring': '商用验收编写',
  'ux-interaction-design': 'UX 交互设计',
  'architecture-design': '架构设计',
  contract: '方案规划',
  'contract-review-gate': '方案评审',
  implement: '执行落地',
  review: '质量复核',
  'smoke-test': '冒烟测试',
  'ux-acceptance': 'UX 验收',
  'pm-commercial-review': 'PM 商用评审',
  regression: '回归验证',
  'publish-generalization-gate': '发布通用化门禁',
  deploy: '部署发布',
  verify: '结果确认',
  readme: 'README 更新',
  'readme-update': 'README 更新',
  'post-release-validation': '发布后验证',
  'clean-install-verification': '清洁安装验证',
  ledger: '交付账本',
  'spec-gap': '需求规格缺口',
};

/** Resolve a display label, falling back to the raw stageId for unknown stages. */
export function resolveStageLabel(stageId: string): string {
  return STAGE_DISPLAY_LABELS[stageId] ?? stageId;
}
