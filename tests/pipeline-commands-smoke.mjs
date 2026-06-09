/**
 * Smoke test for pipeline-commands module.
 * Exercises: create → status → skip → cancel chain + dedup + retry + diagnose.
 */

import { handleCommand } from '../src/pipeline-commands.js';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const STAGE_PLAN = { ordered: ['spec', 'implement', 'review', 'deploy'], skipped: [] };

function createMockRunStore() {
  const runs = new Map();

  return {
    createRun({ projectSlug, projectRoot, goal, entryType, stagePlan }) {
      const pipelineRunId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timestamp = new Date().toISOString();
      const stages = Object.fromEntries(
        stagePlan.ordered.map((id, i) => [
          id,
          {
            status: i === 0 ? 'active' : 'pending',
            startedAt: i === 0 ? timestamp : null,
            completedAt: null,
            dispatchId: null,
            artifacts: [],
            attempt: 1,
          },
        ]),
      );
      const run = {
        schemaVersion: 2,
        pipelineRunId,
        projectSlug,
        projectRoot,
        goal,
        scopeFingerprint: `sha256:${createHash('sha256').update(goal || '').digest('hex')}`,
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
        stagePlan: { ordered: [...stagePlan.ordered], skipped: [...(stagePlan.skipped || [])] },
        currentStageId: stagePlan.ordered[0],
        stages,
      };
      runs.set(pipelineRunId, run);
      return run;
    },
    getRun(id) {
      return runs.get(id) || null;
    },

    listActiveRuns(projectSlug) {
      return [...runs.values()].filter(
        (r) => r.status === 'running' && (!projectSlug || r.projectSlug === projectSlug),
      );
    },

    advanceStage(pipelineRunId, stageId, { status }) {
      const run = runs.get(pipelineRunId);
      if (!run) throw new Error(`Run not found: ${pipelineRunId}`);
      const updatedStages = { ...run.stages };
      updatedStages[stageId] = { ...updatedStages[stageId], status };
      if (status === 'skipped' || status === 'passed') {
        const idx = run.stagePlan.ordered.indexOf(stageId);
        const nextId = run.stagePlan.ordered[idx + 1];
        if (nextId && updatedStages[nextId]?.status === 'pending') {
          updatedStages[nextId] = { ...updatedStages[nextId], status: 'active' };
          run.currentStageId = nextId;
        }
      }
      if (status === 'active') {
        run.currentStageId = stageId;
      }
      run.stages = updatedStages;
      return run;
    },

    closeRun(pipelineRunId, { status, reason }) {
      const run = runs.get(pipelineRunId);
      if (!run) throw new Error(`Run not found: ${pipelineRunId}`);
      run.status = status;
      run.lifecycle.terminalReason = reason || null;
    },
  };
}

// --- Tests ---

function testCreateAndStatus() {
  const store = createMockRunStore();
  const deps = { runStore: store };

  const result = handleCommand('create', {
    projectSlug: 'kivo',
    projectRoot: 'projects/kivo',
    goal: 'implement card editor',
    entryType: 'create',
    stagePlan: STAGE_PLAN,
  }, deps);

  assert.ok(result.startsWith('Created run'), `create should succeed: ${result}`);
  assert.ok(result.includes('kivo'), 'should mention project');

  const statusResult = handleCommand('status', { projectSlug: 'kivo' }, deps);
  assert.ok(statusResult.includes('kivo'), `status should list the run: ${statusResult}`);
  assert.ok(statusResult.includes('running'), 'should show running status');

  console.log('PASS: testCreateAndStatus');
}

function testDedup() {
  const store = createMockRunStore();
  const deps = { runStore: store };
  const args = {
    projectSlug: 'kivo',
    projectRoot: 'projects/kivo',
    goal: 'same goal twice',
    entryType: 'create',
    stagePlan: STAGE_PLAN,
  };

  const first = handleCommand('create', args, deps);
  assert.ok(first.startsWith('Created run'), `first create should succeed: ${first}`);

  const second = handleCommand('create', args, deps);
  assert.ok(second.startsWith('Rejected'), `second create should be rejected: ${second}`);

  console.log('PASS: testDedup');
}

function testSkipAndCancel() {
  const store = createMockRunStore();
  const deps = { runStore: store };

  handleCommand('create', {
    projectSlug: 'kivo',
    projectRoot: 'projects/kivo',
    goal: 'test skip cancel',
    entryType: 'create',
    stagePlan: STAGE_PLAN,
  }, deps);

  const runs = store.listActiveRuns('kivo');
  const runId = runs[0].pipelineRunId;

  const skipResult = handleCommand('skip', { pipelineRunId: runId }, deps);
  assert.ok(skipResult.includes('Skipped'), `skip should succeed: ${skipResult}`);
  assert.ok(skipResult.includes('spec'), 'should skip spec stage');

  const cancelResult = handleCommand('cancel', { pipelineRunId: runId }, deps);
  assert.ok(cancelResult.includes('Cancelled'), `cancel should succeed: ${cancelResult}`);

  console.log('PASS: testSkipAndCancel');
}

function testRetry() {
  const store = createMockRunStore();
  const deps = { runStore: store };

  handleCommand('create', {
    projectSlug: 'kivo',
    projectRoot: 'projects/kivo',
    goal: 'test retry',
    entryType: 'create',
    stagePlan: STAGE_PLAN,
  }, deps);

  const runs = store.listActiveRuns('kivo');
  const runId = runs[0].pipelineRunId;
  runs[0].stages.spec.status = 'failed';

  const retryResult = handleCommand('retry', { pipelineRunId: runId, stageId: 'spec' }, deps);
  assert.ok(retryResult.includes('Retrying'), `retry should succeed: ${retryResult}`);

  const retryNonFailed = handleCommand('retry', { pipelineRunId: runId, stageId: 'implement' }, deps);
  assert.ok(retryNonFailed.includes('Error'), `retry non-failed should error: ${retryNonFailed}`);

  console.log('PASS: testRetry');
}

function testDiagnose() {
  const store = createMockRunStore();
  const deps = { runStore: store };

  handleCommand('create', {
    projectSlug: 'kivo',
    projectRoot: 'projects/kivo',
    goal: 'test diagnose',
    entryType: 'create',
    stagePlan: STAGE_PLAN,
  }, deps);

  const runs = store.listActiveRuns('kivo');
  const runId = runs[0].pipelineRunId;

  const healthyResult = handleCommand('diagnose', { pipelineRunId: runId }, deps);
  assert.ok(healthyResult.includes('healthy'), `should be healthy: ${healthyResult}`);

  runs[0].lifecycle.lastActivityAt = '2020-01-01T00:00:00.000Z';
  const staleResult = handleCommand('diagnose', { pipelineRunId: runId }, deps);
  assert.ok(staleResult.includes('STALE'), `should detect stale: ${staleResult}`);

  console.log('PASS: testDiagnose');
}

function testUnknownCommand() {
  const store = createMockRunStore();
  const deps = { runStore: store };
  const result = handleCommand('nope', {}, deps);
  assert.ok(result.includes('unknown command'), `should reject unknown: ${result}`);
  console.log('PASS: testUnknownCommand');
}

// --- Run all ---
testCreateAndStatus();
testDedup();
testSkipAndCancel();
testRetry();
testDiagnose();
testUnknownCommand();
console.log('\nAll pipeline-commands smoke tests passed.');
