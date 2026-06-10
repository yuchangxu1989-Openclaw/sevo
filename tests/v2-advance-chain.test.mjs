import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { handleCompletion } from '../src/completion-handler.js';
import { createRun, closeRun, getRun, resetStageForRetry } from '../src/run-store.js';
import { encode } from '../src/label-protocol.js';
import { buildInjection } from '../src/prompt-injector.js';

const projectRoot = resolve(new URL('..', import.meta.url).pathname);

function makeMockDeps(overrides = {}) {
  return {
    advanceDepthByRun: new Map(),
    getStageMapping(stageId) {
      return { tier: 'T1', agentId: 'cc', timeout: 600 };
    },
    renderAdvancePromptTemplate(name, values) {
      return `[ADVANCE] label=${values.label} agent=${values.agentLine} timeout=${values.timeout}s\n${values.taskDescription}`;
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

  // --- Test 3: Review fails → auto-advance to fix (cycle) ---
  const deps3 = makeMockDeps();
  const r3 = handleCompletion(
    { label: makeLabel(run, 'review'), status: 'failed', result: { reason: 'type errors found' }, taskId: 't3' },
    deps3,
  );
  assert.ok(r3, 'review failure should trigger fix cycle advance');
  assert.equal(r3.nextStageId, 'fix');
  assert.equal(r3.runSnapshot.currentStageId, 'fix');
  assert.ok(r3.runSnapshot.stages.fix.attempt >= 1, 'fix attempt should be set');
  assert.match(r3.advanceText, /review→fix cycle/);
  assert.match(r3.advanceText, /type errors found/);
  console.log('PASS: review fails → auto-advance to fix');

  // --- Test 4: Fix passes → loop back to review (cycle) ---
  const deps4 = makeMockDeps();
  const currentFixAttempt = getRun(run.pipelineRunId).stages.fix.attempt;
  const r4 = handleCompletion(
    { label: makeLabel(run, 'fix', currentFixAttempt), status: 'passed', taskId: 't4' },
    deps4,
  );
  assert.ok(r4, 'fix pass should trigger review re-loop');
  assert.equal(r4.nextStageId, 'review');
  assert.equal(r4.runSnapshot.currentStageId, 'review');
  const reviewAttempt = r4.runSnapshot.stages.review.attempt;
  assert.ok(reviewAttempt >= 2, `review attempt should be >=2, got ${reviewAttempt}`);
  assert.match(r4.advanceText, /fix→review cycle/);
  console.log('PASS: fix passes → loop back to review');

  // --- Test 5: Review passes → linear advance (pipeline complete) ---
  const deps5 = makeMockDeps();
  const currentReviewAttempt = getRun(run.pipelineRunId).stages.review.attempt;
  const r5 = handleCompletion(
    { label: makeLabel(run, 'review', currentReviewAttempt), status: 'passed', taskId: 't5' },
    deps5,
  );
  assert.ok(r5, 'review pass should produce completion or next-stage advance');
  assert.equal(r5.runSnapshot.stages.review.status, 'passed');
  assert.match(r5.advanceText, /completed all configured stages/);
  console.log('PASS: review passes → pipeline complete');

  // --- Test 6: Prompt injector delivers pending advance ---
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