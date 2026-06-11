import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(MODULE_DIR, '..');
const DATA_DIR = process.env.SEVO_DATA_DIR
  ? resolve(process.env.SEVO_DATA_DIR)
  : join(PROJECT_ROOT, 'data');
const STATE_DIR = process.env.SEVO_STATE_DIR
  ? resolve(process.env.SEVO_STATE_DIR)
  : join(PROJECT_ROOT, 'state');
const PIPELINES_DIR = join(DATA_DIR, 'pipelines');
const ACTIVE_INDEX_PATH = join(DATA_DIR, 'active-index.json');
const ACTIVE_STATUSES = new Set(['running', 'stale']);
const COMPLETED_STAGE_STATUSES = new Set(['passed', 'completed', 'repairing', 'cancelled', 'skipped']);
const DEFAULT_STALE_AFTER_DAYS = 7;
const DEFAULT_ARCHIVE_AFTER_STALE_DAYS = 7;
const DEFAULT_STALE_ARCHIVE_DAYS = DEFAULT_STALE_AFTER_DAYS;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const LIFECYCLE_SCAN_PATH = join(DATA_DIR, 'lifecycle-scans.jsonl');
const COMPAT_ACTIVE_PIPELINES_PATH = join(STATE_DIR, 'active-pipelines.json');
const COMPAT_ACTIVE_PIPELINES_SCHEMA_VERSION = 3;

function nowIso() {
  return new Date().toISOString();
}

function ensureDataDirs() {
  mkdirSync(PIPELINES_DIR, { recursive: true });
}

function normalizePipelineRunId(pipelineRunId) {
  if (!pipelineRunId || typeof pipelineRunId !== 'string') {
    throw new Error(`invalid pipelineRunId: ${pipelineRunId}`);
  }
  if (pipelineRunId !== basename(pipelineRunId) || pipelineRunId === '.' || pipelineRunId === '..') {
    throw new Error(`invalid pipelineRunId: ${pipelineRunId}`);
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(pipelineRunId)) {
    throw new Error(`invalid pipelineRunId: ${pipelineRunId}`);
  }
  return pipelineRunId;
}

