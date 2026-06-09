/**
 * Smoke test for prompt-injector.js buildInjection
 */
import { buildInjection } from '../src/prompt-injector.js';
import assert from 'node:assert/strict';

function makeRun(overrides = {}) {
  return {
    pipelineRunId: 'aaaabbbb-1111-2222-3333-444455556666',
    projectSlug: 'kivo',
    projectRoot: 'projects/kivo',
    goal: '实现 KIVO 知识卡片编辑器的搜索功能',
    status: 'running',
    currentStageId: 'implement',
    lifecycle: { lastActivityAt: '2026-06-09T06:30:00.000Z' },
    stagePlan: { ordered: ['spec', 'implement', 'review'], skipped: [] },
    stages: {},
    metadata: {},
    ...overrides,
  };
}

// Test 1: returns null when no active runs
{
  const result = buildInjection({}, { listActiveRuns: () => [] });
  assert.equal(result, null, 'should return null when no active runs');
}

// Test 2: returns null when deps missing
{
  const result = buildInjection({}, {});
  assert.equal(result, null, 'should return null when listActiveRuns missing');
}

// Test 3: injects discipline + status reminder for one run
{
  const runs = [makeRun()];
  const result = buildInjection({}, { listActiveRuns: () => runs });
  assert.ok(result, 'should return injection object');
  assert.ok(result.text.includes('SEVO Pipeline Discipline'), 'should contain discipline');
  assert.ok(result.text.includes('[kivo]'), 'should contain project slug');
  assert.ok(result.text.includes('implement'), 'should contain current stage');
  assert.equal(result.metadata.runCount, 1);
}

// Test 4: injects advance text when consumePendingAdvance returns data
{
  const runs = [makeRun()];
  const advance = { text: 'Start implement: write unit tests first', nextStageId: 'implement' };
  const result = buildInjection({}, {
    listActiveRuns: () => runs,
    consumePendingAdvance: () => advance,
  });
  assert.ok(result.text.includes('Start implement'), 'should contain advance text');
  assert.ok(result.text.includes('Next action:'), 'should label the action');
}

// Test 5: limits to MAX_RUNS_INJECTED (3) and respects char limit
{
  const runs = Array.from({ length: 5 }, (_, i) =>
    makeRun({
      pipelineRunId: `run-${i}xxx-1111-2222-3333-444455556666`,
      projectSlug: `proj${i}`,
      projectRoot: `projects/proj${i}`,
      lifecycle: { lastActivityAt: `2026-06-09T0${i}:00:00.000Z` },
    }),
  );
  const result = buildInjection({}, { listActiveRuns: () => runs });
  assert.ok(result, 'should return injection for many runs');
  assert.ok(result.metadata.runCount <= 3, 'should inject at most 3 runs');
  assert.ok(result.text.length <= 2000, `injection length ${result.text.length} should be <= 2000`);
}

// Test 6: route guidance includes tracked paths
{
  const runs = [makeRun({ projectRoot: 'projects/kivo' })];
  const result = buildInjection({}, { listActiveRuns: () => runs });
  assert.ok(result.text.includes('Route Guidance'), 'should contain route guidance');
  assert.ok(result.text.includes('projects/kivo'), 'should contain tracked path');
}

console.log('All prompt-injector smoke tests passed.');
