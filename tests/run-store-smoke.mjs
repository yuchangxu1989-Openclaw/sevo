import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  advanceStage,
  archiveStaleRuns,
  restoreRun,
  markStale,
  touch,
  resetStageForRetry,
  patchRun,
  closeRun,
  createRun,
  getRun,
  listActiveRuns,
} from '../src/run-store.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const run = createRun({
  projectSlug: 'sevo-run-store-smoke',
  projectRoot: 'projects/sevo',
  goal: 'Smoke test PipelineRun V2 storage',
  entryType: 'create',
  stagePlan: {
    ordered: ['spec', 'implement'],
    skipped: [],
  },
});

assert.equal(run.schemaVersion, 2);
assert.equal(run.status, 'running');
assert.equal(run.currentStageId, 'spec');
assert.equal(run.stages.spec.status, 'active');
assert.ok(existsSync(resolve(projectRoot, 'data/active-index.json')));

const loaded = getRun(run.pipelineRunId);
assert.equal(loaded.pipelineRunId, run.pipelineRunId);

const activeRuns = listActiveRuns('sevo-run-store-smoke');
assert.ok(activeRuns.some((activeRun) => activeRun.pipelineRunId === run.pipelineRunId));

const advanced = advanceStage(run.pipelineRunId, 'spec', {
  status: 'passed',
  artifacts: ['docs/design/product-requirements.md'],
  dispatchId: 'd_smoke_spec',
});

assert.equal(advanced.stages.spec.status, 'passed');
assert.equal(advanced.stages.spec.dispatchId, 'd_smoke_spec');
assert.deepEqual(advanced.stages.spec.artifacts, ['docs/design/product-requirements.md']);
assert.equal(advanced.currentStageId, 'implement');
assert.equal(advanced.stages.implement.status, 'active');


const compatActive = JSON.parse(readFileSync(resolve(projectRoot, 'state/active-pipelines.json'), 'utf8'));
assert.equal(compatActive.pipelines[run.pipelineRunId].projectSlug, 'sevo-run-store-smoke');
assert.equal(compatActive.pipelines[run.pipelineRunId].currentStage, 'implement');
assert.equal(compatActive.pipelines[run.pipelineRunId].currentStageId, 'implement');
assert.equal(compatActive.pipelines[run.pipelineRunId].source, 'v2-run-store');
closeRun(run.pipelineRunId, { status: 'completed', reason: 'smoke test completed' });

const closed = getRun(run.pipelineRunId);
assert.equal(closed.status, 'completed');
assert.equal(closed.lifecycle.terminalReason, 'smoke test completed');
assert.equal(
  listActiveRuns('sevo-run-store-smoke').some((activeRun) => activeRun.pipelineRunId === run.pipelineRunId),
  false,
);

const compatClosed = JSON.parse(readFileSync(resolve(projectRoot, 'state/active-pipelines.json'), 'utf8'));
assert.equal(compatClosed.pipelines[run.pipelineRunId], undefined);

const staleRun = createRun({
  projectSlug: 'sevo-run-store-smoke-stale',
  projectRoot: 'projects/sevo',
  goal: 'Smoke test stale PipelineRun lifecycle',
  entryType: 'create',
  stagePlan: {
    ordered: ['spec', 'implement'],
    skipped: [],
  },
});
const staleStatePath = resolve(projectRoot, 'data/pipelines', staleRun.pipelineRunId, 'state.json');
const staleState = getRun(staleRun.pipelineRunId);
staleState.lifecycle.lastActivityAt = '2026-06-01T00:00:00.000Z';
writeFileSync(staleStatePath, `${JSON.stringify(staleState, null, 2)}\n`, 'utf8');

const firstScan = archiveStaleRuns({
  projectSlug: 'sevo-run-store-smoke-stale',
  staleAfterDays: 7,
  archiveAfterStaleDays: 7,
  now: '2026-06-11T00:00:00.000Z',
});
assert.equal(firstScan.length, 0);
assert.ok(firstScan.staleRuns.some((item) => item.pipelineRunId === staleRun.pipelineRunId));
assert.equal(firstScan.scanRecord.checkedCount >= 1, true);
assert.equal(firstScan.scanRecord.staleCount >= 1, true);
assert.equal(firstScan.scanRecord.archivedCount, 0);
const markedStaleRun = getRun(staleRun.pipelineRunId);
assert.equal(markedStaleRun.status, 'stale');
assert.equal(markedStaleRun.lifecycle.staleDetectedAt, '2026-06-11T00:00:00.000Z');
assert.equal(markedStaleRun.lifecycle.staleSummary.stuckStageId, 'spec');
assert.equal(markedStaleRun.lifecycle.staleSummary.thresholds.staleAfterDays, 7);
assert.ok(markedStaleRun.openAdvisories.some((advisory) => advisory.type === 'stale-lifecycle'));
assert.equal(
  listActiveRuns('sevo-run-store-smoke-stale').some((activeRun) => activeRun.pipelineRunId === staleRun.pipelineRunId),
  true,
);