function runDir(pipelineRunId) {
  return join(PIPELINES_DIR, normalizePipelineRunId(pipelineRunId));
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

function toCompatibilityEntry(run) {
  const currentStage = run.currentStageId || null;
  return {
    projectSlug: run.projectSlug,
    projectRoot: run.projectRoot,
    status: run.status,
    currentStage,
    currentStageId: currentStage,
    lastAdvancedAt: run.lifecycle?.lastActivityAt || nowIso(),
    source: 'v2-run-store',
  };
}

function updateActivePipelineCompatibilityIndex(run) {
  const index = readJson(COMPAT_ACTIVE_PIPELINES_PATH, {
    schemaVersion: COMPAT_ACTIVE_PIPELINES_SCHEMA_VERSION,
    pipelines: {},
    _v2MigrationNote: 'V1 pipelines archived on 2026-06-09. V2 active-index.json is now authoritative.',
  });
  const pipelines = { ...(index?.pipelines || {}) };

  if (ACTIVE_STATUSES.has(run.status)) {
    pipelines[run.pipelineRunId] = {
      ...(pipelines[run.pipelineRunId] || {}),
      ...toCompatibilityEntry(run),
    };
  } else {
    delete pipelines[run.pipelineRunId];
  }

  writeJson(COMPAT_ACTIVE_PIPELINES_PATH, {
    ...index,
    schemaVersion: index?.schemaVersion || COMPAT_ACTIVE_PIPELINES_SCHEMA_VERSION,
    pipelines,
  });
}

function reconcileActivePipelineCompatibilityIndex() {
  const active = readActiveIndex();
  const compat = readJson(COMPAT_ACTIVE_PIPELINES_PATH, {
    schemaVersion: COMPAT_ACTIVE_PIPELINES_SCHEMA_VERSION,
    pipelines: {},
    _v2MigrationNote: 'V1 pipelines archived on 2026-06-09. V2 active-index.json is now authoritative.',
  });
  const pipelines = { ...(compat?.pipelines || {}) };
  const activeIds = new Set(Object.keys(active?.pipelines || {}));
  let dirty = false;

  for (const pipelineRunId of activeIds) {
    const run = getRun(pipelineRunId);
    if (!run || !ACTIVE_STATUSES.has(run.status)) continue;
    pipelines[pipelineRunId] = {
      ...(pipelines[pipelineRunId] || {}),
      ...toCompatibilityEntry(run),
    };
    dirty = true;
  }

  for (const [pipelineRunId, entry] of Object.entries(pipelines)) {
    if (entry?.source === 'v2-run-store' && !activeIds.has(pipelineRunId)) {
      delete pipelines[pipelineRunId];
      dirty = true;
    }
  }

  if (dirty) {
    writeJson(COMPAT_ACTIVE_PIPELINES_PATH, {
      ...compat,
      schemaVersion: compat?.schemaVersion || COMPAT_ACTIVE_PIPELINES_SCHEMA_VERSION,
      pipelines,
    });
  }
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
  updateActivePipelineCompatibilityIndex(run);
}

function appendLedger(pipelineRunId, type, data) {
  appendFileSync(
    ledgerPath(pipelineRunId),
    `${JSON.stringify({ timestamp: nowIso(), type, pipelineRunId, data })}\n`,
    'utf8',
  );
}

function normalizePositiveDays(value, fallback) {
  const days = Number(value);
  return Number.isFinite(days) && days > 0 ? days : fallback;
}

function normalizeStageStatusForWrite(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (['blocked', 'paused', 'gate-failed', 'failed'].includes(normalized)) return 'repairing';
  return status;
}

function toTimeMs(value) {
  if (value instanceof Date) return value.getTime();
  if (value === undefined || value === null || value === '') return NaN;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function normalizeNowMs(value) {
  const ms = value instanceof Date
    ? value.getTime()
    : value
      ? new Date(value).getTime()
      : Date.now();
  return Number.isFinite(ms) ? ms : Date.now();
}

function appendLifecycleScan(record) {
  ensureDataDirs();
  appendFileSync(LIFECYCLE_SCAN_PATH, `${JSON.stringify(record)}\n`, 'utf8');
}

function readLastLedgerEvent(pipelineRunId) {
  const path = ledgerPath(pipelineRunId);
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, 'utf8').trim().split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      continue;
    }
  }
  return null;
}

function buildStaleSummary(run, detectedAt, thresholds) {
  const detectedMs = toTimeMs(detectedAt);
  const lastActivityAt = run.lifecycle?.lastActivityAt || run.lifecycle?.createdAt || null;
  const lastActivityMs = toTimeMs(lastActivityAt);
  const stalledForMs = Number.isFinite(lastActivityMs) && Number.isFinite(detectedMs)
    ? Math.max(0, detectedMs - lastActivityMs)
    : null;
  return {
    stuckStageId: run.currentStageId || null,
    lastActivityAt,
    stalledForMs,
    stalledForDays: stalledForMs === null ? null : Number((stalledForMs / MS_PER_DAY).toFixed(3)),
    recentEvent: readLastLedgerEvent(run.pipelineRunId),
    thresholds,
  };
}

