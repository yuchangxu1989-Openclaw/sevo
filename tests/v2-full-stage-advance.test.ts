import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { handleCompletion } from '../src/completion-handler.js';
import { createRun, closeRun, getRun, advanceStage } from '../src/run-store.js';
import { encode } from '../src/label-protocol.js';
import { FULL_PIPELINE_STAGES } from '../src/stage-policy.js';
import { getStageConfig } from '../src/stage-pipeline-config.js';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(new URL('..', import.meta.url).pathname);

function makeDeps() {
  return {
    advanceDepthByRun: new Map(),
    maxAdvancesPerRunRound: 50,
  };
}

function makeLabel(run: any, stageId: string, attempt = 1) {
  return encode({
    projectSlug: run.projectSlug,
    pipelineRunId: run.pipelineRunId,
    stageId,
    attempt,
  });
}

function completeStage(pipelineRunId: string, stageId: string) {
  const currentRun = getRun(pipelineRunId);
  const attempt = currentRun.stages?.[stageId]?.attempt || 1;
  return handleCompletion(
    { label: makeLabel(currentRun, stageId, attempt), status: 'passed', taskId: `task-${stageId}` },
    makeDeps(),
  );
}

describe('full-stage advance chain (all 22 stages)', () => {
  const pipelineIds: string[] = [];

  afterAll(() => {
    for (const id of pipelineIds) {
      try { closeRun(id, { status: 'completed', reason: 'test cleanup' }); } catch {}
      rmSync(resolve(projectRoot, 'data/pipelines', id), { recursive: true, force: true });
    }
  });

  it('every non-cycle stage advances to the next stage in order', () => {
    const stages = [...FULL_PIPELINE_STAGES];
    const nonCycleStages = stages.filter((s) => {
      const config = getStageConfig(s);
      return !config?.cycleTarget || config.cycleCondition !== 'passed';
    });

    const run = createRun({
      projectSlug: 'advance-linear-all',
      projectRoot: 'projects/test',
      goal: 'Test all non-cycle stages advance linearly',
      entryType: 'create',
      stagePlan: { ordered: [...stages], skipped: [] },
    });
    pipelineIds.push(run.pipelineRunId);

    let currentStageIdx = 0;
    for (let i = 0; i < stages.length - 1; i++) {
      const currentStage = stages[i];
      const config = getStageConfig(currentStage);
      const isCycleOnPass = config?.cycleTarget && config.cycleCondition === 'passed';

      if (isCycleOnPass) {
        // Cycle stages (like fix→review on pass) — skip in linear walk
        // but we still need to mark them completed so the run advances past them
        const currentRun = getRun(run.pipelineRunId);
        if (currentRun.currentStageId !== currentStage) continue;
        // For cycle stages, a 'failed' status won't trigger cycle, it advances linearly
        const attempt = currentRun.stages?.[currentStage]?.attempt || 1;
        const result = handleCompletion(
          { label: makeLabel(currentRun, currentStage, attempt), status: 'cancelled', taskId: `task-${currentStage}` },
          makeDeps(),
        );
        // cancelled is treated as completed, advances past
        continue;
      }

      const currentRun = getRun(run.pipelineRunId);
      if (currentRun.currentStageId !== currentStage) continue;
      const attempt = currentRun.stages?.[currentStage]?.attempt || 1;

      const result = completeStage(run.pipelineRunId, currentStage);
      const expectedNext = stages[i + 1];

      expect(result, `"${currentStage}" completion should produce advance`).not.toBeNull();
      expect(result!.nextStageId, `"${currentStage}" → "${expectedNext}"`).toBe(expectedNext);
      expect(result!.advanceText).toContain('[SEVO V2 nextAction]');
      expect(result!.advanceText).toContain(`Next stage: ${expectedNext}`);
      expect(result!.advanceText).toContain('Label:');
      expect(result!.advanceText).toContain('Timeout:');
    }
  });

  it('fix stage cycles back to review on pass', () => {
    const run = createRun({
      projectSlug: 'advance-fix-cycle',
      projectRoot: 'projects/test',
      goal: 'Test fix→review cycle',
      entryType: 'create',
      stagePlan: { ordered: ['implement', 'review', 'fix', 'smoke-test'], skipped: [] },
    });
    pipelineIds.push(run.pipelineRunId);

    completeStage(run.pipelineRunId, 'implement');
    const reviewResult = completeStage(run.pipelineRunId, 'review');
    expect(reviewResult!.nextStageId).toBe('fix');

    const fixResult = completeStage(run.pipelineRunId, 'fix');
    expect(fixResult!.nextStageId).toBe('review');
    expect(fixResult!.advanceText).toContain('review');
  });

  it('review gate cycles back on failure', () => {
    const run = createRun({
      projectSlug: 'advance-review-fail',
      projectRoot: 'projects/test',
      goal: 'Test review fail→fix cycle',
      entryType: 'create',
      stagePlan: { ordered: ['implement', 'review', 'fix', 'smoke-test'], skipped: [] },
    });
    pipelineIds.push(run.pipelineRunId);

    completeStage(run.pipelineRunId, 'implement');

    const currentRun = getRun(run.pipelineRunId);
    const attempt = currentRun.stages?.review?.attempt || 1;
    const result = handleCompletion(
      { label: makeLabel(currentRun, 'review', attempt), status: 'failed', taskId: 'task-review-fail' },
      makeDeps(),
    );

    expect(result).not.toBeNull();
    expect(result!.nextStageId).toBe('fix');
  });

  it('last stage completion closes the pipeline', () => {
    const run = createRun({
      projectSlug: 'advance-ledger-close',
      projectRoot: 'projects/test',
      goal: 'Test ledger closes pipeline',
      entryType: 'create',
      stagePlan: { ordered: ['ledger'], skipped: [] },
    });
    pipelineIds.push(run.pipelineRunId);

    const result = completeStage(run.pipelineRunId, 'ledger');
    expect(result).not.toBeNull();
    expect(result!.nextStageId).toBeNull();
    expect(result!.nextAction.kind).toBe('complete-run');
    expect(result!.advanceText).toContain('completed');
  });

  it('advance text includes entry/exit criteria and role hint', () => {
    const run = createRun({
      projectSlug: 'advance-fields-test',
      projectRoot: 'projects/test',
      goal: 'Validate advance text fields',
      entryType: 'create',
      stagePlan: { ordered: ['spec', 'spec-review-gate', 'test-case-authoring'], skipped: [] },
    });
    pipelineIds.push(run.pipelineRunId);

    const result = completeStage(run.pipelineRunId, 'spec');
    expect(result).not.toBeNull();
    expect(result!.nextStageId).toBe('spec-review-gate');
    expect(result!.advanceText).toContain('Entry criteria:');
    expect(result!.advanceText).toContain('Exit criteria:');
    expect(result!.advanceText).toContain('Role hint:');
  });
});
