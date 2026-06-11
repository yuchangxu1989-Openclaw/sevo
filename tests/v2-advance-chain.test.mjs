import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { handleCompletion } from '../src/completion-handler.js';
import { createRun, closeRun, getRun } from '../src/run-store.js';
import { encode } from '../src/label-protocol.js';
import { buildInjection } from '../src/prompt-injector.js';

const projectRoot = resolve(new URL('..', import.meta.url).pathname);

function makeMockDeps(overrides = {}) {
  return {
    advanceDepthByRun: new Map(),
    getStageMapping(stageId) {
      return { tier: 'T1', agentId: 'cc', timeout: 600 };
    },
    ...overrides,
  };
}

function makeLabel(run, stageId, attempt = 1) {
  return encode({ projectSlug: run.projectSlug, pipelineRunId: run.pipelineRunId, stageId, attempt });
}

const run = createRun({
  projectSlug: 'v2-advance-chain-test',
  projectRoot: 'projects/test',
  goal: 'Test review-fix cycle and linear advance',
  entryType: 'create',
  stagePlan: { ordered: ['specify', 'implement', 'review', 'fix'], skipped: [] },
});

try {
  // --- Test 1: Linear advance specify→implement ---
  const deps1 = makeMockDeps();
  const r1 = handleCompletion(
    { label: makeLabel(run, 'specify'), status: 'passed', taskId: 't1' },
    deps1,
  );
  assert.ok(r1, 'specify→implement advance should be generated');
  assert.equal(r1.nextStageId, 'implement');
  assert.equal(r1.runSnapshot.currentStageId, 'implement');
  assert.match(r1.advanceText, /implement/);
  console.log('PASS: specify→implement linear advance');

  // --- Test 2: Linear advance implement→review ---
  const deps2 = makeMockDeps();
  const r2 = handleCompletion(
    { label: makeLabel(run, 'implement'), status: 'succeeded', taskId: 't2' },
    deps2,
  );
  assert.ok(r2, 'implement→review advance should be generated');
  assert.equal(r2.nextStageId, 'review');
  assert.equal(r2.runSnapshot.currentStageId, 'review');
  console.log('PASS: implement→review linear advance');

  // --- Test 3: Review repair-required advisory → continue to fix ---
  const deps3 = makeMockDeps();
  const r3 = handleCompletion(
    { label: makeLabel(run, 'review'), status: 'failed', result: { reason: 'type errors found' }, taskId: 't3' },
    deps3,
  );
  assert.ok(r3, 'review repair-required advisory should continue to fix');
  assert.equal(r3.nextStageId, 'fix');
  assert.equal(r3.runSnapshot.currentStageId, 'fix');
  assert.equal(r3.runSnapshot.stages.review.status, 'repairing');
  assert.equal(r3.nextAction.completedStageStatus, 'repairing');
  assert.match(r3.advanceText, /Next stage: fix/);
  assert.match(r3.advanceText, /Advisory:/);
  console.log('PASS: review repair-required advisory → continue to fix');

  // --- Test 4: Fix passes → pipeline completes without re-loop prompt ---
  const deps4 = makeMockDeps();
  const currentFixAttempt = getRun(run.pipelineRunId).stages.fix.attempt;
  const r4 = handleCompletion(
    { label: makeLabel(run, 'fix', currentFixAttempt), status: 'passed', taskId: 't4' },
    deps4,
  );
  assert.ok(r4, 'fix pass should complete the configured stage chain');
  assert.equal(r4.nextStageId, null);
  assert.equal(r4.runSnapshot.status, 'completed');
  assert.equal(r4.nextAction.kind, 'complete-run');
  assert.match(r4.advanceText, /completed/);
  console.log('PASS: fix passes → pipeline complete');

  // --- Test 5: Prompt injector delivers pending advance ---
  const run2 = createRun({
    projectSlug: 'v2-injector-test',
    projectRoot: 'projects/test',
    goal: 'Test prompt injection delivery',
    entryType: 'create',
    stagePlan: { ordered: ['specify', 'implement'], skipped: [] },
  });
  const pendingAdvances = new Map();
  pendingAdvances.set(run2.pipelineRunId, {
    text: 'Advance to implement stage',
    nextStageId: 'implement',
  });
  const injection = buildInjection({}, {
    listActiveRuns: () => [run2],
    consumePendingAdvance: (id) => {
      const adv = pendingAdvances.get(id) || null;
      if (adv) pendingAdvances.delete(id);
      return adv;
    },
  });
  assert.ok(injection, 'injection should be generated');
  assert.match(injection.text, /Advance to implement stage/);
  assert.ok(!injection.text.includes('SEVO_STAGE_ROUTE_HANDSHAKE'), 'no handshake marker in injection');
  console.log('PASS: prompt-injector delivers advance without handshake leakage');

  // cleanup run2
  closeRun(run2.pipelineRunId, { status: 'completed', reason: 'test cleanup' });
  rmSync(resolve(projectRoot, 'data/pipelines', run2.pipelineRunId), { recursive: true, force: true });

  console.log('\nAll v2-advance-chain tests passed.');
} finally {
  try {
    closeRun(run.pipelineRunId, { status: 'completed', reason: 'test cleanup' });
  } catch { /* already closed */ }
  rmSync(resolve(projectRoot, 'data/pipelines', run.pipelineRunId), { recursive: true, force: true });
}
