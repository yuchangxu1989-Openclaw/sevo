/**
 * Pipeline Commands — unified command dispatcher for SEVO V2.
 *
 * Handles: create, cancel, skip, status, diagnose, retry.
 * Pure function style: all external deps injected via `deps` parameter.
 */

import { createHash } from 'node:crypto';
import { classifyCommandRoute } from './route-classifier.js';
import { FULL_PIPELINE_STAGES, isProtectedStage, canEnterFrom } from './stage-policy.js';
import { append as appendAdvisory } from './advisory-ledger.js';

const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

const DEFAULT_FULL_PIPELINE_STAGES = FULL_PIPELINE_STAGES;

function markPriorStagesForEntry(run, requestedStageId, priorStages, deps) {
  const protectedPriorStages = priorStages.filter(isProtectedStage);
  const reviewStageId = protectedPriorStages[0] || null;

  for (const stageId of priorStages) {
    if (isProtectedStage(stageId)) {
      deps.runStore.advanceStage(run.pipelineRunId, stageId, {
        status: stageId === reviewStageId ? 'active' : 'pending',
        needsPassNoChangeReview: true,
        suppressAutoAdvance: true,
      });
      continue;
    }

    deps.runStore.advanceStage(run.pipelineRunId, stageId, {
      status: 'passed',
      suppressAutoAdvance: true,
    });
  }

  if (reviewStageId) {
    return reviewStageId;
  }

  deps.runStore.advanceStage(run.pipelineRunId, requestedStageId, { status: 'active' });
  return requestedStageId;
}

export { DEFAULT_FULL_PIPELINE_STAGES };
function protectedSkippedStage(stagePlan) {
  const skipped = Array.isArray(stagePlan?.skipped) ? stagePlan.skipped : [];
  return skipped.find(isProtectedStage) || null;
}

/**
 * Compute scope fingerprint from goal text for dedup.
 *
 * @param {string} goal
 * @returns {string}
 */
function scopeFingerprint(goal) {
  return `sha256:${createHash('sha256').update(goal || '').digest('hex')}`;
}

function validateStagePlanSkips(stagePlan) {
  const protectedStage = protectedSkippedStage(stagePlan);
  return protectedStage
    ? `Error: stage "${protectedStage}" is mandatory and cannot be pre-skipped.`
    : null;
}
/**
 * Format a run into a one-line status summary.
 *
 * @param {object} run
 * @returns {string}
 */
function formatRunSummary(run) {
  const id = run.pipelineRunId.slice(0, 8);
  const stage = run.currentStageId || '(none)';
  return `[${id}] ${run.projectSlug} | ${run.status} @ ${stage} | goal: ${run.goal}`;
}

async function routeCommand(commandName, args, deps) {
  const classifier = deps.classifyCommandRoute || classifyCommandRoute;
  if (!classifier) return null;
  try {
    return await classifier(commandName, args || {});
  } catch (err) {
    deps.logger?.warn?.('[sevo-v2] route classifier failed', {
      commandName,
      error: String(err?.message || err),
    });
    return {
      source: 'route-vector-classifier',
      pipeline: { ok: false, source: 'route-vector-error', reason: String(err?.message || err) },
      stage: { ok: false, source: 'route-vector-error', reason: String(err?.message || err), stage: null },
      selectedStage: null,
      selectedPipelineLevel: 0,
    };
  }
}

function formatRouteSuffix(routeDecision) {
  if (!routeDecision?.stage?.matchedSample && !routeDecision?.pipeline?.matchedSample) return '';
  const parts = [];
  if (routeDecision.pipeline?.matchedSample) {
    parts.push(`pipeline:${routeDecision.pipeline.matchedSample.id}/${routeDecision.pipeline.confidenceBand}`);
  }
  if (routeDecision.stage?.matchedSample) {
    parts.push(`stage:${routeDecision.stage.matchedSample.id}/${routeDecision.stage.confidenceBand}`);
  }
  return ` Route: ${parts.join(', ')}.`;
}

/**
 * Create a new pipeline run with dedup check.
 *
 * @param {object} args
 * @param {object} deps
 * @returns {string}
 */
