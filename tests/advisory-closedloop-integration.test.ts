import { describe, it, expect, beforeEach } from 'vitest';
import { handleCompletion } from '../src/completion-handler.js';
import { listOpen } from '../src/advisory-ledger.js';
import { buildInjection } from '../src/prompt-injector.js';
import { encode } from '../src/label-protocol.js';

function makeMockRunStore() {
  const runs: Record<string, any> = {};
  return {
    createRun(data: any) {
      const run = {
        pipelineRunId: data.pipelineRunId || `run-${Date.now()}`,
        projectSlug: data.projectSlug,
        projectRoot: data.projectRoot || 'projects/test',
        goal: data.goal || 'test goal',
        status: 'running',
        currentStageId: data.stagePlan.ordered[0],
        lifecycle: { lastActivityAt: new Date().toISOString() },
        stagePlan: data.stagePlan,
        stages: Object.fromEntries(
          data.stagePlan.ordered.map((id: string, i: number) => [
            id,
            { status: i === 0 ? 'active' : 'pending', attempt: 1 },
          ]),
        ),
        metadata: {},
        openAdvisories: [],
      };
      runs[run.pipelineRunId] = run;
      return run;
    },
    getRun(id: string) {
      return runs[id] || null;
    },
    listActiveRuns() {
      return Object.values(runs).filter((r: any) => r.status === 'running');
    },
    advanceStage(runId: string, stageId: string, payload: any) {
      const run = runs[runId];
      if (!run) return null;
      run.stages[stageId] = {
        ...run.stages[stageId],
        status: payload.status,
        artifacts: payload.artifacts || [],
        dispatchId: payload.dispatchId || null,
      };
      const ordered = run.stagePlan.ordered;
      const idx = ordered.indexOf(stageId);
      const nextId = ordered[idx + 1];
      if (nextId && payload.status === 'passed') {
        run.currentStageId = nextId;
        run.stages[nextId] = { ...run.stages[nextId], status: 'active' };
      }
      run.lifecycle.lastActivityAt = new Date().toISOString();
      return run;
    },
    patchRun(id: string, patch: any) {
      const run = runs[id];
      if (!run) throw new Error(`run not found: ${id}`);
      Object.assign(run, patch);
      return run;
    },
  };
}

describe('P2: evidence advisory persistence in completion-handler', () => {
  let runStore: ReturnType<typeof makeMockRunStore>;

  beforeEach(() => {
    runStore = makeMockRunStore();
  });

  it('persists evidence-contract advisory to openAdvisories when required fields are missing', () => {
    const run = runStore.createRun({
      pipelineRunId: 'p2-test-run-001',
      projectSlug: 'sevo-test',
      goal: '实现搜索功能',
      stagePlan: { ordered: ['implement', 'review'], skipped: [] },
    });

    const label = encode({
      projectSlug: run.projectSlug,
      pipelineRunId: run.pipelineRunId,
      stageId: 'implement',
      attempt: 1,
    });

    const result = handleCompletion(
      { label, status: 'passed', taskId: 'task-1', codeChanges: 'src/foo.ts' },
      { runStore, advanceDepthByRun: new Map() },
    );

    expect(result).not.toBeNull();
    expect(result!.advisories.length).toBeGreaterThan(0);

    const open = listOpen(run.pipelineRunId, { runStore });
    expect(open.length).toBeGreaterThan(0);
    expect(open[0].type).toBe('evidence-contract-missing-fields');
    expect(open[0].stageId).toBe('implement');
    expect(open[0].severity).toBe('warn');
    expect(open[0].message).toContain('testRun');
  });

  it('does not persist advisory when all required evidence fields are present', () => {
    const run = runStore.createRun({
      pipelineRunId: 'p2-test-run-002',
      projectSlug: 'sevo-test',
      goal: '实现搜索功能',
      stagePlan: { ordered: ['implement', 'review'], skipped: [] },
    });

    const label = encode({
      projectSlug: run.projectSlug,
      pipelineRunId: run.pipelineRunId,
      stageId: 'implement',
      attempt: 1,
    });

    handleCompletion(
      { label, status: 'passed', taskId: 'task-2', codeChanges: 'src/foo.ts', testRun: 'all passed' },
      { runStore, advanceDepthByRun: new Map() },
    );

    const open = listOpen(run.pipelineRunId, { runStore });
    expect(open).toHaveLength(0);
  });
});

describe('P1: listOpenAdvisories wired into buildInjection', () => {
  let runStore: ReturnType<typeof makeMockRunStore>;

  beforeEach(() => {
    runStore = makeMockRunStore();
  });

  it('shows open advisories in prompt injection when listOpenAdvisories is provided', () => {
    const run = runStore.createRun({
      pipelineRunId: 'p1-test-run-001',
      projectSlug: 'sevo-test',
      goal: '实现知识提取流水线优化',
      stagePlan: { ordered: ['spec', 'implement'], skipped: [] },
    });

    runStore.patchRun(run.pipelineRunId, {
      openAdvisories: [
        {
          id: 'adv-001',
          runId: run.pipelineRunId,
          stageId: 'spec',
          type: 'entry-skip',
          severity: 'warn',
          message: 'protected stage spec was skipped without review',
          evidence: [],
          createdAt: '2026-06-10T01:00:00.000Z',
          resolvedAt: null,
        },
      ],
    });

    const result = buildInjection({}, {
      listActiveRuns: () => runStore.listActiveRuns(),
      getPendingAdvance: () => null,
      listOpenAdvisories: (runId: string) => listOpen(runId, { runStore }),
    });

    expect(result).not.toBeNull();
    expect(result!.text).toContain('Open Advisories');
    expect(result!.text).toContain('protected stage spec was skipped');
  });

  it('does not show advisories section when no open advisories exist', () => {
    runStore.createRun({
      pipelineRunId: 'p1-test-run-002',
      projectSlug: 'sevo-test',
      goal: '实现知识提取流水线优化',
      stagePlan: { ordered: ['spec', 'implement'], skipped: [] },
    });

    const result = buildInjection({}, {
      listActiveRuns: () => runStore.listActiveRuns(),
      getPendingAdvance: () => null,
      listOpenAdvisories: (runId: string) => listOpen(runId, { runStore }),
    });

    expect(result).not.toBeNull();
    expect(result!.text).not.toContain('Open Advisories');
  });
});