function appendStaleAdvisory(run, staleSummary, detectedAt) {
  const existing = (run.openAdvisories || []).some(
    (advisory) => advisory?.type === 'stale-lifecycle' && advisory.resolvedAt === null,
  );
  if (existing) return run.openAdvisories || [];
  const stageId = staleSummary.stuckStageId || run.currentStageId || 'unknown';
  const stalledDays = staleSummary.stalledForDays === null ? 'unknown' : `${staleSummary.stalledForDays}`;
  return [
    ...(run.openAdvisories || []),
    {
      id: randomUUID(),
      runId: run.pipelineRunId,
      stageId,
      type: 'stale-lifecycle',
      severity: 'warn',
      message: `Pipeline run marked stale at stage "${stageId}" after ${stalledDays}d without activity`,
      evidence: [
        `lastActivityAt:${staleSummary.lastActivityAt || 'unknown'}`,
        `staleDetectedAt:${detectedAt}`,
        `staleAfterDays:${staleSummary.thresholds.staleAfterDays}`,
        `archiveAfterStaleDays:${staleSummary.thresholds.archiveAfterStaleDays}`,
      ],
      createdAt: detectedAt,
      resolvedAt: null,
    },
  ];
}

function resolveStaleAdvisories(run, timestamp, reason) {
  return (run.openAdvisories || []).map((advisory) => (
    advisory?.type === 'stale-lifecycle' && advisory.resolvedAt === null
      ? { ...advisory, resolvedAt: timestamp, resolution: reason }
      : advisory
  ));
}

