import * as defaultRunStore from './run-store.js';
import { buildDispatchContract, classifyLabel, LABEL_CLASS } from './stage-dispatch-contract.js';
import { validateCompletion } from './evidence-contract.js';
import { append as appendAdvisory } from './advisory-ledger.js';
import { getStageMapping } from '../task-mapper.js';
import { FULL_PIPELINE_STAGES } from './stage-policy.js';
import { getStageConfig, getEntryCriteria, getExitCriteria } from './stage-pipeline-config.js';

const DEFAULT_MAX_ADVANCES_PER_RUN_ROUND = 3;
const COMPLETED_STAGE_STATUSES = new Set(['passed', 'completed', 'repairing', 'cancelled', 'skipped']);

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

function extractSevoMetadata(evt) {
  const candidates = [
    evt?.metadata?.sevo,
    evt?.result?.metadata?.sevo,
    evt?.task?.metadata?.sevo,
    evt?.payload?.metadata?.sevo,
    evt?.data?.metadata?.sevo,
  ];
  return candidates.find((value) => value && typeof value === 'object') || null;
}

function decodedFromSevoMetadata(metadata) {
  if (!metadata?.projectSlug || !metadata?.pipelineRunId || !metadata?.stageId) return null;
  const attempt = Number(metadata.attempt || 1) || 1;
  const pipelineRunId = String(metadata.pipelineRunId);
  return {
    projectSlug: String(metadata.projectSlug),
    pipelineRunId,
    pipelineRunIdShort: String(metadata.pipelineRunIdShort || pipelineRunId.slice(0, 8)),
    stageId: String(metadata.stageId),
    attempt,
  };
}