async function cmdCreate(args, deps) {
  const { projectSlug, projectRoot, goal, entryType, stagePlan } = args;
  if (!projectSlug) return 'Error: projectSlug is required.';
  if (!projectRoot) return 'Error: projectRoot is required.';
  if (!goal) return 'Error: goal is required.';

  const routeDecision = await routeCommand('create', args, deps);
  const resolvedStagePlan = stagePlan?.ordered?.length
    ? stagePlan
    : { ordered: [...DEFAULT_FULL_PIPELINE_STAGES], skipped: [] };
  const skipError = validateStagePlanSkips(resolvedStagePlan);
  if (skipError) return skipError;
  const fingerprint = scopeFingerprint(goal);
  const activeRuns = deps.runStore.listActiveRuns(projectSlug);
  const duplicate = activeRuns.find(
    (r) => r.scopeFingerprint === fingerprint && r.status === 'running',
  );
  if (duplicate) {
    return `Rejected: duplicate goal already running as [${duplicate.pipelineRunId.slice(0, 8)}]. Use status or cancel first.`;
  }

  const run = deps.runStore.createRun({
    projectSlug,
    projectRoot,
    goal,
    entryType,
    stagePlan: resolvedStagePlan,
    routeDecision,
  });
  return `Created run [${run.pipelineRunId.slice(0, 8)}] for ${projectSlug} — starting at stage "${run.currentStageId}".${formatRouteSuffix(routeDecision)}`;
}

/**
 * Cancel a running pipeline run.
 *
 * @param {object} args
 * @param {object} deps
 * @returns {string}
 */
function cmdCancel(args, deps) {
  const { pipelineRunId, reason } = args;
  if (!pipelineRunId) return 'Error: pipelineRunId is required.';

  const run = deps.runStore.getRun(pipelineRunId);
  if (!run) return `Error: run ${pipelineRunId} not found.`;
  if (run.status !== 'running' && run.status !== 'stale') {
    return `Error: run [${pipelineRunId.slice(0, 8)}] is already ${run.status}, cannot cancel.`;
  }

  deps.runStore.closeRun(pipelineRunId, { status: 'cancelled', reason: reason || 'user cancelled' });
  return `Cancelled run [${pipelineRunId.slice(0, 8)}] (${run.projectSlug}).`;
}

/**
 * Skip current stage and advance to next.
 *
 * @param {object} args
 * @param {object} deps
 * @returns {string}
 */
function cmdSkip(args, deps) {
  const { pipelineRunId, stageId } = args;
  if (!pipelineRunId) return 'Error: pipelineRunId is required.';

  const run = deps.runStore.getRun(pipelineRunId);
  if (!run) return `Error: run ${pipelineRunId} not found.`;
  if (run.status !== 'running') {
    return `Error: run [${pipelineRunId.slice(0, 8)}] is ${run.status}, cannot skip.`;
  }

  const targetStage = stageId || run.currentStageId;
  const stageState = run.stages?.[targetStage];
  if (!stageState) return `Error: stage "${targetStage}" not found in run.`;
  if (isProtectedStage(targetStage)) {
    return `Error: stage "${targetStage}" is mandatory and cannot be skipped.`;
  }
  if (stageState.status === 'passed' || stageState.status === 'skipped') {
    return `Error: stage "${targetStage}" already ${stageState.status}.`;
  }

  deps.runStore.advanceStage(pipelineRunId, targetStage, { status: 'skipped' });
  return `Skipped stage "${targetStage}" in run [${pipelineRunId.slice(0, 8)}].`;
}

/**
 * Return status summary for a specific run or all active runs.
 *
 * @param {object} args
 * @param {object} deps
 * @returns {string}
 */
function cmdStatus(args, deps) {
  const { pipelineRunId, projectSlug } = args;

  if (pipelineRunId) {
    const run = deps.runStore.getRun(pipelineRunId);
    if (!run) return `Error: run ${pipelineRunId} not found.`;
    const stageLines = run.stagePlan.ordered.map((stageId) => {
      const s = run.stages?.[stageId];
      const marker = stageId === run.currentStageId ? '→' : ' ';
      return `  ${marker} ${stageId}: ${s?.status || 'unknown'}`;
    });
    const routeLine = run.metadata?.routeDecision?.source
      ? [`  route: ${run.metadata.routeDecision.source} stage=${run.metadata.routeDecision.selectedStage || '(none)'}`]
      : [];
    return [formatRunSummary(run), ...routeLine, ...stageLines].join('\n');
  }

  const runs = deps.runStore.listActiveRuns(projectSlug || undefined);
  if (runs.length === 0) return 'No active pipeline runs.';
  return runs.map(formatRunSummary).join('\n');
}

/**
 * Diagnose a run's health: detect stale stages, stuck states.
 *
 * @param {object} args
 * @param {object} deps
 * @returns {string}
 */