function restoreStaleRunFields(run, timestamp, reason) {
  if (run.status !== 'stale') return { run, restored: false };
  return {
    restored: true,
    run: {
      ...run,
      status: 'running',
      openAdvisories: resolveStaleAdvisories(run, timestamp, reason),
      lifecycle: {
        ...run.lifecycle,
        lastActivityAt: timestamp,
        staleDetectedAt: null,
        staleResolvedAt: timestamp,
        staleResolutionReason: reason,
      },
    },
  };
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
    .find((stageId) => !COMPLETED_STAGE_STATUSES.has(run.stages?.[stageId]?.status));
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
export function createRun({ projectSlug, projectRoot, goal, entryType, stagePlan, routeDecision = null }) {
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
      archivedAt: null,
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
      routeDecision,
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
    routeDecision,
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
  try {
    if (!pipelineRunId || typeof pipelineRunId !== 'string') return null;
    return readJson(statePath(pipelineRunId), null);
  } catch (error) {
    if (String(error?.message || '').startsWith('invalid pipelineRunId:')) return null;
    throw error;
  }
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
export function advanceStage(pipelineRunId, stageId, { status, artifacts, dispatchId, needsPassNoChangeReview, suppressAutoAdvance, nextAction }) {
  if (!stageId || typeof stageId !== 'string') {
    throw new Error(`advanceStage: invalid stageId: ${stageId}`);
  }
  const writeStatus = normalizeStageStatusForWrite(status);
  if (!writeStatus || typeof writeStatus !== 'string') {
    throw new Error(`advanceStage: invalid status: ${status}`);
  }

  const loadedRun = requireRun(pipelineRunId);
  const timestamp = nowIso();
  const { run, restored } = restoreStaleRunFields(loadedRun, timestamp, 'stage advanced after stale detection');
  const previousStage = run.stages?.[stageId] || {
    status: 'pending',
    startedAt: null,
    completedAt: null,
    dispatchId: null,
    artifacts: [],
    attempt: 1,
  };
  const stageArtifacts = artifacts === undefined
    ? [...(previousStage.artifacts || [])]
    : Array.isArray(artifacts)
      ? [...artifacts]
      : (() => { throw new Error('advanceStage: artifacts must be an array when provided'); })();
  const stage = {
    ...previousStage,
    status: writeStatus,
    startedAt: previousStage.startedAt || (writeStatus === 'active' ? timestamp : null),
    completedAt: COMPLETED_STAGE_STATUSES.has(writeStatus) ? timestamp : null,
    dispatchId: dispatchId ?? previousStage.dispatchId ?? null,
    artifacts: stageArtifacts,
    attempt: previousStage.attempt || 1,
    ...(needsPassNoChangeReview === undefined ? {} : { needsPassNoChangeReview }),
  };
  const stages = {
    ...run.stages,
    [stageId]: stage,
  };
  const shouldAutoAdvance = !suppressAutoAdvance && COMPLETED_STAGE_STATUSES.has(writeStatus);
  const nextStageId = shouldAutoAdvance
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
    writeStatus === 'active' ? stageId : nextStageId || run.currentStageId;
  const updatedRun = {
    ...run,
    currentStageId,
    stages: advancedStages,
    ...(nextAction === undefined ? {} : { nextAction }),
    lifecycle: {
      ...run.lifecycle,
      lastActivityAt: timestamp,
    },
  };

  writeJson(statePath(pipelineRunId), updatedRun);
  updateActiveIndex(updatedRun);
  appendLedger(pipelineRunId, 'stage-advanced', { stageId, status: writeStatus, artifacts: stageArtifacts, dispatchId, needsPassNoChangeReview, nextAction });
  if (restored) appendLedger(pipelineRunId, 'run-stale-restored', { reason: 'stage advanced after stale detection' });
  return updatedRun;
}

/**
 * Move a PipelineRun to a terminal status and remove it from active-index.json.
 *
 * @param {string} pipelineRunId
 * @param {{ status: 'completed' | 'cancelled' | 'archived', reason?: string }} update
 * @returns {void}
 */
export function closeRun(pipelineRunId, { status, reason, timestamp: explicitTimestamp }) {
  if (!['completed', 'cancelled', 'archived'].includes(status)) {
    throw new Error(`closeRun: invalid terminal status: ${status}`);
  }
  const run = requireRun(pipelineRunId);
  const timestamp = explicitTimestamp || nowIso();
  const updatedRun = {
    ...run,
    status,
    lifecycle: {
      ...run.lifecycle,
      completedAt: status === 'completed' ? timestamp : run.lifecycle.completedAt,
      cancelledAt: status === 'cancelled' ? timestamp : run.lifecycle.cancelledAt,
      archivedAt: status === 'archived' ? timestamp : run.lifecycle.archivedAt,
      lastActivityAt: timestamp,
      terminalReason: reason || null,
    },
  };

  writeJson(statePath(pipelineRunId), updatedRun);
  updateActiveIndex(updatedRun);
  appendLedger(pipelineRunId, 'run-closed', { status, reason });
}

/**
 * Archive active V2 runs that have had no lifecycle activity for the configured age.
 *
 * @param {{ olderThanDays?: number, now?: Date|string|number }} [options]
 * @returns {object[]} Archived PipelineRun snapshots.
 */
export function archiveStaleRuns(options = {}) {
  const staleAfterDays = normalizePositiveDays(options.staleAfterDays ?? options.olderThanDays, DEFAULT_STALE_ARCHIVE_DAYS);
  const archiveAfterStaleDays = normalizePositiveDays(options.archiveAfterStaleDays ?? options.archiveAfterDays, DEFAULT_ARCHIVE_AFTER_STALE_DAYS);
  const nowMs = normalizeNowMs(options.now);
  const scannedAt = new Date(nowMs).toISOString();
  const staleThresholdMs = staleAfterDays * MS_PER_DAY;
  const archiveThresholdMs = archiveAfterStaleDays * MS_PER_DAY;
  const index = readActiveIndex();
  const stale = [];
  const archived = [];
  let checkedCount = 0;
  for (const pipelineRunId of Object.keys(index.pipelines || {})) {
    const run = getRun(pipelineRunId);
    if (!run || !ACTIVE_STATUSES.has(run.status)) continue;
    if (options.projectSlug && run.projectSlug !== options.projectSlug) continue;
    checkedCount += 1;

    if (run.status === 'stale') {
      const staleDetectedMs = toTimeMs(run.lifecycle?.staleDetectedAt);
      if (!Number.isFinite(staleDetectedMs)) {
        const staleRun = markStale(pipelineRunId, { now: scannedAt, staleAfterDays, archiveAfterStaleDays, logger: options.logger });
        stale.push(staleRun);
        continue;
      }
      if (nowMs - staleDetectedMs < archiveThresholdMs) continue;

      closeRun(pipelineRunId, {
        status: 'archived',
        reason: `stale pipeline archived after ${archiveAfterStaleDays}d in stale status`,
        timestamp: scannedAt,
      });
      const archivedRun = getRun(pipelineRunId);
      if (archivedRun) archived.push(archivedRun);
      continue;
    }

    const lastActivityAt = run.lifecycle?.lastActivityAt || run.lifecycle?.createdAt;
    const lastActivityMs = toTimeMs(lastActivityAt);
    if (!Number.isFinite(lastActivityMs)) continue;
    if (nowMs - lastActivityMs < staleThresholdMs) continue;

    const staleRun = markStale(pipelineRunId, { now: scannedAt, staleAfterDays, archiveAfterStaleDays, logger: options.logger });
    stale.push(staleRun);
  }

  const scanRecord = {
    scannedAt,
    checkedCount,
    staleCount: stale.length,
    archivedCount: archived.length,
    restoredCount: 0,
    thresholds: { staleAfterDays, archiveAfterStaleDays },
    staleRunIds: stale.map((run) => run.pipelineRunId),
    archivedRunIds: archived.map((run) => run.pipelineRunId),
  };
  appendLifecycleScan(scanRecord);
  archived.scanRecord = scanRecord;
  archived.staleRuns = stale;
  archived.archivedRuns = [...archived];
  archived.restoredRuns = [];
  return archived;
}

/**
 * Mark a PipelineRun as stale and keep its stale summary in active-index.json.
 *
 * @param {string} pipelineRunId
 * @param {{ now?: Date|string|number, staleAfterDays?: number, archiveAfterStaleDays?: number, logger?: object }} [options]
 * @returns {object} The updated PipelineRun snapshot.
 */
export function markStale(pipelineRunId, options = {}) {
  const run = requireRun(pipelineRunId);
  if (run.status === 'stale' && run.lifecycle?.staleDetectedAt) return run;
  if (!ACTIVE_STATUSES.has(run.status)) {
    throw new Error(`markStale: run is not active: ${run.status}`);
  }
  const nowMs = normalizeNowMs(options.now);
  const timestamp = new Date(nowMs).toISOString();
  const thresholds = {
    staleAfterDays: normalizePositiveDays(options.staleAfterDays, DEFAULT_STALE_ARCHIVE_DAYS),
    archiveAfterStaleDays: normalizePositiveDays(options.archiveAfterStaleDays, DEFAULT_ARCHIVE_AFTER_STALE_DAYS),
  };
  const staleSummary = buildStaleSummary(run, timestamp, thresholds);
  const updatedRun = {
    ...run,
    status: 'stale',
    openAdvisories: appendStaleAdvisory(run, staleSummary, timestamp),
    lifecycle: {
      ...run.lifecycle,
      staleDetectedAt: timestamp,
      staleSummary,
    },
  };
  writeJson(statePath(pipelineRunId), updatedRun);
  updateActiveIndex(updatedRun);
  appendLedger(pipelineRunId, 'run-stale', staleSummary);
  options.logger?.info?.('[sevo-v2] pipeline run marked stale', {
    pipelineRunId,
    currentStageId: staleSummary.stuckStageId,
    stalledForDays: staleSummary.stalledForDays,
  });
  return updatedRun;
}

/**
 * Restore a stale or archived PipelineRun to running status.
 *
 * @param {string} pipelineRunId
 * @returns {object} The restored PipelineRun snapshot.
 */
export function restoreRun(pipelineRunId) {
  const run = requireRun(pipelineRunId);
  if (!['stale', 'archived'].includes(run.status)) {
    throw new Error(`restoreRun: run is not restorable: ${run.status}`);
  }
  const timestamp = nowIso();
  const updatedRun = {
    ...run,
    status: 'running',
    openAdvisories: resolveStaleAdvisories(run, timestamp, 'run restored'),
    lifecycle: {
      ...run.lifecycle,
      archivedAt: null,
      lastActivityAt: timestamp,
      staleDetectedAt: null,
      staleResolvedAt: timestamp,
      restoredAt: timestamp,
      restoreCount: (run.lifecycle?.restoreCount || 0) + 1,
      terminalReason: null,
    },
  };
  writeJson(statePath(pipelineRunId), updatedRun);
  updateActiveIndex(updatedRun);
  appendLedger(pipelineRunId, 'run-restored', { fromStatus: run.status });
  return updatedRun;
}

/**
 * Reset a stage for retry: set status back to 'active', increment attempt,
 * clear completedAt and artifacts from previous attempt, and update currentStageId.
 *
 * @param {string} pipelineRunId
 * @param {string} stageId
 * @returns {object} The updated PipelineRun snapshot.
 */
export function resetStageForRetry(pipelineRunId, stageId) {
  if (!stageId || typeof stageId !== 'string') {
    throw new Error(`resetStageForRetry: invalid stageId: ${stageId}`);
  }
  const loadedRun = requireRun(pipelineRunId);
  const timestamp = nowIso();
  const { run, restored } = restoreStaleRunFields(loadedRun, timestamp, 'stage reset for retry after stale detection');
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
    status: 'active',
    startedAt: timestamp,
    completedAt: null,
    dispatchId: null,
    artifacts: [],
    attempt: (previousStage.attempt || 1) + 1,
  };
  const updatedRun = {
    ...run,
    currentStageId: stageId,
    stages: { ...run.stages, [stageId]: stage },
    lifecycle: { ...run.lifecycle, lastActivityAt: timestamp },
  };
  writeJson(statePath(pipelineRunId), updatedRun);
  updateActiveIndex(updatedRun);
  appendLedger(pipelineRunId, 'stage-reset-for-retry', { stageId, attempt: stage.attempt });
  if (restored) appendLedger(pipelineRunId, 'run-stale-restored', { reason: 'stage reset for retry after stale detection' });
  return updatedRun;
}

/**
 * Refresh PipelineRun lifecycle.lastActivityAt and active-index summary.
 *
 * @param {string} pipelineRunId
 * @returns {void}
 */
export function touch(pipelineRunId) {
  const loadedRun = requireRun(pipelineRunId);
  const timestamp = nowIso();
  const { run, restored } = restoreStaleRunFields(loadedRun, timestamp, 'run touched after stale detection');
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
  if (restored) appendLedger(pipelineRunId, 'run-stale-restored', { reason: 'run touched after stale detection' });
}

/**
 * Additive patch of top-level fields on a run (e.g. openAdvisories).
 *
 * @param {string} pipelineRunId
 * @param {object} patch - Fields to merge into the run state.
 * @returns {object} The updated PipelineRun snapshot.
 */
export function patchRun(pipelineRunId, patch) {
  const loadedRun = requireRun(pipelineRunId);
  const timestamp = nowIso();
  const mergedRun = {
    ...loadedRun,
    ...patch,
    lifecycle: {
      ...loadedRun.lifecycle,
      lastActivityAt: timestamp,
    },
  };
  const { run, restored } = restoreStaleRunFields(mergedRun, timestamp, 'run patched after stale detection');
  const updatedRun = {
    ...run,
    lifecycle: {
      ...run.lifecycle,
      lastActivityAt: timestamp,
    },
  };
  writeJson(statePath(pipelineRunId), updatedRun);
  updateActiveIndex(updatedRun);
  appendLedger(pipelineRunId, 'run-patched', { fields: Object.keys(patch) });
  if (restored) appendLedger(pipelineRunId, 'run-stale-restored', { reason: 'run patched after stale detection' });
  return updatedRun;
}
export { normalizePipelineRunId };
reconcileActivePipelineCompatibilityIndex();
