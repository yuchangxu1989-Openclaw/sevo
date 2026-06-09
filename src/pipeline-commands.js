/**
 * Pipeline Commands — unified command dispatcher for SEVO V2.
 *
 * Handles: create, cancel, skip, status, diagnose, retry.
 * Pure function style: all external deps injected via `deps` parameter.
 */

import { createHash } from 'node:crypto';

const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Compute scope fingerprint from goal text for dedup.
 *
 * @param {string} goal
 * @returns {string}
 */
function scopeFingerprint(goal) {
  return `sha256:${createHash('sha256').update(goal || '').digest('hex')}`;
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

/**
 * Create a new pipeline run with dedup check.
 *
 * @param {object} args
 * @param {object} deps
 * @returns {string}
 */
function cmdCreate(args, deps) {
  const { projectSlug, projectRoot, goal, entryType, stagePlan } = args;
  if (!projectSlug) return 'Error: projectSlug is required.';
  if (!projectRoot) return 'Error: projectRoot is required.';
  if (!goal) return 'Error: goal is required.';
  if (!stagePlan?.ordered?.length) return 'Error: stagePlan.ordered must have at least one stage.';

  const fingerprint = scopeFingerprint(goal);
  const activeRuns = deps.runStore.listActiveRuns(projectSlug);
  const duplicate = activeRuns.find(
    (r) => r.scopeFingerprint === fingerprint && r.status === 'running',
  );
  if (duplicate) {
    return `Rejected: duplicate goal already running as [${duplicate.pipelineRunId.slice(0, 8)}]. Use status or cancel first.`;
  }

  const run = deps.runStore.createRun({ projectSlug, projectRoot, goal, entryType, stagePlan });
  return `Created run [${run.pipelineRunId.slice(0, 8)}] for ${projectSlug} — starting at stage "${run.currentStageId}".`;
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
    return [formatRunSummary(run), ...stageLines].join('\n');
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
function cmdFrom(args, deps) {
  const { projectSlug, projectRoot, goal, fromStage, stagePlan } = args;
  if (!projectSlug) return 'Error: projectSlug is required.';
  if (!projectRoot) return 'Error: projectRoot is required.';
  if (!goal) return 'Error: goal is required.';
  if (!fromStage) return 'Error: fromStage is required.';
  if (!stagePlan?.ordered?.length) return 'Error: stagePlan.ordered must have at least one stage.';

  const stageIndex = stagePlan.ordered.indexOf(fromStage);
  if (stageIndex < 0) {
    return `Error: stage "${fromStage}" not found in stagePlan.ordered.`;
  }

  const run = deps.runStore.createRun({
    projectSlug,
    projectRoot,
    goal,
    entryType: 'from',
    stagePlan,
  });

  const priorStages = stagePlan.ordered.slice(0, stageIndex);
  for (const stageId of priorStages) {
    deps.runStore.advanceStage(run.pipelineRunId, stageId, { status: 'passed' });
  }

  deps.runStore.advanceStage(run.pipelineRunId, fromStage, { status: 'active' });

  return `Created run [${run.pipelineRunId.slice(0, 8)}] for ${projectSlug} — starting from stage "${fromStage}" (${priorStages.length} prior stages marked passed).`;
}

const COMMANDS = {
  create: cmdCreate,
  cancel: cmdCancel,
  skip: cmdSkip,
  status: cmdStatus,
  diagnose: cmdDiagnose,
  retry: cmdRetry,
  from: cmdFrom,
};

/**
 * Unified command dispatcher for SEVO pipeline operations.
 *
 * @param {string} commandName - One of: create, cancel, skip, status, diagnose, retry.
 * @param {object} args - Command-specific arguments.
 * @param {object} deps - Injected dependencies ({ runStore, logger? }).
 * @returns {string} User-visible response text.
 */
export function handleCommand(commandName, args, deps) {
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

  return handler(args || {}, deps);
}
