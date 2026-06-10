/**
 * Stage Policy — single source of truth for pipeline stage rules.
 *
 * Defines protected stages, skip rules, and entry-from validation.
 */

const FULL_PIPELINE_STAGES = Object.freeze([
  'spec',
  'spec-review-gate',
  'test-case-authoring',
  'ux-acceptance-authoring',
  'commercial-acceptance-authoring',
  'ux-interaction-design',
  'architecture-design',
  'contract',
  'contract-review-gate',
  'implement',
  'review',
  'fix',
  'smoke-test',
  'ux-acceptance',
  'pm-commercial-review',
  'regression',
  'publish-generalization-gate',
  'deploy',
  'verify',
  'readme',
  'post-release-validation',
  'clean-install-verification',
  'ledger',
]);

const PROTECTED_STAGE_IDS = Object.freeze(new Set([
  'implement',
  'review',
  'fix',
  'spec-review-gate',
  'contract-review-gate',
  'publish-generalization-gate',
  'pm-commercial-review',
]));

/**
 * @param {string} stageId
 * @returns {boolean}
 */
export function isProtectedStage(stageId) {
  return PROTECTED_STAGE_IDS.has(stageId) ||
    stageId.includes('review') ||
    stageId.includes('audit');
}

/**
 * @param {string} stageId
 * @returns {boolean}
 */
export function canSkip(stageId) {
  return !isProtectedStage(stageId);
}

/**
 * Validate whether entering the pipeline at targetStage is safe.
 * Returns advisories for protected prior stages not yet completed.
 *
 * @param {string} targetStage
 * @param {string[]} completedStages
 * @returns {{ allowed: boolean, advisories: Array<{ stageId: string, reason: string }> }}
 */
export function canEnterFrom(targetStage, completedStages) {
  const completedSet = new Set(completedStages);
  const targetIndex = FULL_PIPELINE_STAGES.indexOf(targetStage);
  if (targetIndex < 0) {
    return { allowed: false, advisories: [{ stageId: targetStage, reason: 'stage not in pipeline' }] };
  }

  const priorStages = FULL_PIPELINE_STAGES.slice(0, targetIndex);
  const advisories = [];
  for (const stageId of priorStages) {
    if (isProtectedStage(stageId) && !completedSet.has(stageId)) {
      advisories.push({ stageId, reason: `protected stage "${stageId}" not completed prior to entry` });
    }
  }

  return { allowed: true, advisories };
}

export { FULL_PIPELINE_STAGES, PROTECTED_STAGE_IDS };
