import { describe, expect, it, beforeEach } from 'vitest';
import { handleCompletion } from '../src/completion-handler.js';

function createMockRunStore() {
  const runs = new Map<string, any>();
  let counter = 0;

  return {
    runs,
    listActiveRuns(slug?: string) {
      return [...runs.values()].filter(
        (r: any) => r.status === 'running' && (!slug || r.projectSlug === slug),
      );
    },
    getRun(id: string) {
      return runs.get(id) || null;
    },
    createRun(input: any) {
      counter++;
      const pipelineRunId = `auto-test-${counter}`;
      const stages: Record<string, any> = {};
      for (const stageId of input.stagePlan.ordered) {
        stages[stageId] = {
          status: stageId === input.stagePlan.ordered[0] ? 'active' : 'pending',
          startedAt: stageId === input.stagePlan.ordered[0] ? '2026-06-10T00:00:00Z' : null,
          completedAt: null,
          dispatchId: null,
          artifacts: [],
          attempt: 1,
        };
      }
      const run = {
        schemaVersion: 2,
        pipelineRunId,
        projectSlug: input.projectSlug,
        projectRoot: input.projectRoot,
        goal: input.goal,
        status: 'running',
        entryType: input.entryType,
        stagePlan: input.stagePlan,
        stages,
        currentStageId: input.stagePlan.ordered[0],
      };
      runs.set(pipelineRunId, run);
      return run;
    },
    // PLACEHOLDER_CONTINUE
    advanceStage(pipelineRunId: string, stageId: string, update: any) {
      const run = runs.get(pipelineRunId);
      if (!run) throw new Error(`Run not found: ${pipelineRunId}`);
      const updatedStages = { ...run.stages };
      updatedStages[stageId] = {
        ...updatedStages[stageId],
        status: update.status,
        artifacts: update.artifacts || [],
        dispatchId: update.dispatchId || null,
        completedAt: '2026-06-10T00:01:00Z',
      };
      const ordered = run.stagePlan.ordered;
      const idx = ordered.indexOf(stageId);
      const nextId = ordered.slice(idx + 1).find((id: string) => updatedStages[id]?.status === 'pending');
      if (nextId) {
        updatedStages[nextId] = { ...updatedStages[nextId], status: 'active', startedAt: '2026-06-10T00:01:00Z' };
      }
      const updatedRun = { ...run, stages: updatedStages, currentStageId: nextId || stageId };
      runs.set(pipelineRunId, updatedRun);
      return updatedRun;
    },
    closeRun(pipelineRunId: string, opts: any) {
      const run = runs.get(pipelineRunId);
      if (run) runs.set(pipelineRunId, { ...run, status: opts.status });
    },
  };
}

function makeDeps(runStore: any, overrides: any = {}) {
  return {
    runStore,
    advanceDepthByRun: new Map(),
    getStageMapping: () => ({ tier: 'T1', agentId: 'cc', timeout: 600 }),
    renderAdvancePromptTemplate: (_name: string, values: any) =>
      `[ADVANCE] label=${values.label} timeout=${values.timeout}s\n${values.taskDescription}`,
    ...overrides,
  };
}