const restoredByAdvance = advanceStage(staleRun.pipelineRunId, 'spec', {
  status: 'passed',
  artifacts: ['reports/stale-restored.md'],
  dispatchId: 'd_stale_restore',
});
assert.equal(restoredByAdvance.status, 'running');
assert.equal(restoredByAdvance.lifecycle.staleDetectedAt, null);
assert.equal(restoredByAdvance.stages.spec.status, 'passed');
assert.ok(restoredByAdvance.openAdvisories.some((advisory) => advisory.type === 'stale-lifecycle' && advisory.resolvedAt));
const normalizedBlocked = advanceStage(staleRun.pipelineRunId, 'implement', {
  status: 'blocked',
  artifacts: [],
  dispatchId: 'd_blocked_compat',
});
assert.equal(normalizedBlocked.stages.implement.status, 'repairing');

const touchRun = createRun({
  projectSlug: 'sevo-run-store-smoke-touch',
  projectRoot: 'projects/sevo',
  goal: 'Smoke test stale touch restore',
  entryType: 'create',
  stagePlan: { ordered: ['spec', 'implement'], skipped: [] },
});
const touchStatePath = resolve(projectRoot, 'data/pipelines', touchRun.pipelineRunId, 'state.json');
const touchState = getRun(touchRun.pipelineRunId);
touchState.lifecycle.lastActivityAt = '2026-06-01T00:00:00.000Z';
writeFileSync(touchStatePath, `${JSON.stringify(touchState, null, 2)}\n`, 'utf8');
archiveStaleRuns({ projectSlug: 'sevo-run-store-smoke-touch', staleAfterDays: 7, archiveAfterStaleDays: 7, now: '2026-06-11T00:00:00.000Z' });
touch(touchRun.pipelineRunId);
const touchedRun = getRun(touchRun.pipelineRunId);
assert.equal(touchedRun.status, 'running');
assert.equal(touchedRun.lifecycle.staleDetectedAt, null);
assert.ok(touchedRun.openAdvisories.some((advisory) => advisory.type === 'stale-lifecycle' && advisory.resolvedAt));

const retryRun = createRun({
  projectSlug: 'sevo-run-store-smoke-retry',
  projectRoot: 'projects/sevo',
  goal: 'Smoke test stale retry restore',
  entryType: 'create',
  stagePlan: { ordered: ['spec', 'implement'], skipped: [] },
});
const retryStatePath = resolve(projectRoot, 'data/pipelines', retryRun.pipelineRunId, 'state.json');
const retryState = getRun(retryRun.pipelineRunId);
retryState.lifecycle.lastActivityAt = '2026-06-01T00:00:00.000Z';
writeFileSync(retryStatePath, `${JSON.stringify(retryState, null, 2)}\n`, 'utf8');
archiveStaleRuns({ projectSlug: 'sevo-run-store-smoke-retry', staleAfterDays: 7, archiveAfterStaleDays: 7, now: '2026-06-11T00:00:00.000Z' });
const retriedRun = resetStageForRetry(retryRun.pipelineRunId, 'spec');
assert.equal(retriedRun.status, 'running');
assert.equal(retriedRun.lifecycle.staleDetectedAt, null);
assert.equal(retriedRun.stages.spec.status, 'active');
assert.ok(retriedRun.openAdvisories.some((advisory) => advisory.type === 'stale-lifecycle' && advisory.resolvedAt));

const patchRunCase = createRun({
  projectSlug: 'sevo-run-store-smoke-patch',
  projectRoot: 'projects/sevo',
  goal: 'Smoke test stale patch restore',
  entryType: 'create',
  stagePlan: { ordered: ['spec', 'implement'], skipped: [] },
});
const patchStatePath = resolve(projectRoot, 'data/pipelines', patchRunCase.pipelineRunId, 'state.json');
const patchState = getRun(patchRunCase.pipelineRunId);
patchState.lifecycle.lastActivityAt = '2026-06-01T00:00:00.000Z';
writeFileSync(patchStatePath, `${JSON.stringify(patchState, null, 2)}\n`, 'utf8');
archiveStaleRuns({ projectSlug: 'sevo-run-store-smoke-patch', staleAfterDays: 7, archiveAfterStaleDays: 7, now: '2026-06-11T00:00:00.000Z' });
const stalePatchSnapshot = getRun(patchRunCase.pipelineRunId);
const patchedRun = patchRun(patchRunCase.pipelineRunId, {
  openAdvisories: [
    ...stalePatchSnapshot.openAdvisories,
    { id: 'manual-advisory', runId: patchRunCase.pipelineRunId, stageId: 'spec', type: 'manual', severity: 'info', message: 'manual', evidence: [], createdAt: '2026-06-11T00:00:01.000Z', resolvedAt: null },
  ],
});
assert.equal(patchedRun.status, 'running');
assert.equal(patchedRun.lifecycle.staleDetectedAt, null);
assert.ok(patchedRun.openAdvisories.some((advisory) => advisory.type === 'stale-lifecycle' && advisory.resolvedAt));
assert.ok(patchedRun.openAdvisories.some((advisory) => advisory.id === 'manual-advisory' && advisory.resolvedAt === null));
const directMarkRun = createRun({
  projectSlug: 'sevo-run-store-smoke-direct-mark',
  projectRoot: 'projects/sevo',
  goal: 'Smoke test direct markStale threshold normalization',
  entryType: 'create',
  stagePlan: { ordered: ['spec', 'implement'], skipped: [] },
});
const directMarked = markStale(directMarkRun.pipelineRunId, {
  now: '2026-06-11T00:00:00.000Z',
  staleAfterDays: 'bad',
  archiveAfterStaleDays: -1,
});
assert.equal(directMarked.lifecycle.staleSummary.thresholds.staleAfterDays, 7);
assert.equal(directMarked.lifecycle.staleSummary.thresholds.archiveAfterStaleDays, 7);

