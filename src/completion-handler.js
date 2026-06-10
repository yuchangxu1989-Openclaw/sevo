import * as defaultRunStore from './run-store.js';
import { decode, encode } from './label-protocol.js';
import { validateCompletion } from './evidence-contract.js';
import { append as appendAdvisory } from './advisory-ledger.js';
import { renderAdvancePromptTemplate } from '../advance-prompt-templates.js';
import { getStageMapping } from '../task-mapper.js';

const REVIEW_FIX_CYCLE = Object.freeze({
  review: 'fix',
  fix: 'review',
});

const DEFAULT_MAX_ADVANCES_PER_RUN_ROUND = 3;
const ADVANCE_TEMPLATE_NAME = 'autoAdvanceAction';
const MAX_REVIEW_FIX_ATTEMPTS = 5;

function noop() {}

function getLogger(deps) {
  return deps?.logger || { debug: noop, info: noop, warn: noop, error: noop };
}

function extractLabel(evt) {
  return (
    evt?.label ||
    evt?.result?.label ||
    evt?.task?.label ||
    evt?.payload?.label ||
    evt?.data?.label ||
    null
  );
}

function normalizeStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (['passed', 'pass', 'success', 'succeeded', 'completed', 'complete', 'ok'].includes(normalized)) {
    return 'passed';
  }
  if (['blocked', 'cancelled', 'canceled', 'skipped'].includes(normalized)) return 'blocked';
  if (['failed', 'fail', 'failure', 'error', 'errored', 'timeout', 'timed_out'].includes(normalized)) {
    return 'failed';
  }
  return null;
}

function extractArtifacts(evt) {
  const candidates = [
    evt?.artifacts,
    evt?.result?.artifacts,
    evt?.output?.artifacts,
    evt?.payload?.artifacts,
  ];
  const artifacts = candidates.find((value) => Array.isArray(value));
  return artifacts ? artifacts.filter((artifact) => typeof artifact === 'string' && artifact.trim()) : [];
}

function extractDispatchId(evt) {
  return (
    evt?.dispatchId ||
    evt?.taskId ||
    evt?.sessionKey ||
    evt?.result?.dispatchId ||
    evt?.result?.taskId ||
    null
  );
}

function findRunFromDecodedLabel(decoded, runStore) {
  if (!decoded?.pipelineRunId) return null;

  const direct = runStore.getRun(decoded.pipelineRunId);
  if (direct) return direct;

  const activeRuns = runStore.listActiveRuns(decoded.projectSlug);
  const matches = activeRuns.filter((run) => run.pipelineRunId?.startsWith(decoded.pipelineRunIdShort));
  return matches.length === 1 ? matches[0] : null;
}

function findRunFromLegacyLabel(decoded, runStore) {
  if (!decoded?.projectSlug || !decoded?.stageId) return null;
  const activeRuns = runStore.listActiveRuns(decoded.projectSlug);
  const matches = activeRuns.filter(
    (run) => run.currentStageId === decoded.stageId && run.status === 'running',
  );
  return matches.length === 1 ? matches[0] : null;
}

function stageMatches(run, stageId, attempt) {
  const stage = run?.stages?.[stageId];
  if (!stage) return false;
  if (run.currentStageId !== stageId) return false;
  return Number(stage.attempt || 1) === Number(attempt || 1);
}

function getNextStageId(run, completedStageId) {
  const ordered = Array.isArray(run?.stagePlan?.ordered) ? run.stagePlan.ordered : [];
  const index = ordered.indexOf(completedStageId);
  if (index < 0) return null;

  return (
    ordered
      .slice(index + 1)
      .find((stageId) => !['passed', 'failed', 'blocked', 'skipped'].includes(run.stages?.[stageId]?.status)) ||
    null
  );
}

function markRunCompleteIfPossible(run, runStore) {
  if (typeof runStore.closeRun !== 'function') return run;
  runStore.closeRun(run.pipelineRunId, { status: 'completed', reason: 'all V2 stages passed' });
  return runStore.getRun(run.pipelineRunId) || { ...run, status: 'completed' };
}

function getStagePromptTemplateRef(stageId) {
  return `task-mapper.buildTaskPrompt("${stageId}", runSnapshot, projectSlug, projectRoot)`;
}

function trackAdvanceDepth(pipelineRunId, deps) {
  const maxDepth = Number(deps?.maxAdvancesPerRunRound || DEFAULT_MAX_ADVANCES_PER_RUN_ROUND);
  const counter = deps?.advanceDepthByRun instanceof Map ? deps.advanceDepthByRun : new Map();
  const currentDepth = Number(counter.get(pipelineRunId) || 0);
  if (currentDepth >= maxDepth) {
    return { allowed: false, depth: currentDepth, maxDepth };
  }
  counter.set(pipelineRunId, currentDepth + 1);
  return { allowed: true, depth: currentDepth + 1, maxDepth };
}

