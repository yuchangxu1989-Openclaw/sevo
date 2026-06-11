import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as runStore from '../src/run-store.js';
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ACTIVE_INDEX_PATH = path.join(PROJECT_ROOT, 'data', 'active-index.json');
const ACTIVE_PIPELINES_PATH = path.join(PROJECT_ROOT, 'state', 'active-pipelines.json');

function readFileIfExists(filePath: string): string | null {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

function restoreFile(filePath: string, content: string | null) {
  if (content === null) {
    fs.rmSync(filePath, { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

describe('run-store V2 active compatibility index', () => {
  it('mirrors V2 runs into state/active-pipelines.json for the root completion hook', async () => {
    const beforeActiveIndex = readFileIfExists(ACTIVE_INDEX_PATH);
    const beforeActivePipelines = readFileIfExists(ACTIVE_PIPELINES_PATH);
    let runId: string | null = null;

    try {
      const run = runStore.createRun({
        projectSlug: 'sevo-compat-test',
        projectRoot: 'projects/sevo',
        goal: 'verify root completion hook compatibility index',
        entryType: 'test',
        stagePlan: { ordered: ['implement', 'review'], skipped: [] },
      });
      runId = run.pipelineRunId;

      let compat = readJson(ACTIVE_PIPELINES_PATH);
      expect(compat.pipelines[run.pipelineRunId]).toMatchObject({
        projectSlug: 'sevo-compat-test',
        projectRoot: 'projects/sevo',
        status: 'running',
        currentStage: 'implement',
        currentStageId: 'implement',
        source: 'v2-run-store',
      });

      runStore.advanceStage(run.pipelineRunId, 'implement', { status: 'passed', artifacts: [], dispatchId: 'compat-test' });
      compat = readJson(ACTIVE_PIPELINES_PATH);
      expect(compat.pipelines[run.pipelineRunId].currentStage).toBe('review');
      expect(compat.pipelines[run.pipelineRunId].currentStageId).toBe('review');

      runStore.closeRun(run.pipelineRunId, { status: 'completed', reason: 'compat test complete' });
      compat = readJson(ACTIVE_PIPELINES_PATH);
      expect(compat.pipelines[run.pipelineRunId]).toBeUndefined();
    } finally {
      if (runId) fs.rmSync(path.join(PROJECT_ROOT, 'data', 'pipelines', runId), { recursive: true, force: true });
      restoreFile(ACTIVE_INDEX_PATH, beforeActiveIndex);
      restoreFile(ACTIVE_PIPELINES_PATH, beforeActivePipelines);
    }
  });
});
