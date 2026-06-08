import { describe, it, expect } from 'vitest';
import * as mod from '../index.js';

// P0-1 guard：sevo:from / sevo:create --from 不再把前置主链阶段标记 skipped。
// 入口只记录 requestedStage/entryStage，requiredStages 全部保留为非 skipped（原则 12）。
const { applyCreateFromStage, FULL_PIPELINE_STAGES } = mod as any;

function makeState() {
  const requiredStages = [...FULL_PIPELINE_STAGES];
  const stages: Record<string, { status: string }> = {};
  for (const sid of requiredStages) stages[sid] = { status: 'pending' };
  return {
    pipelineId: 'pl-test-from',
    requiredStages,
    stages,
    currentStage: requiredStages[0],
  };
}

describe('P0-1: --from entry never marks prior stages skipped', () => {
  it('returns the requested target stage and an empty skippedStages list', () => {
    const state = makeState();
    const result = applyCreateFromStage(state, 'implement', state.pipelineId);
    expect(result.error).toBeNull();
    expect(result.targetStageId).toBe('implement');
    expect(result.skippedStages).toEqual([]);
  });

  it('leaves every required stage in a non-skipped status', () => {
    const state = makeState();
    applyCreateFromStage(state, 'implement', state.pipelineId);
    for (const sid of state.requiredStages) {
      expect(state.stages[sid].status).not.toBe('skipped');
    }
  });

  it('records the requested stage as advisory metadata, entry stays at the first stage', () => {
    const state = makeState();
    const result = applyCreateFromStage(state, 'audit', state.pipelineId);
    expect(state.requestedStage).toBe('review');
    expect(result.entryStageId).toBe(state.requiredStages[0]);
    expect(state.entryStage).toBe(state.requiredStages[0]);
  });

  it('errors when the requested stage is not in the pipeline, without skipping anything', () => {
    const state = makeState();
    // A pipeline whose chain (after endgame backfill) does not contain `spec`.
    state.requiredStages = ['implement', 'review'];
    state.stages = { implement: { status: 'pending' }, review: { status: 'pending' } };
    const result = applyCreateFromStage(state, 'specify', state.pipelineId);
    expect(result.error).toBeTruthy();
    expect(result.skippedStages).toEqual([]);
  });
});
