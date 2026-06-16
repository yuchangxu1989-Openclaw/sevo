import * as defaultRunStore from './run-store.js';
import { buildDispatchContract, classifyLabel, LABEL_CLASS } from './stage-dispatch-contract.js';
import { validateCompletion } from './evidence-contract.js';
import { append as appendAdvisory } from './advisory-ledger.js';
import { getStageMapping } from '../task-mapper.js';
import { FULL_PIPELINE_STAGES } from './stage-policy.js';
import { getStageConfig, getEntryCriteria, getExitCriteria, getRoleHint } from './stage-pipeline-config.js';
import { evaluateReviewFixLoop, incrementFixLoopRound, isReviewFixCycle } from './review-fix-loop.js';

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

function collectContextStrings(evt) {
  const values = [
    evt?.cwd,
    evt?.projectRoot,
    evt?.workspaceRoot,
    evt?.path,
    evt?.filePath,
    evt?.task,
    evt?.prompt,
    evt?.message,
    evt?.taskDescription,
    evt?.result?.cwd,
    evt?.result?.projectRoot,
    evt?.result?.path,
    evt?.result?.filePath,
    evt?.result?.task,
    evt?.result?.prompt,
    evt?.result?.message,
    evt?.result?.taskDescription,
    evt?.task?.cwd,
    evt?.task?.projectRoot,
    evt?.task?.path,
    evt?.task?.filePath,
    evt?.task?.prompt,
    evt?.task?.message,
    evt?.payload?.cwd,
    evt?.payload?.projectRoot,
    evt?.payload?.path,
    evt?.payload?.filePath,
    evt?.payload?.prompt,
    evt?.payload?.message,
    evt?.data?.cwd,
    evt?.data?.projectRoot,
    evt?.data?.path,
    evt?.data?.filePath,
    evt?.data?.prompt,
    evt?.data?.message,
  ];
  return values
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim());
}