function buildRunCompleteText(run) {
  return [
    '[SEVO V2 advance]',
    `Pipeline run ${run.pipelineRunId} has completed all configured stages.`,
    `Project: ${run.projectSlug}`,
    'No next stage dispatch is required.',
  ].join('\n');
}

function buildStageTaskDescription(run, completedStageId, nextStageId, stagePromptTemplateRef) {
  const completedArtifacts = run.stages?.[completedStageId]?.artifacts || [];
  return [
    `[SEVO V2] Continue pipeline run ${run.pipelineRunId}.`,
    `Project: ${run.projectSlug}`,
    `Goal: ${run.goal}`,
    `Completed stage: ${completedStageId}`,
    `Next stage: ${nextStageId}`,
    completedArtifacts.length > 0 ? `Artifacts from completed stage: ${completedArtifacts.join(', ')}` : null,
    `Stage prompt template reference: ${stagePromptTemplateRef}`,
    'Use the referenced stage prompt template as the task body source for this dispatch.',
  ]
    .filter(Boolean)
    .join('\n');
}

function computeAdvance(run, completedStageId, deps = {}) {
  const nextStageId = getNextStageId(run, completedStageId);
  if (!nextStageId) {
    const completedRun = markRunCompleteIfPossible(run, deps.runStore || defaultRunStore);
    return {
      advanceText: buildRunCompleteText(completedRun),
      nextStageId: null,
      runSnapshot: completedRun,
    };
  }

  const depth = trackAdvanceDepth(run.pipelineRunId, deps);
  if (!depth.allowed) {
    return {
      advanceText: null,
      nextStageId,
      runSnapshot: run,
      recursionBlocked: true,
      reason: `advance-depth-limit:${depth.maxDepth}`,
    };
  }

  const mapping = deps.getStageMapping ? deps.getStageMapping(nextStageId) : getStageMapping(nextStageId);
  const label = encode({
    projectSlug: run.projectSlug,
    pipelineRunId: run.pipelineRunId,
    stageId: nextStageId,
    attempt: run.stages?.[nextStageId]?.attempt || 1,
  });
  const stagePromptTemplateRef =
    typeof deps.getStagePromptTemplateRef === 'function'
      ? deps.getStagePromptTemplateRef(nextStageId, run)
      : getStagePromptTemplateRef(nextStageId);
  const timeout = Number(mapping?.timeout || 1200);
  const agentLine = mapping?.agentId
    ? `Recommended agentId: ${mapping.agentId}`
    : `Recommended agentId: auto (${mapping?.tier || 'stage mapping'} tier)`;
  const taskDescription = buildStageTaskDescription(run, completedStageId, nextStageId, stagePromptTemplateRef);
  const renderer = deps.renderAdvancePromptTemplate || renderAdvancePromptTemplate;
  const advanceText = renderer(ADVANCE_TEMPLATE_NAME, {
    agentLine,
    timeout,
    label,
    taskDescription,
    roleNavHint: '',
    roleRelevantAgents: '',
    commercializationGateBlock: '',
  });

  return {
    advanceText,
    nextStageId,
    runSnapshot: run,
    dispatchHint: {
      agentId: mapping?.agentId || null,
      tier: mapping?.tier || null,
      timeout,
      label,
      stagePromptTemplateRef,
    },
  };
}

function buildFailureAdvanceText(run, stageId, status, evt) {
  const attempt = run.stages?.[stageId]?.attempt || 1;
  const reason = evt?.result?.reason || evt?.reason || evt?.error || 'unknown failure';
  return [
    '[SEVO V2 advance — stage failure recovery]',
    `Pipeline run ${run.pipelineRunId} stage "${stageId}" ${status} (attempt ${attempt}).`,
    `Project: ${run.projectSlug}`,
    `Failure reason: ${reason}`,
    '',
    'Recommended action: retry this stage with `sevo:retry` or diagnose with `sevo:diagnose`.',
    `To retry: sevo:retry pipelineRunId=${run.pipelineRunId} stageId=${stageId}`,
    `To skip:  sevo:skip pipelineRunId=${run.pipelineRunId} stageId=${stageId}`,
  ].join('\n');
}

