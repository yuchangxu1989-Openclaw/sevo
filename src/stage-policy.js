/**
 * Stage Policy — single source of truth for pipeline stage rules.
 *
 * Aligned to spec 10-stage abstract chain (原则 4).
 * No stage may block pipeline advancement (原则 3).
 */

const FULL_PIPELINE_STAGES = Object.freeze([
  'specify',
  'spec-review',
  'design',
  'design-review',
  'implement',
  'code-review',
  'smoke',
  'publish',
  'post-release-verify',
  'ledger',
]);

const REVIEW_STAGE_IDS = Object.freeze(new Set([
  'spec-review',
  'design-review',
  'code-review',
]));

/**
 * @param {string} stageId
 * @returns {boolean}
 */
export function isReviewStage(stageId) {
  return REVIEW_STAGE_IDS.has(stageId) ||
    stageId.includes('review') ||
    stageId.includes('audit');
}

export const isProtectedStage = isReviewStage;

/**
 * @param {string} stageId
 * @returns {boolean}
 */
export function canSkip(stageId) {
  return true;
}

/**
 * Validate whether entering the pipeline at targetStage is safe.
 * Always allows entry (原则 3: 永远向前走).
 * Returns advisories for review stages not yet completed.
 *
 * @param {string} targetStage
 * @param {string[]} completedStages
 * @returns {{ allowed: boolean, advisories: Array<{ stageId: string, reason: string }> }}
 */
export function canEnterFrom(targetStage, completedStages) {
  const completedSet = new Set(completedStages);
  const targetIndex = FULL_PIPELINE_STAGES.indexOf(targetStage);
  if (targetIndex < 0) {
    return { allowed: true, advisories: [{ stageId: targetStage, reason: 'stage not in standard pipeline — treated as custom extension' }] };
  }

  const priorStages = FULL_PIPELINE_STAGES.slice(0, targetIndex);
  const advisories = [];
  for (const stageId of priorStages) {
    if (isReviewStage(stageId) && !completedSet.has(stageId)) {
      advisories.push({ stageId, reason: `review stage "${stageId}" not completed prior to entry` });
    }
  }

  return { allowed: true, advisories };
}

export { FULL_PIPELINE_STAGES, REVIEW_STAGE_IDS };
export const PROTECTED_STAGE_IDS = REVIEW_STAGE_IDS;
