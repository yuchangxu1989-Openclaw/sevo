import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(MODULE_DIR, '..');
const DATA_DIR = join(PROJECT_ROOT, 'data');
const PIPELINES_DIR = join(DATA_DIR, 'pipelines');
const ACTIVE_INDEX_PATH = join(DATA_DIR, 'active-index.json');
const ACTIVE_STATUSES = new Set(['running', 'stale']);
const TERMINAL_STAGE_STATUSES = new Set(['passed', 'failed', 'blocked', 'skipped']);

function nowIso() {
  return new Date().toISOString();
}

function ensureDataDirs() {
  mkdirSync(PIPELINES_DIR, { recursive: true });
}

function runDir(pipelineRunId) {
  return join(PIPELINES_DIR, pipelineRunId);
}

function statePath(pipelineRunId) {
  return join(runDir(pipelineRunId), 'state.json');
}

function ledgerPath(pipelineRunId) {
  return join(runDir(pipelineRunId), 'ledger.jsonl');
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readActiveIndex() {
  return readJson(ACTIVE_INDEX_PATH, { pipelines: {} });
}

function writeActiveIndex(index) {
  writeJson(ACTIVE_INDEX_PATH, {
    pipelines: { ...(index?.pipelines || {}) },
  });
}

function updateActiveIndex(run) {
  const index = readActiveIndex();
  const pipelines = { ...(index.pipelines || {}) };
  if (ACTIVE_STATUSES.has(run.status)) {
    pipelines[run.pipelineRunId] = {
      projectSlug: run.projectSlug,
      status: run.status,
      currentStageId: run.currentStageId,
    };
  } else {
    delete pipelines[run.pipelineRunId];
  }
  writeActiveIndex({ pipelines });
}

function appendLedger(pipelineRunId, type, data) {
  appendFileSync(
    ledgerPath(pipelineRunId),
    `${JSON.stringify({ timestamp: nowIso(), type, pipelineRunId, data })}\n`,
    'utf8',
  );
}

function normalizeStagePlan(stagePlan) {
  const ordered = Array.isArray(stagePlan?.ordered) ? stagePlan.ordered.filter(Boolean) : [];
  const skipped = Array.isArray(stagePlan?.skipped) ? stagePlan.skipped.filter(Boolean) : [];
  if (ordered.length === 0) {
    throw new Error('createRun: stagePlan.ordered must contain at least one stage');
  }
  return { ordered, skipped };
}

function createInitialStages(stagePlan, timestamp) {
  const skipped = new Set(stagePlan.skipped);
  const firstActive = stagePlan.ordered.find((stageId) => !skipped.has(stageId)) || stagePlan.ordered[0];
  return Object.fromEntries(
    stagePlan.ordered.map((stageId) => {
      const status = skipped.has(stageId) ? 'skipped' : stageId === firstActive ? 'active' : 'pending';
      return [
        stageId,
        {
          status,
          startedAt: status === 'active' ? timestamp : null,
          completedAt: status === 'skipped' ? timestamp : null,
          dispatchId: null,
          artifacts: [],
          attempt: 1,
        },
      ];
    }),
  );
}

function nextOpenStage(run, completedStageId) {
  const completedIndex = run.stagePlan.ordered.indexOf(completedStageId);
  const searchFrom = completedIndex >= 0 ? completedIndex + 1 : 0;
  return run.stagePlan.ordered
    .slice(searchFrom)
    .find((stageId) => !TERMINAL_STAGE_STATUSES.has(run.stages?.[stageId]?.status));
}

function requireRun(pipelineRunId) {
  const run = getRun(pipelineRunId);
  if (!run) throw new Error(`PipelineRun not found: ${pipelineRunId}`);
  return run;
}

function scopeFingerprint(goal) {
  return `sha256:${createHash('sha256').update(goal || '').digest('hex')}`;
}

function isMaintenanceRun(projectSlug, projectRoot) {
  return (
    projectSlug === 'sevo' ||
    projectRoot?.startsWith('projects/sevo') ||
    projectRoot?.startsWith('extensions/sevo')
  );
}

/**
 * Create a new PipelineRun, persist state and ledger files, and add it to active-index.json.
 *
 * @param {{ projectSlug: string, projectRoot: string, goal: string, entryType: string, stagePlan: { ordered: string[], skipped?: string[] } }} input
 * @returns {object} The complete PipelineRun snapshot.
 */
export function createRun({ projectSlug, projectRoot, goal, entryType, stagePlan }) {
  if (!projectSlug || typeof projectSlug !== 'string') {
    throw new Error(`createRun: invalid projectSlug: ${projectSlug}`);
  }
  if (!projectRoot || typeof projectRoot !== 'string') {
    throw new Error(`createRun: invalid projectRoot: ${projectRoot}`);
  }
  if (!goal || typeof goal !== 'string') {
    throw new Error(`createRun: invalid goal: ${goal}`);
  }

  ensureDataDirs();
  const pipelineRunId = randomUUID();
  const timestamp = nowIso();
  const normalizedStagePlan = normalizeStagePlan(stagePlan);
  const stages = createInitialStages(normalizedStagePlan, timestamp);
  const currentStageId =
    normalizedStagePlan.ordered.find((stageId) => stages[stageId]?.status === 'active') ||
    normalizedStagePlan.ordered[0];
  const run = {
    schemaVersion: 2,
    pipelineRunId,
    projectSlug,
    projectRoot,
    goal,
    scopeFingerprint: scopeFingerprint(goal),
    status: 'running',
    entryType: entryType || 'create',
    lifecycle: {
      createdAt: timestamp,
      startedAt: timestamp,
      completedAt: null,
      cancelledAt: null,
      lastActivityAt: timestamp,
      staleDetectedAt: null,
      terminalReason: null,
    },
    stagePlan: normalizedStagePlan,
    currentStageId,
    stages,
    metadata: {
      createdBy: 'user',
      maintenanceRun: isMaintenanceRun(projectSlug, projectRoot),
      parentRunId: null,
    },
  };

  mkdirSync(runDir(pipelineRunId), { recursive: true });
  writeJson(statePath(pipelineRunId), run);
  writeActiveIndex(readActiveIndex());
  updateActiveIndex(run);
  appendLedger(pipelineRunId, 'run-created', {
    projectSlug,
    currentStageId,
    entryType: run.entryType,
  });
  return run;
}

/**
 * Read a PipelineRun snapshot by ID from data/pipelines/<uuid>/state.json.
 *
 * @param {string} pipelineRunId
 * @returns {object | null} The PipelineRun snapshot, or null when missing.
 */
export function getRun(pipelineRunId) {
  if (!pipelineRunId || typeof pipelineRunId !== 'string') return null;
  return readJson(statePath(pipelineRunId), null);
}

/**
 * List non-terminal PipelineRuns from active-index.json, optionally scoped by projectSlug.
 *
 * @param {string} [projectSlug]
 * @returns {object[]} Active PipelineRun snapshots.
 */
export function listActiveRuns(projectSlug) {
  const index = readActiveIndex();
  return Object.entries(index.pipelines || {})
    .filter(([, summary]) => !projectSlug || summary.projectSlug === projectSlug)
    .map(([pipelineRunId]) => getRun(pipelineRunId))
    .filter((run) => run && ACTIVE_STATUSES.has(run.status));
}

/**
 * Update one stage status, artifacts, and dispatch binding, then persist the run snapshot.
 *
 * @param {string} pipelineRunId
 * @param {string} stageId
 * @param {{ status: string, artifacts?: string[], dispatchId?: string }} update
 * @returns {object} The updated PipelineRun snapshot.
 */
export function advanceStage(pipelineRunId, stageId, { status, artifacts, dispatchId }) {
  if (!stageId || typeof stageId !== 'string') {
    throw new Error(`advanceStage: invalid stageId: ${stageId}`);
  }
  if (!status || typeof status !== 'string') {
    throw new Error(`advanceStage: invalid status: ${status}`);
  }

  const run = requireRun(pipelineRunId);
  const timestamp = nowIso();
  const previousStage = run.stages?.[stageId] || {
    status: 'pending',
    startedAt: null,
    completedAt: null,
    dispatchId: null,
    artifacts: [],
    attempt: 1,
  };
  const stage = {
    ...previousStage,
    status,
    startedAt: previousStage.startedAt || (status === 'active' ? timestamp : null),
    completedAt: TERMINAL_STAGE_STATUSES.has(status) ? timestamp : null,
    dispatchId: dispatchId ?? previousStage.dispatchId ?? null,
    artifacts: artifacts ? [...artifacts] : [...(previousStage.artifacts || [])],
    attempt: previousStage.attempt || 1,
  };
  const stages = {
    ...run.stages,
    [stageId]: stage,
  };
  const nextStageId = ['passed', 'skipped'].includes(status)
    ? nextOpenStage({ ...run, stages }, stageId)
    : null;
  const nextStage = nextStageId ? stages[nextStageId] : null;
  const advancedStages = nextStageId
    ? {
        ...stages,
        [nextStageId]: {
          ...nextStage,
          status: nextStage.status === 'pending' ? 'active' : nextStage.status,
          startedAt: nextStage.startedAt || timestamp,
        },
      }
    : stages;
  const currentStageId =
    status === 'active' ? stageId : nextStageId || (['failed', 'blocked'].includes(status) ? stageId : run.currentStageId);
  const updatedRun = {
    ...run,
    currentStageId,
    stages: advancedStages,
    lifecycle: {
      ...run.lifecycle,
      lastActivityAt: timestamp,
    },
  };

  writeJson(statePath(pipelineRunId), updatedRun);
  updateActiveIndex(updatedRun);
  appendLedger(pipelineRunId, 'stage-advanced', { stageId, status, artifacts, dispatchId });
  return updatedRun;
}

/**
 * Move a PipelineRun to a terminal status and remove it from active-index.json.
 *
 * @param {string} pipelineRunId
 * @param {{ status: 'completed' | 'cancelled', reason?: string }} update
 * @returns {void}
 */
export function closeRun(pipelineRunId, { status, reason }) {
  if (!['completed', 'cancelled'].includes(status)) {
    throw new Error(`closeRun: invalid terminal status: ${status}`);
  }
  const run = requireRun(pipelineRunId);
  const timestamp = nowIso();
  const updatedRun = {
    ...run,
    status,
    lifecycle: {
      ...run.lifecycle,
      completedAt: status === 'completed' ? timestamp : run.lifecycle.completedAt,
      cancelledAt: status === 'cancelled' ? timestamp : run.lifecycle.cancelledAt,
      lastActivityAt: timestamp,
      terminalReason: reason || null,
    },
  };

  writeJson(statePath(pipelineRunId), updatedRun);
  updateActiveIndex(updatedRun);
  appendLedger(pipelineRunId, 'run-closed', { status, reason });
}

/**
 * Mark a PipelineRun as stale and keep its stale summary in active-index.json.
 *
 * @param {string} pipelineRunId
 * @returns {void}
 */
export function markStale(pipelineRunId) {
  const run = requireRun(pipelineRunId);
  const timestamp = nowIso();
  const updatedRun = {
    ...run,
    status: 'stale',
    lifecycle: {
      ...run.lifecycle,
      lastActivityAt: timestamp,
      staleDetectedAt: timestamp,
    },
  };
  writeJson(statePath(pipelineRunId), updatedRun);
  updateActiveIndex(updatedRun);
  appendLedger(pipelineRunId, 'run-stale', {});
}

/**
 * Refresh PipelineRun lifecycle.lastActivityAt and active-index summary.
 *
 * @param {string} pipelineRunId
 * @returns {void}
 */
export function touch(pipelineRunId) {
  const run = requireRun(pipelineRunId);
  const timestamp = nowIso();
  const updatedRun = {
    ...run,
    lifecycle: {
      ...run.lifecycle,
      lastActivityAt: timestamp,
    },
  };
  writeJson(statePath(pipelineRunId), updatedRun);
  updateActiveIndex(updatedRun);
  appendLedger(pipelineRunId, 'run-touched', {});
}
