/**
 * Integration test: dispatch creates run → completion event → handler finds run → returns nextStageId.
 *
 * Validates that when V2 is active, the completion-handler correctly:
 * 1. Finds an active run by canonical label short-id
 * 2. Advances from implement → review
 * 3. Returns the correct nextStageId and updated run snapshot
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { handleCompletion } from '../src/completion-handler.js';
import { buildDispatchContract } from '../src/stage-dispatch-contract.js';

const PROJECT_SLUG = 'agentos-site';
const PIPELINE_RUN_ID = 'e2e-adv-7f3a9b01-1234-5678-abcd-000000000001';

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function makeDiskRunStore(root: string, runs: any[]) {
  for (const run of runs) {
    writeJson(path.join(root, 'pipelines', run.pipelineRunId, 'state.json'), run);
  }
  writeJson(path.join(root, 'active-index.json'), {
    pipelines: Object.fromEntries(runs.map((r) => [r.pipelineRunId, {
      projectSlug: r.projectSlug,
      status: r.status,
      currentStageId: r.currentStageId,
    }])),
  });

  return {
    getRun(pipelineRunId: string) {
      const fp = path.join(root, 'pipelines', pipelineRunId, 'state.json');
      if (!fs.existsSync(fp)) return null;
      return JSON.parse(fs.readFileSync(fp, 'utf8'));
    },
    listActiveRuns(projectSlug?: string) {
      const indexPath = path.join(root, 'active-index.json');
      if (!fs.existsSync(indexPath)) return [];
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      return Object.entries(index.pipelines || {})
        .filter(([, summary]: [string, any]) => !projectSlug || summary.projectSlug === projectSlug)
        .map(([id]) => this.getRun(id))
        .filter((r) => r && r.status === 'running');
    },
    advanceStage(pipelineRunId: string, stageId: string, update: any) {
      const current = this.getRun(pipelineRunId);
      if (!current) throw new Error(`missing run ${pipelineRunId}`);
      const ts = '2026-06-11T04:00:00.000Z';
      const stages = {
        ...current.stages,
        [stageId]: { ...current.stages[stageId], status: update.status, completedAt: ts, artifacts: update.artifacts || [] },
      };
      const nextStageId = current.stagePlan.ordered
        .slice(current.stagePlan.ordered.indexOf(stageId) + 1)
        .find((s: string) => !['passed', 'completed', 'repairing', 'cancelled', 'skipped'].includes(stages[s]?.status));
      if (nextStageId) {
        stages[nextStageId] = { ...stages[nextStageId], status: 'active', startedAt: ts };
      }
      const updated = { ...current, currentStageId: nextStageId || current.currentStageId, stages };
      writeJson(path.join(root, 'pipelines', pipelineRunId, 'state.json'), updated);
      writeJson(path.join(root, 'active-index.json'), {
        pipelines: { [pipelineRunId]: { projectSlug: updated.projectSlug, status: updated.status, currentStageId: updated.currentStageId } },
      });
      return updated;
    },
    patchRun(pipelineRunId: string, patch: any) {
      const current = this.getRun(pipelineRunId);
      if (!current) throw new Error(`missing run ${pipelineRunId}`);
      const updated = {
        ...current,
        ...patch,
        lifecycle: {
          ...current.lifecycle,
          lastActivityAt: '2026-06-11T04:00:01.000Z',
        },
      };
      writeJson(path.join(root, 'pipelines', pipelineRunId, 'state.json'), updated);
      return updated;
    },
  };
}

function makeRun(overrides: any = {}) {
  return {
    schemaVersion: 2,
    pipelineRunId: PIPELINE_RUN_ID,
    projectSlug: PROJECT_SLUG,
    projectRoot: `projects/${PROJECT_SLUG}`,
    goal: 'E2E: dispatch → completion → advance',
    status: 'running',
    entryType: 'auto-dispatch',
    lifecycle: {
      createdAt: '2026-06-11T03:00:00.000Z',
      startedAt: '2026-06-11T03:00:00.000Z',
      completedAt: null,
      cancelledAt: null,
      lastActivityAt: '2026-06-11T03:00:00.000Z',
      staleDetectedAt: null,
      terminalReason: null,
    },
    stagePlan: { ordered: ['implement', 'review', 'deploy'], skipped: [] },
    currentStageId: 'implement',
    stages: {
      implement: { status: 'active', startedAt: '2026-06-11T03:00:00.000Z', completedAt: null, dispatchId: null, artifacts: [], attempt: 1 },
      review: { status: 'pending', startedAt: null, completedAt: null, dispatchId: null, artifacts: [], attempt: 1 },
      deploy: { status: 'pending', startedAt: null, completedAt: null, dispatchId: null, artifacts: [], attempt: 1 },
    },
    metadata: {},
    ...overrides,
  };
}

describe('V2 dispatch → completion → advance integration', () => {
  it('completion event for implement stage returns nextStageId=review', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-e2e-advance-'));
    try {
      const run = makeRun();
      const store = makeDiskRunStore(root, [run]);

      const { label } = buildDispatchContract({
        projectSlug: PROJECT_SLUG,
        pipelineRunId: PIPELINE_RUN_ID,
        stageId: 'implement',
        attempt: 1,
      });

      const result = handleCompletion(
        { label, status: 'passed', taskId: 'dispatch-e2e-test', codeChanges: true, testRun: 'passed' },
        {
          runStore: store,
          advanceDepthByRun: new Map(),
          renderAdvancePromptTemplate(_name: string, values: any) {
            return `advance:${values.label}`;
          },
        },
      );

      expect(result).not.toBeNull();
      expect(result?.nextStageId).toBe('review');
      expect(result?.runSnapshot.pipelineRunId).toBe(PIPELINE_RUN_ID);
      expect(result?.runSnapshot.currentStageId).toBe('review');
      expect(result?.runSnapshot.stages.implement.status).toBe('passed');
      expect(result?.runSnapshot.stages.review.status).toBe('active');
      expect(result?.advanceText).toBeTruthy();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('repair-required completion records advisory and still advances to the next stage', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-e2e-advance-'));
    try {
      const run = makeRun();
      const store = makeDiskRunStore(root, [run]);

      const { label } = buildDispatchContract({
        projectSlug: PROJECT_SLUG,
        pipelineRunId: PIPELINE_RUN_ID,
        stageId: 'implement',
        attempt: 1,
      });

      const result = handleCompletion(
        {
          label,
          status: 'failed',
          taskId: 'dispatch-e2e-repairing-test',
          reason: 'test failure',
          findings: [{ severity: 'p1', message: 'missing coverage' }],
        },
        {
          runStore: store,
          advanceDepthByRun: new Map(),
        },
      );

      expect(result).not.toBeNull();
      expect(result?.nextStageId).toBe('review');
      expect(result?.runSnapshot.currentStageId).toBe('review');
      expect(result?.runSnapshot.stages.implement.status).toBe('repairing');
      expect(result?.runSnapshot.stages.review.status).toBe('active');
      expect(result?.runSnapshot.openAdvisories).toEqual(expect.arrayContaining([
        expect.objectContaining({
          stageId: 'implement',
          type: 'repair-required',
          severity: 'must-review',
        }),
      ]));
      expect(result?.nextAction).toMatchObject({
        kind: 'dispatch-stage',
        completedStageId: 'implement',
        completedStageStatus: 'repairing',
        nextStageId: 'review',
      });
      expect(result?.advanceText).toContain('Next stage: review');
      expect(result?.advanceText).toContain('Advisory:');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('normalizes gate-failed completion status to repairing stage status', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-e2e-advance-'));
    try {
      const run = makeRun();
      const store = makeDiskRunStore(root, [run]);

      const { label } = buildDispatchContract({
        projectSlug: PROJECT_SLUG,
        pipelineRunId: PIPELINE_RUN_ID,
        stageId: 'implement',
        attempt: 1,
      });

      const result = handleCompletion(
        {
          label,
          status: 'gate-failed',
          taskId: 'dispatch-e2e-gate-failed-test',
          reason: 'gate returned legacy failed status',
        },
        {
          runStore: store,
          advanceDepthByRun: new Map(),
        },
      );

      expect(result).not.toBeNull();
      expect(result?.runSnapshot.stages.implement.status).toBe('repairing');
      expect(result?.runSnapshot.stages.implement.status).not.toBe('gate-failed');
      expect(result?.nextAction).toMatchObject({
        completedStageId: 'implement',
        completedStageStatus: 'repairing',
        nextStageId: 'review',
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('completion event for review stage advances to deploy', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-e2e-advance-'));
    try {
      const run = makeRun({
        currentStageId: 'review',
        stages: {
          implement: { status: 'passed', startedAt: '2026-06-11T03:00:00.000Z', completedAt: '2026-06-11T03:30:00.000Z', dispatchId: null, artifacts: [], attempt: 1 },
          review: { status: 'active', startedAt: '2026-06-11T03:30:00.000Z', completedAt: null, dispatchId: null, artifacts: [], attempt: 1 },
          deploy: { status: 'pending', startedAt: null, completedAt: null, dispatchId: null, artifacts: [], attempt: 1 },
        },
      });
      const store = makeDiskRunStore(root, [run]);

      const { label } = buildDispatchContract({
        projectSlug: PROJECT_SLUG,
        pipelineRunId: PIPELINE_RUN_ID,
        stageId: 'review',
        attempt: 1,
      });

      const result = handleCompletion(
        { label, status: 'passed', taskId: 'dispatch-e2e-review' },
        {
          runStore: store,
          advanceDepthByRun: new Map(),
          renderAdvancePromptTemplate(_name: string, values: any) {
            return `advance:${values.label}`;
          },
        },
      );

      expect(result?.nextStageId).toBe('deploy');
      expect(result?.runSnapshot.stages.review.status).toBe('passed');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('completion for final stage returns nextStageId=null (pipeline complete)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-e2e-advance-'));
    try {
      const run = makeRun({
        currentStageId: 'deploy',
        stages: {
          implement: { status: 'passed', startedAt: '2026-06-11T03:00:00.000Z', completedAt: '2026-06-11T03:30:00.000Z', dispatchId: null, artifacts: [], attempt: 1 },
          review: { status: 'passed', startedAt: '2026-06-11T03:30:00.000Z', completedAt: '2026-06-11T03:45:00.000Z', dispatchId: null, artifacts: [], attempt: 1 },
          deploy: { status: 'active', startedAt: '2026-06-11T03:45:00.000Z', completedAt: null, dispatchId: null, artifacts: [], attempt: 1 },
        },
      });
      const store = makeDiskRunStore(root, [run]);

      const { label } = buildDispatchContract({
        projectSlug: PROJECT_SLUG,
        pipelineRunId: PIPELINE_RUN_ID,
        stageId: 'deploy',
        attempt: 1,
      });

      const result = handleCompletion(
        { label, status: 'passed', taskId: 'dispatch-e2e-deploy' },
        {
          runStore: store,
          advanceDepthByRun: new Map(),
          renderAdvancePromptTemplate(_name: string, values: any) {
            return `advance:${values.label}`;
          },
        },
      );

      expect(result?.nextStageId).toBeNull();
      expect(result?.advanceText).toContain('Pipeline run');
      expect(result?.advanceText).toContain('completed.');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
