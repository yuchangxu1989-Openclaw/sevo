import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  advanceStage,
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

closeRun(run.pipelineRunId, { status: 'completed', reason: 'smoke test completed' });

const closed = getRun(run.pipelineRunId);
assert.equal(closed.status, 'completed');
assert.equal(closed.lifecycle.terminalReason, 'smoke test completed');
assert.equal(
  listActiveRuns('sevo-run-store-smoke').some((activeRun) => activeRun.pipelineRunId === run.pipelineRunId),
  false,
);

rmSync(resolve(projectRoot, 'data/pipelines', run.pipelineRunId), { recursive: true, force: true });

console.log(`run-store smoke passed: ${run.pipelineRunId}`);
