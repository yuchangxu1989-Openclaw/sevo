/**
 * Stage Pipeline Config — single config table driving all advance logic.
 *
 * Aligned to spec 10-stage abstract chain (原则 4).
 * reviewGate removed — review stages use advisory-only fix loops (原则 3).
 */

const STAGE_PIPELINE_CONFIG = Object.freeze([
  {
    stageId: 'specify',
    role: 'pm',
    tier: 'pm',
    timeout: 1800,
    isReviewPhase: false,
    cycleTarget: null,
    cycleCondition: null,
    advanceCondition: 'passed',
    entryCriteria: '有明确的用户需求或变更请求',
    exitCriteria: 'PRD 完成且覆盖所有 FR/AC',
    roleHint: '下一阶段是 spec-review，建议派 SA/架构 agent 做需求评审',
  },
  {
    stageId: 'spec-review',
    role: 'architecture',
    tier: 'arch',
    timeout: 1200,
    isReviewPhase: true,
    cycleTarget: 'specify',
    cycleCondition: 'repairing',
    advanceCondition: 'passed',
    entryCriteria: 'PRD 已提交且格式完整',
    exitCriteria: '架构师确认需求无歧义、可实现',
    roleHint: '下一阶段是 design，建议派 SA agent 做架构设计',
  },
  {
    stageId: 'design',
    role: 'architecture',
    tier: 'arch',
    timeout: 3600,
    isReviewPhase: false,
    cycleTarget: null,
    cycleCondition: null,
    advanceCondition: 'passed',
    entryCriteria: 'spec-review 通过',
    exitCriteria: '架构设计文档+ADR+契约产出',
    roleHint: '下一阶段是 design-review，建议派 audit agent 审查设计',
  },
  {
    stageId: 'design-review',
    role: 'review',
    tier: 'audit',
    timeout: 1200,
    isReviewPhase: true,
    cycleTarget: 'design',
    cycleCondition: 'repairing',
    advanceCondition: 'passed',
    entryCriteria: '架构设计文档已提交',
    exitCriteria: '审计确认设计完整、无矛盾',
    roleHint: '下一阶段是 implement，建议派 coding agent 执行实现',
  },
  {
    stageId: 'implement',
    role: 'dev',
    tier: 'T1',
    timeout: 3600,
    isReviewPhase: false,
    cycleTarget: null,
    cycleCondition: null,
    advanceCondition: 'passed',
    entryCriteria: 'design-review 通过',
    exitCriteria: '代码实现完成，通过本地测试',
    roleHint: '下一阶段是 code-review，建议派 audit agent 做代码审计',
  },
  {
    stageId: 'code-review',
    role: 'audit',
    tier: 'audit',
    timeout: 1200,
    isReviewPhase: true,
    cycleTarget: 'implement',
    cycleCondition: 'repairing',
    advanceCondition: 'passed',
    entryCriteria: '实现代码已提交',
    exitCriteria: '代码审计通过，0 P0/P1 findings',
    roleHint: '下一阶段是 smoke，建议派 audit agent 做冒烟测试',
  },
  {
    stageId: 'smoke',
    role: 'audit',
    tier: 'audit',
    timeout: 1200,
    isReviewPhase: false,
    cycleTarget: null,
    cycleCondition: null,
    advanceCondition: 'passed',
    entryCriteria: 'code-review 通过',
    exitCriteria: '冒烟测试全部通过',
    roleHint: '下一阶段是 publish，建议派 coding agent 执行发布',
  },
  {
    stageId: 'publish',
    role: 'dev',
    tier: 'T1',
    timeout: 1200,
    isReviewPhase: false,
    cycleTarget: null,
    cycleCondition: null,
    advanceCondition: 'passed',
    entryCriteria: 'smoke 通过',
    exitCriteria: '发布成功，包/服务可用',
    roleHint: '下一阶段是 post-release-verify，建议派 audit agent 做发布后验证',
  },
  {
    stageId: 'post-release-verify',
    role: 'audit',
    tier: 'audit',
    timeout: 1200,
    isReviewPhase: false,
    cycleTarget: null,
    cycleCondition: null,
    advanceCondition: 'passed',
    entryCriteria: 'publish 完成',
    exitCriteria: '发布后验证通过，线上无异常',
    roleHint: '下一阶段是 ledger，建议派 coding agent 写入交付账本',
  },
  {
    stageId: 'ledger',
    role: 'dev',
    tier: 'T3',
    timeout: 600,
    isReviewPhase: false,
    cycleTarget: null,
    cycleCondition: null,
    advanceCondition: 'passed',
    entryCriteria: 'post-release-verify 通过',
    exitCriteria: '交付记录写入账本',
    roleHint: '流水线全部阶段完成，无后续阶段',
  },
]);

const STAGE_CONFIG_MAP = Object.freeze(
  Object.fromEntries(STAGE_PIPELINE_CONFIG.map((entry) => [entry.stageId, entry]))
);

function getStageConfig(stageId) {
  return STAGE_CONFIG_MAP[stageId] || null;
}

function getCycleTarget(stageId, status) {
  const config = STAGE_CONFIG_MAP[stageId];
  if (!config?.cycleTarget || !config.cycleCondition) return null;
  if (config.cycleCondition === status) return config.cycleTarget;
  return null;
}

function getRoleHint(stageId) {
  const config = STAGE_CONFIG_MAP[stageId];
  return config?.roleHint || '';
}

function getEntryCriteria(stageId) {
  const config = STAGE_CONFIG_MAP[stageId];
  return config?.entryCriteria || '';
}

function getExitCriteria(stageId) {
  const config = STAGE_CONFIG_MAP[stageId];
  return config?.exitCriteria || '';
}

export { STAGE_PIPELINE_CONFIG, STAGE_CONFIG_MAP, getStageConfig, getCycleTarget, getRoleHint, getEntryCriteria, getExitCriteria };
