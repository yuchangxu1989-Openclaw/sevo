import * as defaultRunStore from './run-store.js';
import { buildDispatchContract, classifyLabel, LABEL_CLASS } from './stage-dispatch-contract.js';
import { validateCompletion } from './evidence-contract.js';
import { append as appendAdvisory } from './advisory-ledger.js';
import { renderAdvancePromptTemplate } from '../advance-prompt-templates.js';
import { getStageMapping } from '../task-mapper.js';
import { FULL_PIPELINE_STAGES } from './stage-policy.js';
import { getCycleTarget, getRoleHint, getStageConfig, getEntryCriteria, getExitCriteria } from './stage-pipeline-config.js';

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

function extractGoalFromLabel(label, stageId) {
  if (!label || !stageId) return null;
  const prefix = `sevo:${stageId}`;
  const idx = label.indexOf(prefix);
  if (idx < 0) return null;
  const remainder = label.slice(idx + prefix.length).trim();
  return remainder || null;
}

function buildAutoCreateStagePlan(completedStageId) {
  const idx = FULL_PIPELINE_STAGES.indexOf(completedStageId);
  if (idx < 0) return { ordered: [completedStageId, 'review'], skipped: [] };
  const ordered = FULL_PIPELINE_STAGES.slice(idx);
  return { ordered: [...ordered], skipped: [] };
}