function buildCycleAdvanceText(run, fromStageId, toStageId, reason) {
  const attempt = run.stages?.[toStageId]?.attempt || 1;
  const lines = [
    `[SEVO V2 advance — ${fromStageId}→${toStageId} cycle]`,
    `Pipeline run ${run.pipelineRunId}: "${fromStageId}" triggered cycle to "${toStageId}".`,
    `Project: ${run.projectSlug}`,
    `Reason: ${reason}`,
    `Attempt: ${attempt}/${MAX_REVIEW_FIX_ATTEMPTS}`,
    '',
  ];

  if (toStageId === 'review') {
    lines.push(
      '## Dispatch: Audit Task',
      '派发独立审计 agent 对上一轮 fix 产出进行代码审计：',
      '- 审计范围：fix 阶段 artifacts + 相关变更文件',
      '- 审计标准：功能正确性、安全性、spec 一致性',
      '- 产出：audit report（PASS/FAIL + findings）',
      `- 完成后以 label 报告结果（status=passed 表示审计通过，status=failed 表示需要修复）`,
    );
  } else if (toStageId === 'fix') {
    lines.push(
      '## Dispatch: Fix Task',
      '派发修复 agent 处理审计发现的问题：',
      `- 修复依据：review 阶段 findings（reason: ${reason}）`,
      '- 修复范围：仅修复 findings 指出的问题，不做额外重构',
      '- 产出：修复后的代码 + 修复说明',
      '- 完成后以 label 报告结果（status=passed 表示修复完成）',
    );
  }

  return lines.join('\n');
}

function handleReviewFixCycle(run, completedStageId, status, evt, deps) {
  const runStore = deps.runStore || defaultRunStore;
  const cycleTarget = REVIEW_FIX_CYCLE[completedStageId];
  if (!cycleTarget) return null;
  if (!run.stagePlan.ordered.includes(cycleTarget)) return null;

  if (completedStageId === 'review' && status === 'failed') {
    const currentAttempt = run.stages?.fix?.attempt || 0;
    if (currentAttempt >= MAX_REVIEW_FIX_ATTEMPTS) {
      return {
        advanceText: [
          `[SEVO V2 advance — review→fix cycle EXHAUSTED]`,
          `Pipeline run ${run.pipelineRunId}: review→fix cycle reached max attempts (${MAX_REVIEW_FIX_ATTEMPTS}).`,
          `Project: ${run.projectSlug}`,
          'Action: pipeline blocked. Manual intervention required.',
          'Use `sevo:diagnose` or `sevo:cancel` to proceed.',
        ].join('\n'),
        nextStageId: null,
        runSnapshot: run,
      };
    }
    const updatedRun = runStore.resetStageForRetry(run.pipelineRunId, 'fix');
    const reason = evt?.result?.reason || evt?.reason || 'review found issues';
    return computeCycleAdvance(updatedRun, 'review', 'fix', reason, deps);
  }

  if (completedStageId === 'fix' && status === 'passed') {
    const updatedRun = runStore.resetStageForRetry(run.pipelineRunId, 'review');
    return computeCycleAdvance(updatedRun, 'fix', 'review', 'fix completed, re-review required', deps);
  }

  return null;
}

function computeCycleAdvance(run, fromStageId, toStageId, reason, deps) {
  const depth = trackAdvanceDepth(run.pipelineRunId, deps);
  if (!depth.allowed) {
    return { advanceText: null, nextStageId: toStageId, runSnapshot: run, recursionBlocked: true, reason: `advance-depth-limit:${depth.maxDepth}` };
  }

  const mapping = deps.getStageMapping ? deps.getStageMapping(toStageId) : getStageMapping(toStageId);
  const label = encode({
    projectSlug: run.projectSlug,
    pipelineRunId: run.pipelineRunId,
    stageId: toStageId,
    attempt: run.stages?.[toStageId]?.attempt || 1,
  });
  const stagePromptTemplateRef =
    typeof deps.getStagePromptTemplateRef === 'function'
      ? deps.getStagePromptTemplateRef(toStageId, run)
      : getStagePromptTemplateRef(toStageId);
  const timeout = Number(mapping?.timeout || 1200);
  const agentLine = mapping?.agentId
    ? `Recommended agentId: ${mapping.agentId}`
    : `Recommended agentId: auto (${mapping?.tier || 'stage mapping'} tier)`;
  const taskDescription = buildStageTaskDescription(run, fromStageId, toStageId, stagePromptTemplateRef);
  const cycleContext = buildCycleAdvanceText(run, fromStageId, toStageId, reason);
  const renderer = deps.renderAdvancePromptTemplate || renderAdvancePromptTemplate;
  const advanceText = renderer(ADVANCE_TEMPLATE_NAME, {
    agentLine,
    timeout,
    label,
    taskDescription: `${cycleContext}\n\n${taskDescription}`,
    roleNavHint: '',
    roleRelevantAgents: '',
    commercializationGateBlock: '',
  });

  return { advanceText, nextStageId: toStageId, runSnapshot: run };
}

