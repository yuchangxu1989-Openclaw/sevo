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

// Test 1: returns discipline text when no active runs
{
  const result = buildInjection({}, { listActiveRuns: () => [] });
  assert.ok(result, 'should return discipline injection when no active runs');
  assert.ok(result.text.includes('SEVO 研发流水线纪律'), 'should contain discipline');
  assert.equal(result.metadata.runCount, 0);
}

// Test 2: returns discipline text when deps missing
{
  const result = buildInjection({}, {});
  assert.ok(result, 'should return discipline injection when listActiveRuns missing');
  assert.ok(result.text.includes('SEVO 研发流水线纪律'), 'should contain discipline');
}

// Test 3: injects discipline + status reminder for one run
{
  const runs = [makeRun()];
  const result = buildInjection({}, { listActiveRuns: () => runs });
  assert.ok(result, 'should return injection object');
  assert.ok(result.text.includes('SEVO 研发流水线纪律'), 'should contain discipline');
  assert.ok(result.text.includes('[kivo]'), 'should contain project slug');
  assert.ok(result.text.includes('implement'), 'should contain current stage');
  assert.equal(result.metadata.runCount, 1);
}

// Test 4: repeatedly injects pending advance without consuming it
{
  const runs = [makeRun({
    nextAction: {
      nextStageId: 'implement-review-gate',
      dispatch: {
        label: 'sevo:kivo:aaaabbbb:implement-review-gate:1',
        tier: 'audit',
        timeout: 1200,
        attempt: 1,
      },
    },
  })];
  let readCount = 0;
  const advance = { text: 'Dispatch implement-review-gate now', nextStageId: 'implement-review-gate', nextAction: runs[0].nextAction };
  const deps = {
    listActiveRuns: () => runs,
    getPendingAdvance: () => {
      readCount++;
      return advance;
    },
  };
  const first = buildInjection({}, deps);
  const second = buildInjection({}, deps);
  assert.ok(first.text.includes('## SEVO 强制阶段推进指令'), 'should start advance with mandatory action instruction');
  assert.ok(first.text.includes('你必须在本轮执行以下阶段推进动作'), 'should explicitly force this turn');
  assert.ok(first.text.includes('下一阶段: implement-review-gate'), 'should contain next stage');
  assert.ok(first.text.includes('派发角色/agent: audit'), 'should contain role/agent guidance');
  assert.ok(first.text.includes('建议 label: sevo:kivo:aaaabbbb:implement-review-gate:1'), 'should contain suggested label');
  assert.ok(second.text.includes('Dispatch implement-review-gate now'), 'should keep injecting until spawn consumes pending advance');
  assert.equal(readCount, 2, 'pending advance should be read every prompt build without clearing');
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

// Test 6: pending advances are prioritized ahead of newer non-pending runs
{
  const runs = Array.from({ length: 4 }, (_, i) =>
    makeRun({
      pipelineRunId: `run-${i}xxx-1111-2222-3333-444455556666`,
      projectSlug: `proj${i}`,
      projectRoot: `projects/proj${i}`,
      lifecycle: { lastActivityAt: `2026-06-09T0${i}:00:00.000Z` },
    }),
  );
  const pendingRun = runs[0];
  const result = buildInjection({}, {
    listActiveRuns: () => runs,
    getPendingAdvance: (id) => id === pendingRun.pipelineRunId
      ? { text: 'PENDING-RUN-0 must advance', nextStageId: 'review' }
      : null,
  });
  assert.ok(result.text.startsWith('## SEVO 强制阶段推进指令'), 'mandatory advance should be first when pending exists');
  assert.ok(result.text.includes('PENDING-RUN-0 must advance'), 'old pending run should not be starved by newer active runs');
}

{
  const runs = [makeRun({ projectRoot: 'projects/kivo' })];
  const result = buildInjection({}, { listActiveRuns: () => runs });
  assert.ok(result.text.includes('Route Guidance'), 'should contain route guidance');
  assert.ok(result.text.includes('projects/kivo'), 'should contain tracked path');
}

console.log('All prompt-injector smoke tests passed.');