function inferProjectSlugFromEvent(evt, runStore) {
  const context = [extractLabel(evt), ...collectContextStrings(evt)].filter(Boolean).join(' ');
  const activeRuns = runStore.listActiveRuns();
  const projectSlugs = [...new Set(activeRuns.map((run) => run.projectSlug).filter(Boolean))];
  const matches = projectSlugs.filter((slug) => {
    const escaped = String(slug).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9-])${escaped}([^a-z0-9-]|$)`, 'i').test(context);
  });
  if (matches.length === 1) {
    const matchedRun = activeRuns.find((run) => run.projectSlug === matches[0]);
    return { projectSlug: matches[0], projectRoot: matchedRun?.projectRoot || `projects/${matches[0]}` };
  }

  for (const text of collectContextStrings(evt)) {
    const normalized = text.replace(/\\/g, '/');
    const projectPathMatch = normalized.match(/(?:^|\/)projects\/([a-z0-9][a-z0-9-]*)(?:\/|$)/i);
    if (projectPathMatch) {
      const projectSlug = projectPathMatch[1].toLowerCase();
      return { projectSlug, projectRoot: `projects/${projectSlug}` };
    }
  }

  return null;
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

function findRecentActiveRun(decoded, evt, runStore, logger) {
  if (!decoded?.stageId) return null;
  const inferred = decoded.projectSlug
    ? { projectSlug: decoded.projectSlug }
    : inferProjectSlugFromEvent(evt, runStore);
  const activeRuns = inferred?.projectSlug
    ? runStore.listActiveRuns(inferred.projectSlug)
    : runStore.listActiveRuns();
  const matches = activeRuns.filter(
    (run) => run.currentStageId === decoded.stageId && run.status === 'running',
  );
  logger?.info?.('completion-handler: active run fallback lookup', {
    decodedStageId: decoded.stageId,
    decodedProjectSlug: decoded.projectSlug,
    inferredProjectSlug: inferred?.projectSlug || null,
    activeCount: activeRuns.length,
    matchCount: matches.length,
    matches: matches.map(summarizeRunForLookup),
  });
  if (matches.length === 1) return matches[0];

  const activeOnly = activeRuns.filter((run) => run.status === 'running');
  if (activeOnly.length === 1 && activeOnly[0].currentStageId === decoded.stageId) return activeOnly[0];
  return null;
}

function stageMatches(run, stageId, attempt) {
  const stage = run?.stages?.[stageId];
  if (!stage) return false;
  if (run.currentStageId !== stageId) return false;
  return Number(stage.attempt || 1) === Number(attempt || 1);
}

function buildNonCanonicalAdvisory(label, labelClass, decoded) {
  if (labelClass === LABEL_CLASS.CANONICAL) return null;
  return {
    type: 'label-advisory',
    severity: 'warn',
    stageId: decoded.stageId,
    message: `non-canonical label class: ${labelClass}`,
    label,
    recommendation: 'Use a descriptive label (e.g. "sevo:<stageId> <goal>") and set metadata.sevo.trackingLabel for pipeline tracking.',
  };
}


function getCycleTargetStageId(run, completedStageId, completedStageStatus) {
  const config = getStageConfig(completedStageId);
  if (!config?.cycleTarget) return null;
  if (config.cycleCondition && config.cycleCondition !== completedStageStatus) return null;
  if (!run?.stages?.[config.cycleTarget]) return null;
  return config.cycleTarget;
}

function getNextStageId(run, completedStageId, completedStageStatus = null) {
  const cycleTarget = getCycleTargetStageId(run, completedStageId, completedStageStatus);
  if (cycleTarget) return cycleTarget;

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
    `Use a descriptive label starting with "sevo:" + stage + space + brief goal. Example: "sevo:${nextAction.nextStageId} <goal summary>"`,
    `Set metadata.sevo = { trackingLabel: "${nextAction.dispatch.label}", projectSlug: "${nextAction.projectSlug}", pipelineRunId: "${nextAction.pipelineRunId}", stageId: "${nextAction.nextStageId}", attempt: ${nextAction.dispatch.attempt || 1} }`,
    `Timeout: ${nextAction.dispatch.timeout}s`,
    nextAction.dispatch.agentId
      ? `Recommended agentId: ${nextAction.dispatch.agentId}`
      : `Recommended tier: ${nextAction.dispatch.tier || 'stage mapping'}`,
    nextAction.entryCriteria ? `Entry criteria: ${nextAction.entryCriteria}` : null,
    nextAction.exitCriteria ? `Exit criteria: ${nextAction.exitCriteria}` : null,
    getRoleHint(nextAction.nextStageId) ? `Role hint: ${getRoleHint(nextAction.nextStageId)}` : null,
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

function buildFixLoopActionText(nextAction) {
  return [
    '[SEVO V2 nextAction — review-fix loop]',
    `Pipeline run ${nextAction.pipelineRunId}`,
    `Project: ${nextAction.projectSlug}`,
    `Review stage: ${nextAction.completedStageId} found actionable issues (round ${nextAction.fixRound})`,
    `Dispatching fix to: ${nextAction.nextStageId}`,
    `Use a descriptive label starting with "sevo:" + stage + space + brief goal. Example: "sevo:${nextAction.nextStageId} fix round ${nextAction.fixRound}"`,
    `Set metadata.sevo = { trackingLabel: "${nextAction.dispatch.label}", projectSlug: "${nextAction.projectSlug}", pipelineRunId: "${nextAction.pipelineRunId}", stageId: "${nextAction.nextStageId}", attempt: ${nextAction.dispatch.attempt || 1} }`,
    `Timeout: ${nextAction.dispatch.timeout}s`,
    `After fix completes, re-review via: ${nextAction.reReviewTarget}`,
    nextAction.fixContext ? `\nFix context:\n${nextAction.fixContext}` : null,
    nextAction.advisorySummary ? `Advisory: ${nextAction.advisorySummary}` : null,
  ].filter(Boolean).join('\n');
}

function buildFixLoopBailText(nextAction) {
  return [
    '[SEVO V2 nextAction — review-fix loop EXHAUSTED]',
    `Pipeline run ${nextAction.pipelineRunId}`,
    `Project: ${nextAction.projectSlug}`,
    `Review stage: ${nextAction.completedStageId} — fix loop exhausted after ${nextAction.round} rounds`,
    `Manual decision required. Pipeline paused (advisory-only, not blocked).`,
    nextAction.advisorySummary ? `Advisory: ${nextAction.advisorySummary}` : null,
  ].filter(Boolean).join('\n');
}

function buildReReviewActionText(nextAction) {
  return [
    '[SEVO V2 nextAction — re-review after fix]',
    `Pipeline run ${nextAction.pipelineRunId}`,
    `Project: ${nextAction.projectSlug}`,
    `Fix stage: ${nextAction.completedStageId} completed (round ${nextAction.fixRound})`,
    `Dispatching re-review to: ${nextAction.nextStageId}`,
    `Use a descriptive label starting with "sevo:" + stage + space + brief goal. Example: "sevo:${nextAction.nextStageId} re-review round ${nextAction.fixRound}"`,
    `Set metadata.sevo = { trackingLabel: "${nextAction.dispatch.label}", projectSlug: "${nextAction.projectSlug}", pipelineRunId: "${nextAction.pipelineRunId}", stageId: "${nextAction.nextStageId}", attempt: ${nextAction.dispatch.attempt || 1} }`,
    `Timeout: ${nextAction.dispatch.timeout}s`,
    nextAction.advisorySummary ? `Advisory: ${nextAction.advisorySummary}` : null,
  ].filter(Boolean).join('\n');
}

function findActiveFixLoopReviewStage(run, completedStageId) {
  const configs = FULL_PIPELINE_STAGES
    .map((sid) => ({ stageId: sid, config: getStageConfig(sid) }))
    .filter((entry) => entry.config?.isReviewPhase && entry.config.cycleTarget === completedStageId);
  for (const { stageId } of configs) {
    const stage = run.stages?.[stageId];
    if (stage && Number(stage.fixLoopRound || 0) > 0 && stage.status === 'repairing') {
      return stageId;
    }
  }
  return null;
}

function computeAdvance(run, completedStageId, deps = {}) {
  const runStore = deps.runStore || defaultRunStore;
  const completedStageStatus = run.stages?.[completedStageId]?.status || 'completed';
  const nextStageId = getNextStageId(run, completedStageId, completedStageStatus);
  const advisorySummary = buildAdvisorySummary(deps._findingsSummary, deps._completionAdvisoryCount || 0);

  const stageConfig = getStageConfig(completedStageId);
  if (stageConfig?.isReviewPhase && nextStageId && isReviewFixCycle(completedStageId, nextStageId, stageConfig)) {
    const loopResult = evaluateReviewFixLoop(
      run, completedStageId, completedStageStatus, stageConfig, deps._findingsSummary, { maxFixRounds: deps.maxFixRounds }
    );

    if (loopResult.action === 'advance') {
      const ordered = Array.isArray(run?.stagePlan?.ordered) ? run.stagePlan.ordered : [];
      const index = ordered.indexOf(completedStageId);
      const linearNext = index >= 0
        ? ordered.slice(index + 1).find((sid) => !COMPLETED_STAGE_STATUSES.has(run.stages?.[sid]?.status)) || null
        : null;
      if (linearNext) {
        if (typeof runStore.patchRun === 'function') {
          const stages = { ...(run.stages || {}) };
          const ns = stages[linearNext] || { status: 'pending', startedAt: null, completedAt: null, dispatchId: null, artifacts: [], attempt: 1 };
          stages[linearNext] = { ...ns, status: ns.status === 'pending' ? 'active' : ns.status, startedAt: ns.startedAt || new Date().toISOString() };
          runStore.patchRun(run.pipelineRunId, { currentStageId: linearNext, stages });
        }
        const dispatchParams = resolveStageDispatchParams(linearNext, deps);
        const { label } = buildDispatchContract({
          projectSlug: run.projectSlug,
          pipelineRunId: run.pipelineRunId,
          stageId: linearNext,
          attempt: run.stages?.[linearNext]?.attempt || 1,
        });
        const nextAction = {
          kind: 'dispatch-stage',
          pipelineRunId: run.pipelineRunId,
          projectSlug: run.projectSlug,
          completedStageId,
          completedStageStatus,
          nextStageId: linearNext,
          dispatch: {
            label,
            agentId: dispatchParams.agentId || null,
            tier: dispatchParams.tier || null,
            timeout: Number(dispatchParams.timeout || 1200),
          },
          entryCriteria: getEntryCriteria(linearNext) || null,
          exitCriteria: getExitCriteria(linearNext) || null,
          advisorySummary,
          createdAt: new Date().toISOString(),
        };
        const persistedRun = persistNextAction(run, nextAction, runStore);
        return {
          advanceText: buildNextActionText(nextAction),
          nextAction,
          nextStageId: linearNext,
          runSnapshot: persistedRun,
          dispatchHint: nextAction.dispatch,
        };
      }
      const completedRun = markRunCompleteIfPossible(run, runStore);
      const completeAction = {
        kind: 'complete-run',
        pipelineRunId: completedRun.pipelineRunId,
        projectSlug: completedRun.projectSlug,
        completedStageId,
        completedStageStatus,
        advisorySummary,
        createdAt: new Date().toISOString(),
      };
      const persistedComplete = persistNextAction(completedRun, completeAction, runStore);
      return {
        advanceText: buildNextActionText(completeAction),
        nextAction: completeAction,
        nextStageId: null,
        runSnapshot: persistedComplete,
      };
    }

    if (loopResult.action === 'dispatch-fix') {
      const fixAttempt = (run.stages?.[loopResult.cycleTarget]?.attempt || 1) + 1;
      if (typeof runStore.patchRun === 'function') {
        const stages = { ...(run.stages || {}) };
        stages[completedStageId] = {
          ...(stages[completedStageId] || {}),
          fixLoopRound: (Number(stages[completedStageId]?.fixLoopRound || 0)) + 1,
        };
        stages[loopResult.cycleTarget] = {
          ...(stages[loopResult.cycleTarget] || {}),
          status: 'active',
          startedAt: new Date().toISOString(),
          completedAt: null,
          attempt: fixAttempt,
        };
        runStore.patchRun(run.pipelineRunId, { currentStageId: loopResult.cycleTarget, stages });
      }
      const dispatchParams = resolveStageDispatchParams(nextStageId, deps);
      const { label } = buildDispatchContract({
        projectSlug: run.projectSlug,
        pipelineRunId: run.pipelineRunId,
        stageId: nextStageId,
        attempt: fixAttempt,
      });
      const nextAction = {
        kind: 'dispatch-fix',
        pipelineRunId: run.pipelineRunId,
        projectSlug: run.projectSlug,
        completedStageId,
        completedStageStatus,
        nextStageId,
        fixRound: loopResult.round,
        fixContext: loopResult.fixContext,
        reReviewTarget: completedStageId,
        dispatch: {
          label,
          agentId: dispatchParams.agentId || null,
          tier: dispatchParams.tier || null,
          timeout: Number(dispatchParams.timeout || 1200),
        },
        entryCriteria: getEntryCriteria(nextStageId) || null,
        exitCriteria: getExitCriteria(nextStageId) || null,
        advisorySummary,
        createdAt: new Date().toISOString(),
      };
      const persistedRun = persistNextAction(run, nextAction, runStore);
      return {
        advanceText: buildFixLoopActionText(nextAction),
        nextAction,
        nextStageId,
        runSnapshot: persistedRun,
        dispatchHint: nextAction.dispatch,
      };
    }

    if (loopResult.action === 'bail-advisory') {
      appendAdvisory(run.pipelineRunId, loopResult.advisory, { runStore });
      const nextAction = {
        kind: 'review-fix-bail',
        pipelineRunId: run.pipelineRunId,
        projectSlug: run.projectSlug,
        completedStageId,
        completedStageStatus,
        round: loopResult.round,
        reason: loopResult.reason,
        advisorySummary,
        createdAt: new Date().toISOString(),
      };
      const persistedRun = persistNextAction(run, nextAction, runStore);
      return {
        advanceText: buildFixLoopBailText(nextAction),
        nextAction,
        nextStageId: null,
        runSnapshot: persistedRun,
      };
    }
  }

  // Fix-completion detection: if this stage is a cycleTarget of a review stage
  // that's in an active fix loop, route back to re-review
  if (completedStageStatus === 'passed' && !stageConfig?.isReviewPhase) {
    const reviewStageForFixLoop = findActiveFixLoopReviewStage(run, completedStageId);
    if (reviewStageForFixLoop) {
      const reviewAttempt = (run.stages?.[reviewStageForFixLoop]?.attempt || 1) + 1;
      if (typeof runStore.patchRun === 'function') {
        const stages = { ...(run.stages || {}) };
        stages[reviewStageForFixLoop] = {
          ...(stages[reviewStageForFixLoop] || {}),
          status: 'active',
          startedAt: new Date().toISOString(),
          completedAt: null,
          attempt: reviewAttempt,
        };
        runStore.patchRun(run.pipelineRunId, { currentStageId: reviewStageForFixLoop, stages });
      }
      const dispatchParams = resolveStageDispatchParams(reviewStageForFixLoop, deps);
      const { label } = buildDispatchContract({
        projectSlug: run.projectSlug,
        pipelineRunId: run.pipelineRunId,
        stageId: reviewStageForFixLoop,
        attempt: reviewAttempt,
      });
      const round = run.stages?.[reviewStageForFixLoop]?.fixLoopRound || 1;
      const nextAction = {
        kind: 'dispatch-re-review',
        pipelineRunId: run.pipelineRunId,
        projectSlug: run.projectSlug,
        completedStageId,
        completedStageStatus,
        nextStageId: reviewStageForFixLoop,
        fixRound: round,
        dispatch: {
          label,
          agentId: dispatchParams.agentId || null,
          tier: dispatchParams.tier || null,
          timeout: Number(dispatchParams.timeout || 1200),
        },
        entryCriteria: getEntryCriteria(reviewStageForFixLoop) || null,
        exitCriteria: getExitCriteria(reviewStageForFixLoop) || null,
        advisorySummary,
        createdAt: new Date().toISOString(),
      };
      const persistedRun = persistNextAction(run, nextAction, runStore);
      return {
        advanceText: buildReReviewActionText(nextAction),
        nextAction,
        nextStageId: reviewStageForFixLoop,
        runSnapshot: persistedRun,
        dispatchHint: nextAction.dispatch,
      };
    }
  }

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

  if (typeof runStore.patchRun === 'function') {
    const stages = { ...(run.stages || {}) };
    const nextStage = stages[nextStageId] || { status: 'pending', startedAt: null, completedAt: null, dispatchId: null, artifacts: [], attempt: 1 };
    stages[nextStageId] = {
      ...nextStage,
      status: nextStage.status === 'pending' ? 'active' : nextStage.status,
      startedAt: nextStage.startedAt || new Date().toISOString(),
    };
    runStore.patchRun(run.pipelineRunId, { currentStageId: nextStageId, stages });
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
    const labelAdvisory = buildNonCanonicalAdvisory(label, deps?.labelClass || null, decoded);
    logger.info?.('completion-handler auto-create: cannot infer projectSlug', { label, decoded });
    return {
      advanceText: buildGuidanceAdvanceText(decoded.stageId, label),
      nextStageId: null,
      runSnapshot: null,
      advisories: labelAdvisory ? [labelAdvisory] : [],
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
    suppressAutoAdvance: true,
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

  let run = labelClass === LABEL_CLASS.CANONICAL
    ? findRunFromDecodedLabel(decoded, runStore, logger)
    : findRunFromLegacyLabel(decoded, runStore);

  if (!run && labelClass !== LABEL_CLASS.CANONICAL) {
    run = findRecentActiveRun(decoded, evt, runStore, logger);
  }

  if (!run) {
    return tryAutoCreateRun(label, decoded, evt, { ...deps, labelClass });
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
  const labelAdvisory = buildNonCanonicalAdvisory(label, labelClass, decoded);
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
    ...(labelAdvisory ? [labelAdvisory] : []),
    ...evidenceAdvisories,
    ...(completionAdvisory ? [completionAdvisory] : []),
  ];

  const updatedRun = runStore.advanceStage(run.pipelineRunId, decoded.stageId, {
    status,
    artifacts: extractArtifacts(evt),
    dispatchId: extractDispatchId(evt),
    suppressAutoAdvance: true,
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