const archiveRun = createRun({
  projectSlug: 'sevo-run-store-smoke-archive',
  projectRoot: 'projects/sevo',
  goal: 'Smoke test stale PipelineRun archive threshold',
  entryType: 'create',
  stagePlan: {
    ordered: ['spec', 'implement'],
    skipped: [],
  },
});
const archiveStatePath = resolve(projectRoot, 'data/pipelines', archiveRun.pipelineRunId, 'state.json');
const archiveState = getRun(archiveRun.pipelineRunId);
archiveState.lifecycle.lastActivityAt = '2026-06-01T00:00:00.000Z';
writeFileSync(archiveStatePath, `${JSON.stringify(archiveState, null, 2)}\n`, 'utf8');

const staleScan = archiveStaleRuns({
  projectSlug: 'sevo-run-store-smoke-archive',
  staleAfterDays: 7,
  archiveAfterStaleDays: 7,
  now: '2026-06-11T00:00:00.000Z',
});
assert.equal(staleScan.length, 0);
assert.ok(staleScan.staleRuns.some((item) => item.pipelineRunId === archiveRun.pipelineRunId));

const archived = archiveStaleRuns({
  projectSlug: 'sevo-run-store-smoke-archive',
  staleAfterDays: 7,
  archiveAfterStaleDays: 7,
  now: '2026-06-19T00:00:00.000Z',
});
assert.ok(archived.some((item) => item.pipelineRunId === archiveRun.pipelineRunId));
assert.equal(archived.scanRecord.archivedCount >= 1, true);
const archivedRun = getRun(archiveRun.pipelineRunId);
assert.equal(archivedRun.status, 'archived');
assert.equal(archivedRun.lifecycle.archivedAt, '2026-06-19T00:00:00.000Z');
assert.equal(archivedRun.lifecycle.lastActivityAt, '2026-06-19T00:00:00.000Z');
assert.equal(
  listActiveRuns('sevo-run-store-smoke-archive').some((activeRun) => activeRun.pipelineRunId === archiveRun.pipelineRunId),
  false,
);

const restoredArchivedRun = restoreRun(archiveRun.pipelineRunId);
assert.equal(restoredArchivedRun.status, 'running');
assert.equal(restoredArchivedRun.lifecycle.archivedAt, null);
assert.equal(restoredArchivedRun.lifecycle.staleDetectedAt, null);
assert.equal(restoredArchivedRun.lifecycle.restoreCount, 1);
assert.equal(
  listActiveRuns('sevo-run-store-smoke-archive').some((activeRun) => activeRun.pipelineRunId === archiveRun.pipelineRunId),
  true,
);

const compatRestored = JSON.parse(readFileSync(resolve(projectRoot, 'state/active-pipelines.json'), 'utf8'));
assert.equal(compatRestored.pipelines[archiveRun.pipelineRunId].status, 'running');
closeRun(staleRun.pipelineRunId, { status: 'cancelled', reason: 'smoke test cleanup' });
closeRun(archiveRun.pipelineRunId, { status: 'cancelled', reason: 'smoke test cleanup' });
closeRun(touchRun.pipelineRunId, { status: 'cancelled', reason: 'smoke test cleanup' });
closeRun(retryRun.pipelineRunId, { status: 'cancelled', reason: 'smoke test cleanup' });
closeRun(patchRunCase.pipelineRunId, { status: 'cancelled', reason: 'smoke test cleanup' });
closeRun(directMarkRun.pipelineRunId, { status: 'cancelled', reason: 'smoke test cleanup' });

rmSync(resolve(projectRoot, 'data/pipelines', run.pipelineRunId), { recursive: true, force: true });
rmSync(resolve(projectRoot, 'data/pipelines', staleRun.pipelineRunId), { recursive: true, force: true });
rmSync(resolve(projectRoot, 'data/pipelines', touchRun.pipelineRunId), { recursive: true, force: true });
rmSync(resolve(projectRoot, 'data/pipelines', retryRun.pipelineRunId), { recursive: true, force: true });
rmSync(resolve(projectRoot, 'data/pipelines', patchRunCase.pipelineRunId), { recursive: true, force: true });
rmSync(resolve(projectRoot, 'data/pipelines', archiveRun.pipelineRunId), { recursive: true, force: true });
rmSync(resolve(projectRoot, 'data/pipelines', directMarkRun.pipelineRunId), { recursive: true, force: true });

console.log(`run-store smoke passed: ${run.pipelineRunId}`);