function cmdDiagnose(args, deps) {
  const { pipelineRunId } = args;
  if (!pipelineRunId) return 'Error: pipelineRunId is required.';

  const run = deps.runStore.getRun(pipelineRunId);
  if (!run) return `Error: run ${pipelineRunId} not found.`;

  const issues = [];
  const now = Date.now();
  const lastActivity = new Date(run.lifecycle.lastActivityAt).getTime();

  if (now - lastActivity > STALE_THRESHOLD_MS) {
    issues.push(`STALE: no activity for ${Math.floor((now - lastActivity) / 86400000)}d`);
  }

  const currentStage = run.stages?.[run.currentStageId];
  if (currentStage?.status === 'active' && currentStage.startedAt) {
    const stageAge = now - new Date(currentStage.startedAt).getTime();
    if (stageAge > 24 * 60 * 60 * 1000) {
      issues.push(`STUCK: stage "${run.currentStageId}" active for ${Math.floor(stageAge / 3600000)}h`);
    }
  }

  if (currentStage?.status === 'failed') {
    issues.push(`FAILED: stage "${run.currentStageId}" is in failed state (attempt ${currentStage.attempt})`);
  }

  if (issues.length === 0) return `Run [${pipelineRunId.slice(0, 8)}] is healthy.`;
  return `Diagnosis for [${pipelineRunId.slice(0, 8)}]:\n${issues.map((i) => `  - ${i}`).join('\n')}`;
}

/**
 * Retry a failed stage by resetting it to active.
 *
 * @param {object} args
 * @param {object} deps
 * @returns {string}
 */
function cmdRetry(args, deps) {
  const { pipelineRunId, stageId } = args;
  if (!pipelineRunId) return 'Error: pipelineRunId is required.';

  const run = deps.runStore.getRun(pipelineRunId);
  if (!run) return `Error: run ${pipelineRunId} not found.`;
  if (run.status !== 'running') {
    return `Error: run [${pipelineRunId.slice(0, 8)}] is ${run.status}, cannot retry.`;
  }

  const targetStage = stageId || run.currentStageId;
  const stageState = run.stages?.[targetStage];
  if (!stageState) return `Error: stage "${targetStage}" not found in run.`;
  if (stageState.status !== 'failed') {
    return `Error: stage "${targetStage}" is ${stageState.status}, only failed stages can be retried.`;
  }

  deps.runStore.advanceStage(pipelineRunId, targetStage, { status: 'active' });
  return `Retrying stage "${targetStage}" in run [${pipelineRunId.slice(0, 8)}] (attempt ${(stageState.attempt || 1) + 1}).`;
}

/**
 * Create a pipeline run starting from a specified stage, marking prior stages as passed.
 *
 * @param {object} args
 * @param {object} deps
 * @returns {string}
 */
async function cmdFrom(args, deps) {
  const { projectSlug, projectRoot, goal, fromStage, stagePlan } = args;
  if (!projectSlug) return 'Error: projectSlug is required.';
  if (!projectRoot) return 'Error: projectRoot is required.';
  if (!goal) return 'Error: goal is required.';
  if (!fromStage) return 'Error: fromStage is required.';
  if (!stagePlan?.ordered?.length) return 'Error: stagePlan.ordered must have at least one stage.';

  const routeDecision = await routeCommand('from', args, deps);
  const semanticStage = routeDecision?.selectedStage;
  const resolvedFromStage = semanticStage && stagePlan.ordered.includes(semanticStage)
    ? semanticStage
    : fromStage;
  const skipError = validateStagePlanSkips(stagePlan);
  if (skipError) return skipError;

  const stageIndex = stagePlan.ordered.indexOf(resolvedFromStage);
  if (stageIndex < 0) {
    return `Error: stage "${resolvedFromStage}" not found in stagePlan.ordered.`;
  }

  const run = deps.runStore.createRun({
    projectSlug,
    projectRoot,
    goal,
    entryType: 'from',
    stagePlan,
    routeDecision,
  });

  const priorStages = stagePlan.ordered.slice(0, stageIndex);
  const entryStageId = markPriorStagesForEntry(run, resolvedFromStage, priorStages, deps);

  const completedStages = priorStages.filter((s) => !isProtectedStage(s));
  const { advisories } = canEnterFrom(resolvedFromStage, completedStages);
  for (const adv of advisories) {
    appendAdvisory(run.pipelineRunId, {
      stageId: adv.stageId,
      type: 'entry-skip',
      severity: 'warn',
      message: adv.reason,
      evidence: [`cmdFrom: entering at "${resolvedFromStage}"`],
    }, deps);
  }

  const semanticSuffix = resolvedFromStage !== fromStage
    ? ` (semantic route selected "${resolvedFromStage}" over requested "${fromStage}")`
    : '';
  const reviewSuffix = entryStageId !== resolvedFromStage
    ? ` Mandatory prior stage "${entryStageId}" requires pass/no-change review before "${resolvedFromStage}".`
    : '';
  return `Created run [${run.pipelineRunId.slice(0, 8)}] for ${projectSlug} — starting from stage "${entryStageId}"${semanticSuffix} (${priorStages.length} prior stages prepared).${reviewSuffix}${formatRouteSuffix(routeDecision)}`;
}