function buildGuidanceAdvanceText(stageId, label) {
  return [
    '[SEVO V2 advance — auto-create failed, manual action required]',
    `Completion received for stage "${stageId}" but no active pipeline run was found`,
    'and projectSlug could not be inferred from the label.',
    `Original label: ${label}`,
    '',
    'Recommended action: manually create a pipeline run with:',
    '  sevo:create <projectSlug> <goal>',
    'Then advance to the next stage (typically "review").',
  ].join('\n');
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

function extractFindings(evt) {
  const candidates = [
    evt?.findings,
    evt?.result?.findings,
    evt?.output?.findings,
    evt?.payload?.findings,
  ];
  const findings = candidates.find((v) => Array.isArray(v));
  if (!findings || findings.length === 0) return { count: 0, summary: null };
  const bySeverity = {};
  for (const f of findings) {
    const sev = String(f?.severity || f?.level || 'unknown').toLowerCase();
    bySeverity[sev] = (bySeverity[sev] || 0) + 1;
  }
  const parts = Object.entries(bySeverity).map(([k, v]) => `${k}:${v}`);
  return { count: findings.length, summary: parts.join(', '), bySeverity };
}

function resolveStageDispatchParams(stageId, deps) {
  if (deps?.getStageMapping) {
    const override = deps.getStageMapping(stageId);
    if (override) return override;
  }
  const config = getStageConfig(stageId);
  if (config) {
    return { tier: config.tier, agentId: null, timeout: config.timeout };
  }
  const mapping = getStageMapping(stageId);
  return mapping || { tier: null, agentId: null, timeout: 1200 };
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

  const dispatchParams = resolveStageDispatchParams(nextStageId, deps);
  const { label } = buildDispatchContract({
    projectSlug: run.projectSlug,
    pipelineRunId: run.pipelineRunId,
    stageId: nextStageId,
    attempt: run.stages?.[nextStageId]?.attempt || 1,
  });
  const stagePromptTemplateRef =
    typeof deps.getStagePromptTemplateRef === 'function'
      ? deps.getStagePromptTemplateRef(nextStageId, run)
      : getStagePromptTemplateRef(nextStageId);
  const timeout = Number(dispatchParams.timeout || 1200);
  const agentLine = dispatchParams.agentId
    ? `Recommended agentId: ${dispatchParams.agentId}`
    : `Recommended agentId: auto (${dispatchParams.tier || 'stage mapping'} tier)`;
  const taskDescription = buildStageTaskDescription(run, completedStageId, nextStageId, stagePromptTemplateRef);
  const roleHint = getRoleHint(completedStageId);
  const entryCriteria = getEntryCriteria(nextStageId);
  const exitCriteria = getExitCriteria(nextStageId);
  const completionStatus = run.stages?.[completedStageId]?.status || 'passed';
  const findingsInfo = deps._findingsSummary;

  const criteriaBlock = [
    `\n阶段: ${nextStageId} | 完成状态: ${completionStatus}`,
    entryCriteria ? `准入条件: ${entryCriteria}` : null,
    exitCriteria ? `准出条件: ${exitCriteria}` : null,
    findingsInfo?.count > 0 ? `Findings: ${findingsInfo.count} (${findingsInfo.summary})` : null,
  ].filter(Boolean).join('\n');

  const renderer = deps.renderAdvancePromptTemplate || renderAdvancePromptTemplate;
  const advanceText = renderer(ADVANCE_TEMPLATE_NAME, {
    agentLine,
    timeout,
    label,
    taskDescription: `${criteriaBlock}\n\n${taskDescription}`,
    roleNavHint: roleHint ? `\n角色提示: ${roleHint}` : '',
    roleRelevantAgents: '',
    commercializationGateBlock: '',
  });

  return {
    advanceText,
    nextStageId,
    runSnapshot: run,
    dispatchHint: {
      agentId: dispatchParams.agentId || null,
      tier: dispatchParams.tier || null,
      timeout,
      label,
      stagePromptTemplateRef,
    },
  };
}

function buildFailureAdvanceText(run, stageId, status, evt) {
  const attempt = run.stages?.[stageId]?.attempt || 1;
  const reason = evt?.result?.reason || evt?.reason || evt?.error || 'unknown failure';
  const findingsInfo = extractFindings(evt);
  const config = getStageConfig(stageId);
  const exitCriteria = config?.exitCriteria || '';
  const entryCriteria = getEntryCriteria(stageId);
  const roleHint = getRoleHint(stageId);

  const suggestedAction = status === 'blocked'
    ? 'retry（环境阻断，建议排除阻断因素后重试）'
    : attempt >= MAX_REVIEW_FIX_ATTEMPTS
      ? 'escalate（重试次数已耗尽，需人工介入）'
      : 'retry（重试本阶段）';

  const lines = [
    '[SEVO V2 advance — stage failure recovery]',
    `Pipeline run ${run.pipelineRunId} stage "${stageId}" ${status} (attempt ${attempt}).`,
    `Project: ${run.projectSlug}`,
    `Failure reason: ${reason}`,
    entryCriteria ? `准入条件: ${entryCriteria}` : null,
    exitCriteria ? `准出条件（未达成）: ${exitCriteria}` : null,
    findingsInfo.count > 0 ? `Findings: ${findingsInfo.count} (${findingsInfo.summary})` : null,
    roleHint ? `角色提示: ${roleHint}` : null,
    '',
    `建议动作: ${suggestedAction}`,
    `建议 retry target: ${stageId} (attempt ${attempt + 1})`,
  ].filter(Boolean);

  return lines.join('\n');
}

function buildCycleAdvanceText(run, fromStageId, toStageId, reason) {
  const attempt = run.stages?.[toStageId]?.attempt || 1;
  const roleHint = getRoleHint(fromStageId);
  const lines = [
    `[SEVO V2 advance — ${fromStageId}→${toStageId} cycle]`,
    `Pipeline run ${run.pipelineRunId}: "${fromStageId}" triggered cycle to "${toStageId}".`,
    `Project: ${run.projectSlug}`,
    `Reason: ${reason}`,
    `Attempt: ${attempt}/${MAX_REVIEW_FIX_ATTEMPTS}`,
    '',
    `## Dispatch: ${toStageId} Task`,
    `派发 agent 执行 "${toStageId}" 阶段：`,
    `- 触发来源：${fromStageId} 阶段完成（reason: ${reason}）`,
    `- 产出：${toStageId} 阶段工件`,
    `- 完成后以 label 报告结果`,
    roleHint ? `- 角色提示：${roleHint}` : null,
  ].filter(Boolean);

  return lines.join('\n');
}

function handleReviewFixCycle(run, completedStageId, status, evt, deps) {
  const runStore = deps.runStore || defaultRunStore;
  const cycleTarget = getCycleTarget(completedStageId, status);
  if (!cycleTarget) return null;
  if (!run.stagePlan.ordered.includes(cycleTarget)) return null;

  const currentAttempt = run.stages?.[cycleTarget]?.attempt || 0;
  if (currentAttempt >= MAX_REVIEW_FIX_ATTEMPTS) {
    return {
      advanceText: [
        `[SEVO V2 advance — ${completedStageId}→${cycleTarget} cycle EXHAUSTED]`,
        `Pipeline run ${run.pipelineRunId}: ${completedStageId}→${cycleTarget} cycle reached max attempts (${MAX_REVIEW_FIX_ATTEMPTS}).`,
        `Project: ${run.projectSlug}`,
        'Action: pipeline blocked. Manual intervention required.',
        'Use `sevo:diagnose` or `sevo:cancel` to proceed.',
      ].join('\n'),
      nextStageId: null,
      runSnapshot: run,
    };
  }

  const updatedRun = runStore.resetStageForRetry(run.pipelineRunId, cycleTarget);
  const reason = evt?.result?.reason || evt?.reason || `${completedStageId} triggered cycle`;
  return computeCycleAdvance(updatedRun, completedStageId, cycleTarget, reason, deps);
}

function computeCycleAdvance(run, fromStageId, toStageId, reason, deps) {
  const depth = trackAdvanceDepth(run.pipelineRunId, deps);
  if (!depth.allowed) {
    return { advanceText: null, nextStageId: toStageId, runSnapshot: run, recursionBlocked: true, reason: `advance-depth-limit:${depth.maxDepth}` };
  }

  const dispatchParams = resolveStageDispatchParams(toStageId, deps);
  const { label } = buildDispatchContract({
    projectSlug: run.projectSlug,
    pipelineRunId: run.pipelineRunId,
    stageId: toStageId,
    attempt: run.stages?.[toStageId]?.attempt || 1,
  });
  const stagePromptTemplateRef =
    typeof deps.getStagePromptTemplateRef === 'function'
      ? deps.getStagePromptTemplateRef(toStageId, run)
      : getStagePromptTemplateRef(toStageId);
  const timeout = Number(dispatchParams.timeout || 1200);
  const agentLine = dispatchParams.agentId
    ? `Recommended agentId: ${dispatchParams.agentId}`
    : `Recommended agentId: auto (${dispatchParams.tier || 'stage mapping'} tier)`;
  const taskDescription = buildStageTaskDescription(run, fromStageId, toStageId, stagePromptTemplateRef);
  const cycleContext = buildCycleAdvanceText(run, fromStageId, toStageId, reason);
  const roleHint = getRoleHint(fromStageId);
  const entryCriteria = getEntryCriteria(toStageId);
  const exitCriteria = getExitCriteria(toStageId);
  const findingsInfo = deps._findingsSummary;
  const completionStatus = run.stages?.[fromStageId]?.status || 'failed';

  const criteriaBlock = [
    `\n阶段: ${toStageId} | 循环来源: ${fromStageId} | 完成状态: ${completionStatus}`,
    entryCriteria ? `准入条件: ${entryCriteria}` : null,
    exitCriteria ? `准出条件: ${exitCriteria}` : null,
    findingsInfo?.count > 0 ? `Findings: ${findingsInfo.count} (${findingsInfo.summary})` : null,
    `阻断原因: ${reason}`,
  ].filter(Boolean).join('\n');

  const renderer = deps.renderAdvancePromptTemplate || renderAdvancePromptTemplate;
  const advanceText = renderer(ADVANCE_TEMPLATE_NAME, {
    agentLine,
    timeout,
    label,
    taskDescription: `${criteriaBlock}\n\n${cycleContext}\n\n${taskDescription}`,
    roleNavHint: roleHint ? `\n角色提示: ${roleHint}` : '',
    roleRelevantAgents: '',
    commercializationGateBlock: '',
  });

  return { advanceText, nextStageId: toStageId, runSnapshot: run };
}

function tryAutoCreateRun(label, decoded, evt, deps) {
  const logger = getLogger(deps);
  const runStore = deps.runStore || defaultRunStore;
  const goal = extractGoalFromLabel(label, decoded.stageId) || `auto-created from completion: ${decoded.stageId}`;
  const inferFn = deps.inferProjectSlug;
  const inferred = typeof inferFn === 'function' ? inferFn(goal) : null;
  const projectSlug = inferred?.projectSlug || decoded.projectSlug;

  if (!projectSlug) {
    logger.info?.('completion-handler auto-create: cannot infer projectSlug', { label, decoded });
    return {
      advanceText: buildGuidanceAdvanceText(decoded.stageId, label),
      nextStageId: null,
      runSnapshot: null,
      advisories: [],
    };
  }

  const projectRoot = inferred?.projectRoot || `projects/${projectSlug}`;
  const stagePlan = buildAutoCreateStagePlan(decoded.stageId);
  const status = normalizeStatus(evt?.status || evt?.result?.status || evt?.state);
  if (!status) return null;

  let run;
  try {
    run = runStore.createRun({
      projectSlug,
      projectRoot,
      goal,
      entryType: 'auto-completion',
      stagePlan,
    });
  } catch (err) {
    logger.warn?.('completion-handler auto-create failed', { label, error: err.message });
    return null;
  }

  logger.info?.('completion-handler auto-created run', {
    pipelineRunId: run.pipelineRunId,
    projectSlug,
    stageId: decoded.stageId,
  });

  const updatedRun = runStore.advanceStage(run.pipelineRunId, decoded.stageId, {
    status,
    artifacts: extractArtifacts(evt),
    dispatchId: extractDispatchId(evt),
  });

  if (status !== 'passed') {
    return {
      advanceText: buildFailureAdvanceText(updatedRun, decoded.stageId, status, evt),
      nextStageId: decoded.stageId,
      runSnapshot: updatedRun,
      advisories: [],
    };
  }

  const advance = computeAdvance(updatedRun, decoded.stageId, { ...deps, runStore });
  if (advance.recursionBlocked) {
    logger.warn?.('completion-handler auto-create advance blocked by recursion guard', {
      pipelineRunId: run.pipelineRunId,
      reason: advance.reason,
    });
    return null;
  }

  return {
    advanceText: advance.advanceText,
    nextStageId: advance.nextStageId,
    runSnapshot: advance.runSnapshot,
    advisories: [],
  };
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
  const { class: labelClass, decoded } = classifyLabel(label);

  if (labelClass === LABEL_CLASS.INVALID || !decoded?.stageId) {
    logger.debug?.('completion-handler skipped: invalid or missing label', { label });
    return null;
  }

  if (labelClass !== LABEL_CLASS.CANONICAL) {
    logger.info?.('completion-handler quarantined non-canonical label', { label, class: labelClass });
    return {
      advanceText: [
        '[SEVO V2 advisory — non-canonical label quarantined]',
        `Label "${label}" classified as "${labelClass}" — only canonical V2 labels can advance a pipeline.`,
        `Decoded fields: ${JSON.stringify(decoded)}`,
        '',
        'No pipeline run was advanced. To proceed, dispatch with a canonical label:',
        '  sevo:<projectSlug>:<pipelineRunId-short>:<stageId>:<attempt>',
      ].join('\n'),
      nextStageId: null,
      runSnapshot: null,
      advisories: [{ type: 'quarantine', severity: 'warn', stageId: decoded.stageId, message: `non-canonical label class: ${labelClass}` }],
    };
  }

  let run = findRunFromDecodedLabel(decoded, runStore);
  if (!run) {
    logger.info?.('completion-handler: canonical label but no matching run', { label, decoded });
    return {
      advanceText: [
        '[SEVO V2 advisory — pipeline run not found]',
        `Label "${label}" is canonical but no active run matches pipelineRunId ${decoded.pipelineRunIdShort}.`,
        '',
        'Recommended action: verify the pipeline run exists or create one with:',
        '  sevo:create <projectSlug> <goal>',
      ].join('\n'),
      nextStageId: null,
      runSnapshot: null,
      advisories: [{ type: 'no-run', severity: 'warn', stageId: decoded.stageId, message: `no run matches ${decoded.pipelineRunIdShort}` }],
    };
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

  const findingsInfo = extractFindings(evt);

  // Review-fix cycle: review fails → fix, fix passes → review
  const cycleResult = handleReviewFixCycle(updatedRun, decoded.stageId, status, evt, { ...deps, runStore, _findingsSummary: findingsInfo });
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
      nextStageId: decoded.stageId,
      runSnapshot: updatedRun,
      advisories,
    };
  }

  const advance = computeAdvance(updatedRun, decoded.stageId, { ...deps, runStore, _findingsSummary: findingsInfo });
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