describe('completion-handler quarantines non-canonical labels', () => {
  let runStore: ReturnType<typeof createMockRunStore>;

  beforeEach(() => {
    runStore = createMockRunStore();
  });

  it('returns quarantine advisory for legacy fix labels without creating a run', () => {
    const inferProjectSlug = (goal: string) => {
      if (goal.includes('官网')) return { projectSlug: 'agentos-site', projectRoot: 'projects/agentos-site' };
      return null;
    };
    const deps = makeDeps(runStore, { inferProjectSlug });
    const result = handleCompletion(
      { label: 'sevo:fix 官网SEVO品字形卡片标题改为深色横条+LIVE标签样式', status: 'passed', taskId: 'task-1' },
      deps,
    );

    expect(result).not.toBeNull();
    expect(result!.nextStageId).toBeNull();
    expect(result!.runSnapshot).toBeNull();
    expect(result!.advanceText).toContain('non-canonical label quarantined');
    expect(result!.advanceText).toContain('classified as "stage-only"');
    expect(result!.advanceText).toContain('No pipeline run was advanced');
    expect(result!.advisories).toEqual([
      { type: 'quarantine', severity: 'warn', stageId: 'fix', message: 'non-canonical label class: stage-only' },
    ]);
    expect(runStore.runs.size).toBe(0);
  });

  it('returns quarantine advisory for legacy labels even when projectSlug cannot be inferred', () => {
    const deps = makeDeps(runStore, { inferProjectSlug: () => null });
    const result = handleCompletion(
      { label: 'sevo:fix 某个未知项目的修复任务', status: 'passed', taskId: 'task-2' },
      deps,
    );

    expect(result).not.toBeNull();
    expect(result!.advanceText).toContain('non-canonical label quarantined');
    expect(result!.advanceText).toContain('sevo:<projectSlug>:<pipelineRunId-short>:<stageId>:<attempt>');
    expect(result!.runSnapshot).toBeNull();
    expect(result!.nextStageId).toBeNull();
    expect(result!.advisories).toEqual([
      { type: 'quarantine', severity: 'warn', stageId: 'fix', message: 'non-canonical label class: stage-only' },
    ]);
    expect(runStore.runs.size).toBe(0);
  });

  it('auto-creates run and advances for legacy implement completion labels', () => {
    const inferProjectSlug = () => ({ projectSlug: 'kivo', projectRoot: 'projects/kivo' });
    const deps = makeDeps(runStore, { inferProjectSlug });
    const result = handleCompletion(
      { label: 'sevo:implement KIVO新功能实现', status: 'passed', taskId: 'task-3' },
      deps,
    );

    expect(result).not.toBeNull();
    expect(result!.nextStageId).toBe('review');
    expect(result!.runSnapshot).not.toBeNull();
    expect(result!.runSnapshot.projectSlug).toBe('kivo');
    expect(runStore.runs.size).toBe(1);
  });

  it('returns quarantine advisory for failed legacy implement labels', () => {
    const inferProjectSlug = () => ({ projectSlug: 'sevo', projectRoot: 'projects/sevo' });
    const deps = makeDeps(runStore, { inferProjectSlug });
    const result = handleCompletion(
      { label: 'sevo:implement 某功能实现失败', status: 'failed', taskId: 'task-4', reason: 'build error' },
      deps,
    );

    expect(result).not.toBeNull();
    expect(result!.nextStageId).toBeNull();
    expect(result!.runSnapshot).toBeNull();
    expect(result!.advanceText).toContain('non-canonical label quarantined');
    expect(result!.advanceText).toContain('No pipeline run was advanced');
    expect(result!.advisories).toEqual([
      { type: 'quarantine', severity: 'warn', stageId: 'implement', message: 'non-canonical label class: stage-only' },
    ]);
    expect(runStore.runs.size).toBe(0);
  });

  it('returns quarantine advisory for legacy review labels without matching existing runs', () => {
    const existingRun = runStore.createRun({
      projectSlug: 'agentos-site',
      projectRoot: 'projects/agentos-site',
      goal: 'Existing run',
      entryType: 'create',
      stagePlan: { ordered: ['implement', 'review', 'fix'], skipped: [] },
    });
    runStore.advanceStage(existingRun.pipelineRunId, 'implement', { status: 'passed', artifacts: [] });

    const inferProjectSlug = () => ({ projectSlug: 'agentos-site', projectRoot: 'projects/agentos-site' });
    const deps = makeDeps(runStore, { inferProjectSlug });
    const result = handleCompletion(
      { label: 'sevo:review 官网审计', status: 'passed', taskId: 'task-5' },
      deps,
    );

    expect(result).not.toBeNull();
    expect(result!.nextStageId).toBeNull();
    expect(result!.runSnapshot).toBeNull();
    expect(result!.advanceText).toContain('non-canonical label quarantined');
    expect(result!.advisories).toEqual([
      { type: 'quarantine', severity: 'warn', stageId: 'review', message: 'non-canonical label class: stage-only' },
    ]);
    expect(runStore.runs.size).toBe(1);
    expect(runStore.runs.get(existingRun.pipelineRunId).currentStageId).toBe('review');
  });
});