function resolveCompletionIdentity(evt) {
  const label = extractLabel(evt);
  const sevoMetadata = extractSevoMetadata(evt);
  const metadataDecoded = decodedFromSevoMetadata(sevoMetadata);
  if (metadataDecoded) {
    return {
      label,
      labelClass: LABEL_CLASS.CANONICAL,
      decoded: metadataDecoded,
      source: 'metadata',
    };
  }

  const { class: labelClass, decoded } = classifyLabel(label);
  return { label, labelClass, decoded, source: 'label' };
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
  if (['cancelled', 'canceled', 'skipped'].includes(normalized)) return 'cancelled';
  if ([
    'advisory',
    'repair-required',
    'repairing',
    'failed',
    'fail',
    'failure',
    'error',
    'errored',
    'timeout',
    'timed_out',
    'blocked',
    'gate-failed',
  ].includes(normalized)) {
    return 'repairing';
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

function rawCompletionStatus(evt) {
  return evt?.status || evt?.result?.status || evt?.state || null;
}

function completionReason(evt) {
  return evt?.result?.reason || evt?.reason || evt?.error || evt?.message || null;
}

function isAdvisoryCheckStage(stageId) {
  return String(stageId || '').includes('gate') || String(stageId || '').includes('review');
}

function appendCompletionAdvisory(run, stageId, status, evt, findingsInfo, runStore) {
  if (status !== 'repairing') return null;

  const reason = completionReason(evt);
  const rawStatus = rawCompletionStatus(evt);
  const advisory = {
    stageId,
    type: isAdvisoryCheckStage(stageId) ? 'gate-advisory' : 'repair-required',
    severity: 'must-review',
    message: [
      `Stage "${stageId}" completed with repair-required advisory`,
      rawStatus ? `(source status: ${rawStatus})` : null,
      reason ? `reason: ${reason}` : null,
      findingsInfo?.count > 0 ? `findings: ${findingsInfo.count}${findingsInfo.summary ? ` (${findingsInfo.summary})` : ''}` : null,
    ].filter(Boolean).join(' '),
    evidence: [
      ...extractArtifacts(evt),
      ...(reason ? [`reason:${reason}`] : []),
    ],
  };

  const result = appendAdvisory(run.pipelineRunId, advisory, { runStore });
  return { ...advisory, id: result.id };
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

function summarizeRunForLookup(run) {
  return {
    pipelineRunId: run?.pipelineRunId || null,
    projectSlug: run?.projectSlug || null,
    currentStageId: run?.currentStageId || null,
    status: run?.status || null,
  };
}

function findRunFromDecodedLabel(decoded, runStore, logger) {
  if (!decoded?.pipelineRunId) return null;

  const direct = runStore.getRun(decoded.pipelineRunId);
  if (direct) {
    logger?.debug?.('findRunFromDecodedLabel: direct match', {
      decodedProjectSlug: decoded.projectSlug,
      decodedPipelineRunId: decoded.pipelineRunId,
      pipelineRunId: direct.pipelineRunId,
    });
    return direct;
  }

  const activeRuns = runStore.listActiveRuns(decoded.projectSlug);
  const matches = activeRuns.filter((run) => run.pipelineRunId?.startsWith(decoded.pipelineRunIdShort));
  logger?.info?.('findRunFromDecodedLabel: canonical lookup', {
    decodedProjectSlug: decoded.projectSlug,
    decodedPipelineRunId: decoded.pipelineRunId,
    pipelineRunIdShort: decoded.pipelineRunIdShort,
    scopedActiveCount: activeRuns.length,
    scopedMatchCount: matches.length,
    scopedRuns: activeRuns.map(summarizeRunForLookup),
    scopedMatchRunIds: matches.map((run) => run.pipelineRunId),
  });
  if (matches.length === 1) return matches[0];

  if (matches.length === 0 && decoded.projectSlug) {
    const allRuns = runStore.listActiveRuns();
    const broadMatches = allRuns.filter((run) => run.pipelineRunId?.startsWith(decoded.pipelineRunIdShort));
    if (broadMatches.length === 1) {
      logger?.info?.('findRunFromDecodedLabel: scoped miss, unscoped hit', {
        decodedProjectSlug: decoded.projectSlug,
        actualProjectSlug: broadMatches[0].projectSlug,
        pipelineRunId: broadMatches[0].pipelineRunId,
        unscopedActiveCount: allRuns.length,
        unscopedRuns: allRuns.map(summarizeRunForLookup),
      });
      return broadMatches[0];
    }
    logger?.warn?.('findRunFromDecodedLabel: no match', {
      decodedProjectSlug: decoded.projectSlug,
      pipelineRunIdShort: decoded.pipelineRunIdShort,
      scopedCount: activeRuns.length,
      unscopedCount: allRuns.length,
      broadMatchCount: broadMatches.length,
      unscopedRuns: allRuns.map(summarizeRunForLookup),
      broadMatchRunIds: broadMatches.map((run) => run.pipelineRunId),
    });
  }

  return null;
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
      .find((stageId) => !COMPLETED_STAGE_STATUSES.has(run.stages?.[stageId]?.status)) ||
    null
  );
}

function markRunCompleteIfPossible(run, runStore) {
  if (typeof runStore.closeRun !== 'function') return run;
  runStore.closeRun(run.pipelineRunId, { status: 'completed', reason: 'all V2 stages completed or recorded as advisory' });
  return runStore.getRun(run.pipelineRunId) || { ...run, status: 'completed' };
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

function buildNextActionText(nextAction) {
  if (nextAction.kind === 'complete-run') {
    return [
      '[SEVO V2 nextAction]',
      `Pipeline run ${nextAction.pipelineRunId} completed.`,
      `Project: ${nextAction.projectSlug}`,
      `Completed stage: ${nextAction.completedStageId} (${nextAction.completedStageStatus})`,
      'No next stage dispatch is required.',
    ].join('\n');
  }

  return [
    '[SEVO V2 nextAction]',
    `Pipeline run ${nextAction.pipelineRunId}`,
    `Project: ${nextAction.projectSlug}`,
    `Completed stage: ${nextAction.completedStageId} (${nextAction.completedStageStatus})`,
    `Next stage: ${nextAction.nextStageId}`,
    `Label: ${nextAction.dispatch.label}`,
    `Timeout: ${nextAction.dispatch.timeout}s`,
    nextAction.dispatch.agentId
      ? `Recommended agentId: ${nextAction.dispatch.agentId}`
      : `Recommended tier: ${nextAction.dispatch.tier || 'stage mapping'}`,
    nextAction.advisorySummary ? `Advisory: ${nextAction.advisorySummary}` : null,
  ].filter(Boolean).join('\n');
}

function persistNextAction(run, nextAction, runStore) {
  if (!nextAction) return run;
  if (typeof runStore.patchRun === 'function') {
    return runStore.patchRun(run.pipelineRunId, { nextAction });
  }
  return { ...run, nextAction };
}

function buildAdvisorySummary(findingsInfo, advisoryCount) {
  const parts = [];
  if (findingsInfo?.count > 0) parts.push(`findings=${findingsInfo.count}${findingsInfo.summary ? ` (${findingsInfo.summary})` : ''}`);
  if (advisoryCount > 0) parts.push(`openAdvisories+=${advisoryCount}`);
  return parts.join('; ') || null;
}

function computeAdvance(run, completedStageId, deps = {}) {
  const runStore = deps.runStore || defaultRunStore;
  const nextStageId = getNextStageId(run, completedStageId);
  const completedStageStatus = run.stages?.[completedStageId]?.status || 'completed';
  const advisorySummary = buildAdvisorySummary(deps._findingsSummary, deps._completionAdvisoryCount || 0);

  if (!nextStageId) {
    const completedRun = markRunCompleteIfPossible(run, runStore);
    const nextAction = {
      kind: 'complete-run',
      pipelineRunId: completedRun.pipelineRunId,
      projectSlug: completedRun.projectSlug,
      completedStageId,
      completedStageStatus,
      advisorySummary,
      createdAt: new Date().toISOString(),
    };
    const persistedRun = persistNextAction(completedRun, nextAction, runStore);
    return {
      advanceText: buildNextActionText(nextAction),
      nextAction,
      nextStageId: null,
      runSnapshot: persistedRun,
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
  const timeout = Number(dispatchParams.timeout || 1200);
  const nextAction = {
    kind: 'dispatch-stage',
    pipelineRunId: run.pipelineRunId,
    projectSlug: run.projectSlug,
    completedStageId,
    completedStageStatus,
    nextStageId,
    dispatch: {
      label,
      agentId: dispatchParams.agentId || null,
      tier: dispatchParams.tier || null,
      timeout,
    },
    entryCriteria: getEntryCriteria(nextStageId) || null,
    exitCriteria: getExitCriteria(nextStageId) || null,
    advisorySummary,
    createdAt: new Date().toISOString(),
  };
  const persistedRun = persistNextAction(run, nextAction, runStore);

  return {
    advanceText: buildNextActionText(nextAction),
    nextAction,
    nextStageId,
    runSnapshot: persistedRun,
    dispatchHint: nextAction.dispatch,
  };
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
  const status = normalizeStatus(rawCompletionStatus(evt));
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

  const findingsInfo = extractFindings(evt);
  const completionAdvisory = appendCompletionAdvisory(run, decoded.stageId, status, evt, findingsInfo, runStore);

  const updatedRun = runStore.advanceStage(run.pipelineRunId, decoded.stageId, {
    status,
    artifacts: extractArtifacts(evt),
    dispatchId: extractDispatchId(evt),
  });

  const completionAdvisories = completionAdvisory ? [completionAdvisory] : [];
  const advance = computeAdvance(updatedRun, decoded.stageId, {
    ...deps,
    runStore,
    _findingsSummary: findingsInfo,
    _completionAdvisoryCount: completionAdvisories.length,
  });
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
    nextAction: advance.nextAction,
    runSnapshot: advance.runSnapshot,
    advisories: completionAdvisories,
  };
}

/**
 * Handle a V2 SEVO subagent completion event.
 *
 * The handler decodes the SEVO label, resolves the PipelineRun, validates that
 * the completed stage is the active stage, persists the stage fact through
 * run-store, records repair-required completions as advisories, and writes a
 * compact nextAction JSON object onto the run snapshot.
 *
 * @param {object} evt subagent_ended event payload.
 * @param {{ logger?: object, runStore?: object, advanceDepthByRun?: Map<string, number>, maxAdvancesPerRunRound?: number, getStageMapping?: Function }} [deps]
 * @returns {{ advanceText: string | null, nextStageId: string | null, nextAction?: object, runSnapshot: object, advisories?: object[] } | null}
 */
export function handleCompletion(evt, deps = {}) {
  const logger = getLogger(deps);
  const runStore = deps.runStore || defaultRunStore;
  const { label, labelClass, decoded, source: identitySource } = resolveCompletionIdentity(evt);

  logger.debug?.('completion-handler entry', {
    label,
    labelClass,
    identitySource,
    decodedProjectSlug: decoded?.projectSlug,
    decodedPipelineRunId: decoded?.pipelineRunId,
    decodedPipelineRunIdShort: decoded?.pipelineRunIdShort,
    decodedStageId: decoded?.stageId,
    decodedAttempt: decoded?.attempt,
  });

  if (labelClass === LABEL_CLASS.INVALID || !decoded?.stageId) {
    logger.debug?.('completion-handler skipped: invalid or missing label', { label });
    return null;
  }

  if (labelClass !== LABEL_CLASS.CANONICAL && labelClass !== LABEL_CLASS.LEGACY) {
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

  let run = labelClass === LABEL_CLASS.CANONICAL
    ? findRunFromDecodedLabel(decoded, runStore, logger)
    : findRunFromLegacyLabel(decoded, runStore);

  if (!run && labelClass === LABEL_CLASS.LEGACY) {
    logger.info?.('completion-handler: legacy label, attempting auto-create', { label, decoded });
    return tryAutoCreateRun(label, decoded, evt, deps);
  }

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

  const status = normalizeStatus(rawCompletionStatus(evt));
  if (!status) {
    logger.warn?.('completion-handler skipped: unknown completion status', { label, status: evt?.status });
    return null;
  }

  const findingsInfo = extractFindings(evt);
  const evidenceValidation = validateCompletion(decoded.stageId, evt);
  const evidenceAdvisories = evidenceValidation.advisories;
  if (evidenceAdvisories.length > 0) {
    logger.warn?.('completion-handler evidence advisory', {
      pipelineRunId: run.pipelineRunId,
      stageId: decoded.stageId,
      missing: evidenceValidation.missing,
    });
    for (const adv of evidenceAdvisories) {
      appendAdvisory(run.pipelineRunId, {
        stageId: adv.stageId,
        type: adv.type,
        severity: 'warn',
        message: adv.message,
        evidence: adv.missing || [],
      }, { runStore });
    }
  }

  const completionAdvisory = appendCompletionAdvisory(run, decoded.stageId, status, evt, findingsInfo, runStore);
  const advisories = [
    ...evidenceAdvisories,
    ...(completionAdvisory ? [completionAdvisory] : []),
  ];

  const updatedRun = runStore.advanceStage(run.pipelineRunId, decoded.stageId, {
    status,
    artifacts: extractArtifacts(evt),
    dispatchId: extractDispatchId(evt),
  });

  const advance = computeAdvance(updatedRun, decoded.stageId, {
    ...deps,
    runStore,
    _findingsSummary: findingsInfo,
    _completionAdvisoryCount: advisories.length,
  });
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
    nextAction: advance.nextAction,
    runSnapshot: advance.runSnapshot,
    advisories,
  };
}
