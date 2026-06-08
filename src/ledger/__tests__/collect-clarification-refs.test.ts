import { describe, expect, it } from 'vitest';

import type { PipelineState } from '../../types/index.js';
import { collectClarificationRefs } from '../artifact-collector.js';

function makeState(clarificationRefs?: { id: string }[]): PipelineState {
  return {
    pipelineId: 'p1',
    taskId: 't1',
    level: 'L1',
    requiredStages: ['spec', 'implement'],
    stages: {
      spec: {
        stageId: 'spec',
        status: 'passed',
        attempt: 1,
        artifacts: [],
        clarificationRefs: clarificationRefs?.map((r) => ({
          id: r.id, type: 'clarification', path: `/clr/${r.id}`, createdAt: '2026-04-20T10:00:00.000Z',
        })),
      },
      implement: {
        stageId: 'implement',
        status: 'passed',
        attempt: 1,
        artifacts: [],
      },
    } as unknown as PipelineState['stages'],
    currentStage: 'implement',
    createdAt: '2026-04-20T10:00:00.000Z',
    updatedAt: '2026-04-20T10:00:00.000Z',
  };
}

describe('collectClarificationRefs', () => {
  it('collects refs from stages that have them', () => {
    const refs = collectClarificationRefs(makeState([{ id: 'clr-1' }, { id: 'clr-2' }]));
    expect(refs).toHaveLength(2);
    expect(refs.map((r) => r.id)).toEqual(['clr-1', 'clr-2']);
  });

  it('returns empty when no stages have clarificationRefs', () => {
    const refs = collectClarificationRefs(makeState());
    expect(refs).toHaveLength(0);
  });

  it('deduplicates by id across stages', () => {
    const state = makeState([{ id: 'clr-dup' }]);
    // Add same ref to implement stage
    (state.stages as Record<string, unknown>)['implement'] = {
      stageId: 'implement',
      status: 'passed',
      attempt: 1,
      artifacts: [],
      clarificationRefs: [{ id: 'clr-dup', type: 'clarification', path: '/clr/dup', createdAt: '2026-04-20T10:00:00.000Z' }],
    };
    const refs = collectClarificationRefs(state);
    expect(refs).toHaveLength(1);
  });
});