/**
 * Entry-point command: start or join a pipeline at a given stage.
 * If an active run exists for the project, return its status.
 * If not, auto-create a run starting from the specified stage.
 */
function cmdEntryPoint(stageId) {
  return async function entryPointHandler(args, deps) {
    const { projectSlug, projectRoot, goal } = args;
    if (!projectSlug) return 'Error: projectSlug is required.';
    if (!projectRoot) return 'Error: projectRoot is required.';
    if (!goal) return 'Error: goal is required.';

    const activeRuns = deps.runStore.listActiveRuns(projectSlug);
    const existingRun = activeRuns.find((r) => r.status === 'running');
    if (existingRun) {
      return `Active run exists: [${existingRun.pipelineRunId.slice(0, 8)}] @ stage "${existingRun.currentStageId}". Use sevo:status for details.`;
    }

    const routeDecision = await routeCommand(stageId, args, deps);
    const semanticStage = routeDecision?.selectedStage;
    const stagePlan = { ordered: [...DEFAULT_FULL_PIPELINE_STAGES], skipped: [] };
    const resolvedStageId = semanticStage && stagePlan.ordered.includes(semanticStage)
      ? semanticStage
      : stageId;
    const stageIndex = stagePlan.ordered.indexOf(resolvedStageId);
    if (stageIndex < 0) {
      return `Error: stage "${resolvedStageId}" not in default pipeline stages.`;
    }

    const run = deps.runStore.createRun({
      projectSlug,
      projectRoot,
      goal,
      entryType: `entry-${resolvedStageId}`,
      stagePlan,
      routeDecision,
    });

    const priorStages = stagePlan.ordered.slice(0, stageIndex);
    const entryStageId = markPriorStagesForEntry(run, resolvedStageId, priorStages, deps);

    const completedStages = priorStages.filter((s) => !isProtectedStage(s));
    const { advisories } = canEnterFrom(resolvedStageId, completedStages);
    for (const adv of advisories) {
      appendAdvisory(run.pipelineRunId, {
        stageId: adv.stageId,
        type: 'entry-skip',
        severity: 'warn',
        message: adv.reason,
        evidence: [`cmdEntryPoint: entering at "${resolvedStageId}"`],
      }, deps);
    }

    const semanticSuffix = resolvedStageId !== stageId
      ? ` (semantic route selected "${resolvedStageId}" over requested "${stageId}")`
      : '';
    const reviewSuffix = entryStageId !== resolvedStageId
      ? ` Mandatory prior stage "${entryStageId}" requires pass/no-change review before "${resolvedStageId}".`
      : '';
    return `Auto-created run [${run.pipelineRunId.slice(0, 8)}] for ${projectSlug} — starting from stage "${entryStageId}"${semanticSuffix} (${priorStages.length} prior stages prepared).${reviewSuffix}${formatRouteSuffix(routeDecision)}`;
  };
}

const COMMANDS = {
  create: cmdCreate,
  cancel: cmdCancel,
  skip: cmdSkip,
  status: cmdStatus,
  diagnose: cmdDiagnose,
  retry: cmdRetry,
  from: cmdFrom,
  implement: cmdEntryPoint('implement'),
  fix: cmdEntryPoint('fix'),
};

/**
 * Unified command dispatcher for SEVO pipeline operations.
 *
 * @param {string} commandName - One of: create, cancel, skip, status, diagnose, retry.
 * @param {object} args - Command-specific arguments.
 * @param {object} deps - Injected dependencies ({ runStore, logger? }).
 * @returns {string} User-visible response text.
 */
export async function handleCommand(commandName, args, deps) {
  if (!commandName || typeof commandName !== 'string') {
    return 'Error: commandName is required.';
  }
  if (!deps?.runStore) {
    return 'Error: deps.runStore is required.';
  }

  const handler = COMMANDS[commandName];
  if (!handler) {
    return `Error: unknown command "${commandName}". Available: ${Object.keys(COMMANDS).join(', ')}.`;
  }

  return await handler(args || {}, deps);
}