/**
 * Handle a V2 SEVO subagent completion event.
 *
 * The handler decodes the SEVO label, resolves the PipelineRun, validates that
 * the completed stage is the active stage, persists the stage status through
 * run-store, and returns one ephemeral advance text for the next stage when the
 * completed stage passed. The advance text is not written to disk.
 *
 * @param {object} evt subagent_ended event payload.
 * @param {{ logger?: object, runStore?: object, advanceDepthByRun?: Map<string, number>, maxAdvancesPerRunRound?: number, getStageMapping?: Function, renderAdvancePromptTemplate?: Function, getStagePromptTemplateRef?: Function }} [deps]
 * @returns {{ advanceText: string | null, nextStageId: string | null, runSnapshot: object, advisories?: object[] } | null}
 */
export function handleCompletion(evt, deps = {}) {
  const logger = getLogger(deps);
  const runStore = deps.runStore || defaultRunStore;
  const label = extractLabel(evt);
  const decoded = decode(label);
  if (!decoded?.stageId) {
    logger.debug?.('completion-handler skipped: no stageId in label', { label });
    return null;
  }

  let run = decoded.pipelineRunId ? findRunFromDecodedLabel(decoded, runStore) : null;
  if (!run) {
    run = findRunFromLegacyLabel(decoded, runStore);
  }
  if (!run) {
    logger.debug?.('completion-handler skipped: no matching V2 run', { label, decoded });
    return null;
  }

  if (!stageMatches(run, decoded.stageId, decoded.attempt)) {
    logger.warn?.('completion-handler skipped: stage mismatch', {
      label,
      pipelineRunId: run.pipelineRunId,
      currentStageId: run.currentStageId,
      stageId: decoded.stageId,
      attempt: decoded.attempt,
    });
    return null;
  }

  const status = normalizeStatus(evt?.status || evt?.result?.status || evt?.state);
  if (!status) {
    logger.warn?.('completion-handler skipped: unknown completion status', { label, status: evt?.status });
    return null;
  }

  const evidenceValidation = validateCompletion(decoded.stageId, evt);
  const advisories = evidenceValidation.advisories;
  if (advisories.length > 0) {
    logger.warn?.('completion-handler evidence advisory', {
      pipelineRunId: run.pipelineRunId,
      stageId: decoded.stageId,
      missing: evidenceValidation.missing,
    });
    for (const adv of advisories) {
      appendAdvisory(run.pipelineRunId, {
        stageId: adv.stageId,
        type: adv.type,
        severity: 'warn',
        message: adv.message,
        evidence: adv.missing || [],
      }, { runStore });
    }
  }

  const updatedRun = runStore.advanceStage(run.pipelineRunId, decoded.stageId, {
    status,
    artifacts: extractArtifacts(evt),
    dispatchId: extractDispatchId(evt),
  });

  // Review-fix cycle: review fails → fix, fix passes → review
  const cycleResult = handleReviewFixCycle(updatedRun, decoded.stageId, status, evt, { ...deps, runStore });
  if (cycleResult) {
    if (cycleResult.recursionBlocked) {
      logger.warn?.('completion-handler cycle advance blocked by recursion guard', {
        pipelineRunId: run.pipelineRunId,
        reason: cycleResult.reason,
      });
      return null;
    }
    return {
      advanceText: cycleResult.advanceText,
      nextStageId: cycleResult.nextStageId,
      runSnapshot: cycleResult.runSnapshot,
      advisories,
    };
  }

  if (status !== 'passed') {
    const failAdvanceText = buildFailureAdvanceText(updatedRun, decoded.stageId, status, evt);
    return {
      advanceText: failAdvanceText,
      nextStageId: null,
      runSnapshot: updatedRun,
      advisories,
    };
  }

  const advance = computeAdvance(updatedRun, decoded.stageId, { ...deps, runStore });
  if (advance.recursionBlocked) {
    logger.warn?.('completion-handler advance blocked by recursion guard', {
      pipelineRunId: run.pipelineRunId,
      reason: advance.reason,
    });
    return null;
  }

  return {
    advanceText: advance.advanceText,
    nextStageId: advance.nextStageId,
    runSnapshot: advance.runSnapshot,
    advisories,
  };
}
