import { describe, expect, it } from 'vitest';
import * as mod from '../index.js';

const GLOBAL_KEY = Symbol.for('openclaw.sevo-pipeline.instance');
const g = () => (globalThis as any)[GLOBAL_KEY];

function clearPending(pipelineId: string) {
  g().pendingAdvances.delete(pipelineId);
}

function pendingFor(pipelineId: string): any[] {
  return g().pendingAdvances.get(pipelineId) || [];
}

describe('SEVO active-stage advance reconciliation', () => {
  it('queues an advance when spec completion leaves spec-review-gate active', () => {
    const pipelineId = 'pipe-spec-to-review';
    clearPending(pipelineId);

    const result = mod.reconcileActiveStageAdvances({
      pipelineId,
      projectSlug: 'demo',
      projectRoot: 'projects/demo',
      source: 'unit-spec-completion',
      state: {
        pipelineId,
        taskId: 'task-demo',
        requiredStages: ['spec', 'spec-review-gate', 'ux-interaction-design'],
        stages: {
          spec: { stageId: 'spec', status: 'passed', artifacts: [] },
          'spec-review-gate': { stageId: 'spec-review-gate', status: 'active', artifacts: [] },
          'ux-interaction-design': { stageId: 'ux-interaction-design', status: 'pending', artifacts: [] },
        },
      },
    });

    expect(result.queued).toBe(1);
    const entry = pendingFor(pipelineId).find(e => e.stageId === 'spec-review-gate');
    expect(entry).toBeTruthy();
    expect(entry.label).toBe('sevo:demo:spec-review-gate:1');
    expect(entry.taskDescription).toContain('spec-review-gate');
    clearPending(pipelineId);
  });

  it('queues a design advance when spec-review-gate pass leaves design active', () => {
    const pipelineId = 'pipe-review-to-design';
    clearPending(pipelineId);

    const result = mod.reconcileActiveStageAdvances({
      pipelineId,
      projectSlug: 'demo',
      projectRoot: 'projects/demo',
      source: 'unit-spec-review-completion',
      state: {
        pipelineId,
        taskId: 'task-demo',
        requiredStages: ['spec', 'spec-review-gate', 'ux-interaction-design', 'architecture-design'],
        stages: {
          spec: { stageId: 'spec', status: 'passed', artifacts: [] },
          'spec-review-gate': { stageId: 'spec-review-gate', status: 'passed', artifacts: [] },
          'ux-interaction-design': { stageId: 'ux-interaction-design', status: 'active', artifacts: [] },
          'architecture-design': { stageId: 'architecture-design', status: 'pending', artifacts: [] },
        },
      },
    });

    expect(result.queued).toBe(1);
    const entry = pendingFor(pipelineId).find(e => e.stageId === 'ux-interaction-design');
    expect(entry).toBeTruthy();
    expect(entry.label).toBe('sevo:demo:ux-interaction-design:1');
    expect(entry.taskDescription).toContain('ux-interaction-design');
    clearPending(pipelineId);
  });
});
