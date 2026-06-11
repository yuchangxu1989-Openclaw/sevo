import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { handleCompletion } from '../src/completion-handler.js';
import { classifyLabel, LABEL_CLASS } from '../src/stage-dispatch-contract.js';
import { decode } from '../src/label-protocol.js';

const FULL_RUN_ID = '540dc272-6d9d-4cb7-a643-3b4029442489';
const LABEL = 'sevo:sevo:540dc272:implement:1';

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeRun(root: string, run: any) {
  writeJson(path.join(root, 'pipelines', run.pipelineRunId, 'state.json'), run);
}

function writeActiveIndex(root: string, runs: any[]) {
  writeJson(path.join(root, 'active-index.json'), {
    pipelines: Object.fromEntries(runs.map((run) => [run.pipelineRunId, {
      projectSlug: run.projectSlug,
      status: run.status,
      currentStageId: run.currentStageId,
    }])),
  });
}

function makeDiskRunStore(root: string, run: any) {
  const statePath = path.join(root, 'pipelines', run.pipelineRunId, 'state.json');
  writeRun(root, run);
  writeActiveIndex(root, [run]);

  return {
    getRun(pipelineRunId: string) {
      const candidate = path.join(root, 'pipelines', pipelineRunId, 'state.json');
      if (!fs.existsSync(candidate)) return null;
      return JSON.parse(fs.readFileSync(candidate, 'utf8'));
    },
    listActiveRuns(projectSlug?: string) {
      const indexPath = path.join(root, 'active-index.json');
      if (!fs.existsSync(indexPath)) return [];
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      return Object.entries(index.pipelines || {})
        .filter(([, summary]: [string, any]) => !projectSlug || summary.projectSlug === projectSlug)
        .map(([pipelineRunId]) => this.getRun(pipelineRunId))
        .filter((candidate) => candidate && candidate.status === 'running');
    },
    advanceStage(pipelineRunId: string, stageId: string, update: any) {
      const current = this.getRun(pipelineRunId);
      if (!current) throw new Error(`missing run ${pipelineRunId}`);
      const timestamp = '2026-06-10T16:00:00.000Z';
      const completedStage = {
        ...current.stages[stageId],
        status: update.status,
        completedAt: timestamp,
        dispatchId: update.dispatchId ?? current.stages[stageId]?.dispatchId ?? null,
        artifacts: update.artifacts || [],
      };
      const nextStageId = current.stagePlan.ordered
        .slice(current.stagePlan.ordered.indexOf(stageId) + 1)
        .find((candidate: string) => !['passed', 'failed', 'blocked', 'skipped'].includes(current.stages[candidate]?.status));
      const stages = {
        ...current.stages,
        [stageId]: completedStage,
        ...(nextStageId ? {
          [nextStageId]: {
            ...current.stages[nextStageId],
            status: 'active',
            startedAt: timestamp,
          },
        } : {}),
      };
      const updated = {
        ...current,
        currentStageId: nextStageId || current.currentStageId,
        stages,
        lifecycle: { ...current.lifecycle, lastActivityAt: timestamp },
      };
      writeJson(statePath, updated);
      writeActiveIndex(root, [updated]);
      return updated;
    },
  };
}

function makeRun(overrides: any = {}) {
  return {
    schemaVersion: 2,
    pipelineRunId: FULL_RUN_ID,
    projectSlug: 'sevo',
    projectRoot: 'projects/sevo',
    goal: 'test canonical completion lookup',
    status: 'running',
    entryType: 'auto-dispatch',
    lifecycle: {
      createdAt: '2026-06-10T15:48:40.044Z',
      startedAt: '2026-06-10T15:48:40.044Z',
      completedAt: null,
      cancelledAt: null,
      lastActivityAt: '2026-06-10T15:48:40.044Z',
      staleDetectedAt: null,
      terminalReason: null,
    },
    stagePlan: { ordered: ['implement', 'review'], skipped: [] },
    currentStageId: 'implement',
    stages: {
      implement: {
        status: 'active',
        startedAt: '2026-06-10T15:48:40.044Z',
        completedAt: null,
        dispatchId: null,
        artifacts: [],
        attempt: 1,
      },
      review: {
        status: 'pending',
        startedAt: null,
        completedAt: null,
        dispatchId: null,
        artifacts: [],
        attempt: 1,
      },
    },
    metadata: { maintenanceRun: true },
    ...overrides,
  };
}

describe('completion handler canonical disk run integration', () => {
  it('advances exact short-run canonical label to review from the matching active-index run', () => {
    expect(decode(LABEL)).toEqual({
      projectSlug: 'sevo',
      pipelineRunId: '540dc272',
      pipelineRunIdShort: '540dc272',
      stageId: 'implement',
      attempt: 1,
    });
    expect(classifyLabel(LABEL).class).toBe(LABEL_CLASS.CANONICAL);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-completion-disk-'));
    try {
      const result = handleCompletion(
        { label: LABEL, status: 'passed', taskId: 'completion-disk-test', codeChanges: true, testRun: 'passed' },
        {
          runStore: makeDiskRunStore(root, makeRun()),
          advanceDepthByRun: new Map(),
          renderAdvancePromptTemplate(_name: string, values: any) {
            return `advance ${values.label}`;
          },
        },
      );

      expect(result?.nextStageId).toBe('review');
      expect(result?.runSnapshot.pipelineRunId).toBe(FULL_RUN_ID);
      expect(result?.runSnapshot.currentStageId).toBe('review');
      expect(result?.runSnapshot.stages.implement.status).toBe('passed');
      expect(result?.runSnapshot.stages.review.status).toBe('active');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('logs canonical active-index lookup counts and run ids before matching by short run id', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-completion-disk-'));
    try {
      const logs: Array<{ level: string; message: string; meta: any }> = [];
      const logger = {
        debug: (message: string, meta: any) => logs.push({ level: 'debug', message, meta }),
        info: (message: string, meta: any) => logs.push({ level: 'info', message, meta }),
        warn: (message: string, meta: any) => logs.push({ level: 'warn', message, meta }),
        error: (message: string, meta: any) => logs.push({ level: 'error', message, meta }),
      };

      const result = handleCompletion(
        { label: LABEL, status: 'passed', taskId: 'completion-disk-test', codeChanges: true, testRun: 'passed' },
        {
          runStore: makeDiskRunStore(root, makeRun()),
          logger,
          advanceDepthByRun: new Map(),
          renderAdvancePromptTemplate(_name: string, values: any) {
            return `advance ${values.label}`;
          },
        },
      );

      expect(result?.runSnapshot.pipelineRunId).toBe(FULL_RUN_ID);
      const lookup = logs.find((entry) => entry.message === 'findRunFromDecodedLabel: canonical lookup');
      expect(lookup?.meta).toMatchObject({
        decodedProjectSlug: 'sevo',
        decodedPipelineRunId: '540dc272',
        pipelineRunIdShort: '540dc272',
        scopedActiveCount: 1,
        scopedMatchCount: 1,
        scopedMatchRunIds: [FULL_RUN_ID],
      });
      expect(lookup?.meta.scopedRuns).toEqual([
        expect.objectContaining({
          pipelineRunId: FULL_RUN_ID,
          projectSlug: 'sevo',
          currentStageId: 'implement',
          status: 'running',
        }),
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
