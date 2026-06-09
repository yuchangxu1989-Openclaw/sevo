import * as defaultRunStore from './run-store.js';
import { decode, encode } from './label-protocol.js';
import { renderAdvancePromptTemplate } from '../advance-prompt-templates.js';
import { getStageMapping } from '../task-mapper.js';

const DEFAULT_MAX_ADVANCES_PER_RUN_ROUND = 3;
const ADVANCE_TEMPLATE_NAME = 'autoAdvanceAction';

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
 * @returns {{ advanceText: string | null, nextStageId: string | null, runSnapshot: object } | null}
 */
export function handleCompletion(evt, deps = {}) {
  const logger = getLogger(deps);
  const runStore = deps.runStore || defaultRunStore;
  const label = extractLabel(evt);
  const decoded = decode(label);
  if (!decoded?.pipelineRunId || !decoded?.stageId) {
    logger.debug?.('completion-handler skipped: non-V2 or invalid label', { label });
    return null;
  }

  const run = findRunFromDecodedLabel(decoded, runStore);
  if (!run) {
    logger.warn?.('completion-handler skipped: run not found or ambiguous', { label, decoded });
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

  const updatedRun = runStore.advanceStage(run.pipelineRunId, decoded.stageId, {
    status,
    artifacts: extractArtifacts(evt),
    dispatchId: extractDispatchId(evt),
  });

  if (status !== 'passed') {
    const failAdvanceText = buildFailureAdvanceText(updatedRun, decoded.stageId, status, evt);
    return {
      advanceText: failAdvanceText,
      nextStageId: null,
      runSnapshot: updatedRun,
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
  };
}
