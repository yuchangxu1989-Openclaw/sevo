/**
 * Review-Fix Loop — advisory-only auto-repair cycle for review stages.
 *
 * When a review stage (code-review, design-review, spec-review) completes with
 * actionable findings (P0/P1), this module enriches the cycle dispatch with:
 * 1. Structured findings context for the fix agent
 * 2. Round counting (max 3 rounds before bail-out)
 * 3. Advisory notification on bail-out (never blocks)
 */

const DEFAULT_MAX_FIX_ROUNDS = 3;
const ACTIONABLE_SEVERITIES = new Set(['p0', 'p1', 'critical', 'high']);

function isReviewFixCycle(completedStageId, nextStageId, stageConfig) {
  if (!stageConfig?.isReviewPhase) return false;
  if (!stageConfig.cycleTarget) return false;
  return stageConfig.cycleTarget === nextStageId;
}

function hasActionableFindings(findingsInfo) {
  if (!findingsInfo || findingsInfo.count === 0) return false;
  if (!findingsInfo.bySeverity) return findingsInfo.count > 0;
  return Object.entries(findingsInfo.bySeverity).some(
    ([sev, count]) => ACTIONABLE_SEVERITIES.has(sev) && count > 0
  );
}

function getFixLoopRound(run, reviewStageId) {
  return Number(run?.stages?.[reviewStageId]?.fixLoopRound || 0);
}

function incrementFixLoopRound(run, reviewStageId, runStore) {
  const current = getFixLoopRound(run, reviewStageId);
  const next = current + 1;
  if (typeof runStore?.patchStage === 'function') {
    runStore.patchStage(run.pipelineRunId, reviewStageId, { fixLoopRound: next });
  } else if (typeof runStore?.patchRun === 'function') {
    const stages = { ...(run.stages || {}) };
    const stageState = { ...(stages[reviewStageId] || {}) };
    stageState.fixLoopRound = next;
    stages[reviewStageId] = stageState;
    runStore.patchRun(run.pipelineRunId, { stages });
  }
  return next;
}

function buildFixPromptContext(reviewStageId, findingsInfo, round, run) {
  const lines = [
    `[SEVO review-fix loop: round ${round}/${DEFAULT_MAX_FIX_ROUNDS}]`,
    `Review stage: ${reviewStageId}`,
    `Findings: ${findingsInfo.count} total${findingsInfo.summary ? ` (${findingsInfo.summary})` : ''}`,
    '',
    'Fix the actionable findings above, then re-submit for review.',
    'Focus on P0/P1 items first. Lower severity items are optional.',
  ];
  return lines.join('\n');
}

function buildReReviewPromptContext(reviewStageId, round, cycleTarget) {
  const lines = [
    `[SEVO review-fix loop: re-review after fix round ${round}]`,
    `Fix stage "${cycleTarget}" completed. Re-reviewing for remaining issues.`,
    `If all P0/P1 findings are resolved, mark as passed to proceed.`,
  ];
  return lines.join('\n');
}

function evaluateReviewFixLoop(run, completedStageId, completedStageStatus, stageConfig, findingsInfo, opts = {}) {
  const maxRounds = Number(opts.maxFixRounds || DEFAULT_MAX_FIX_ROUNDS);
  const cycleTarget = stageConfig.cycleTarget;

  if (completedStageStatus === 'passed') {
    return { action: 'advance', reason: 'review-passed' };
  }

  if (!hasActionableFindings(findingsInfo)) {
    return { action: 'advance', reason: 'no-actionable-findings' };
  }

  const round = getFixLoopRound(run, completedStageId);
  if (round >= maxRounds) {
    return {
      action: 'bail-advisory',
      reason: `max-fix-rounds-reached:${maxRounds}`,
      round,
      advisory: {
        stageId: completedStageId,
        type: 'review-fix-loop-exhausted',
        severity: 'must-review',
        message: `Review-fix loop exhausted after ${maxRounds} rounds. ${findingsInfo.count} findings remain (${findingsInfo.summary || 'unclassified'}). Manual decision required.`,
      },
    };
  }

  return {
    action: 'dispatch-fix',
    reason: 'actionable-findings-present',
    round: round + 1,
    cycleTarget,
    fixContext: buildFixPromptContext(completedStageId, findingsInfo, round + 1, run),
  };
}

function evaluateFixCompletion(run, fixStageId, reviewStageId) {
  const round = getFixLoopRound(run, reviewStageId);
  return {
    action: 'dispatch-re-review',
    reason: 'fix-completed',
    round,
    reviewStageId,
    reReviewContext: buildReReviewPromptContext(reviewStageId, round, fixStageId),
  };
}

export {
  DEFAULT_MAX_FIX_ROUNDS,
  ACTIONABLE_SEVERITIES,
  isReviewFixCycle,
  hasActionableFindings,
  getFixLoopRound,
  incrementFixLoopRound,
  buildFixPromptContext,
  buildReReviewPromptContext,
  evaluateReviewFixLoop,
  evaluateFixCompletion,
};
