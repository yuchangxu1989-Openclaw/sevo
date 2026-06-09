import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { handleCompletion } from '../src/completion-handler.js';
import { createRun, closeRun, getRun } from '../src/run-store.js';
import { encode } from '../src/label-protocol.js';

const projectRoot = resolve(new URL('..', import.meta.url).pathname);
const advanceDepthByRun = new Map();

const run = createRun({
  projectSlug: 'sevo-completion-handler-smoke',
  projectRoot: 'projects/sevo',
  goal: 'Smoke test V2 completion handler advance calculation',
  entryType: 'create',
  stagePlan: {
    ordered: ['spec', 'implement'],
    skipped: [],
  },
});

try {
  const label = encode({
    projectSlug: run.projectSlug,
    pipelineRunId: run.pipelineRunId,
    stageId: 'spec',
    attempt: 1,
  });
  const nextLabel = encode({
    projectSlug: run.projectSlug,
    pipelineRunId: run.pipelineRunId,
    stageId: 'implement',
    attempt: 1,
  });

  const result = handleCompletion(
    {
      label,
      status: 'succeeded',
      taskId: 'completion-handler-smoke-task',
      artifacts: ['docs/design/product-requirements.md'],
    },
    {
      advanceDepthByRun,
      getStageMapping(stageId) {
        assert.equal(stageId, 'implement');
        return { tier: 'T1', agentId: 'codex', timeout: 1200 };
      },
    },
  );

  assert.ok(result, 'handleCompletion should return an advance result');
  assert.equal(result.nextStageId, 'implement');
  assert.equal(result.runSnapshot.stages.spec.status, 'passed');
  assert.equal(result.runSnapshot.stages.implement.status, 'active');
  assert.equal(result.runSnapshot.stages.spec.dispatchId, 'completion-handler-smoke-task');
  assert.deepEqual(result.runSnapshot.stages.spec.artifacts, ['docs/design/product-requirements.md']);
  assert.match(result.advanceText, /Recommended agentId: codex/);
  assert.match(result.advanceText, /timeout: 1200s/);
  assert.match(result.advanceText, new RegExp(nextLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(result.advanceText, /task-mapper\.buildTaskPrompt\("implement"/);
  assert.equal(advanceDepthByRun.get(run.pipelineRunId), 1);

  const persisted = getRun(run.pipelineRunId);
  assert.equal(persisted.currentStageId, 'implement');
  assert.equal(persisted.stages.spec.status, 'passed');

  console.log(`completion-handler smoke passed: ${run.pipelineRunId}`);
} finally {
  try {
    closeRun(run.pipelineRunId, { status: 'completed', reason: 'completion-handler smoke cleanup' });
  } catch {
    // Best-effort cleanup; the pipeline directory is removed below.
  }
  rmSync(resolve(projectRoot, 'data/pipelines', run.pipelineRunId), { recursive: true, force: true });
}
