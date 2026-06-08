import { beforeEach, describe, expect, it } from 'vitest';
import * as mod from '../index.js';

const GLOBAL_KEY = Symbol.for('openclaw.sevo-pipeline.instance');

const { buildStageOrderAdvisory, noticeStageOrderAdvisory, FULL_PIPELINE_STAGES } = mod as any;

function makeState(designStatus: string) {
  const requiredStages = [...FULL_PIPELINE_STAGES];
  const stages: Record<string, { status: string }> = {};
  for (const sid of requiredStages) stages[sid] = { status: 'passed' };
  stages['architecture-design'] = { status: designStatus };
  stages.implement = { status: 'pending' };
  return {
    pipelineId: 'pipe-stage-order',
    requiredStages,
    stages,
    currentStage: 'implement',
  };
}

describe('SEVO stage-order advisory', () => {
  beforeEach(() => {
    const globalState = (globalThis as any)[GLOBAL_KEY];
    if (globalState?.pendingNotices) globalState.pendingNotices.length = 0;
  });

  it('warns that design is unfinished when implement is requested early', () => {
    const notice = buildStageOrderAdvisory({
      pipelineId: 'pipe-stage-order',
      projectSlug: 'sevo',
      requestedStageId: 'implement',
      state: makeState('pending'),
    });

    expect(notice).toContain('design 阶段尚未完成');
    expect(notice).toContain('本提示不阻断流水线');
    expect(notice).toContain('当前 implement 派发继续');
    expect(notice).not.toContain('已暂停');
  });

  it('does not warn when design is already completed', () => {
    const notice = buildStageOrderAdvisory({
      pipelineId: 'pipe-stage-order',
      projectSlug: 'sevo',
      requestedStageId: 'implement',
      state: makeState('completed'),
    });

    expect(notice).toBeNull();
  });

  it('queues the advisory without changing pipeline state', () => {
    const state = makeState('active');
    const queued = noticeStageOrderAdvisory({
      pipelineId: 'pipe-stage-order',
      projectSlug: 'sevo',
      requestedStageId: 'implement',
      state,
      source: 'unit-test',
    });

    const globalState = (globalThis as any)[GLOBAL_KEY];
    expect(queued).toBe(true);
    expect(globalState.pendingNotices.some((notice: string) => notice.includes('design 阶段尚未完成'))).toBe(true);
    expect(state.stages['architecture-design'].status).toBe('active');
    expect(state.stages.implement.status).toBe('pending');
  });
});
