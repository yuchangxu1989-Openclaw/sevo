import { describe, expect, it } from 'vitest';

import type { ArtifactRef, StageId, StageRecord } from '../../types/index.js';
import {
  BlockingLevel,
  ClarificationCoordinator,
  ClarificationType,
  ResolutionSink,
  Status,
  type ClarificationHandle,
  type ClarificationPayload,
  type ClarificationResponse,
  type ClarificationTarget,
  type HostClarificationAdapter,
} from '../../clarification/index.js';
import { TaskOrchestrator } from '../task-orchestrator.js';
import { StageRouter } from '../../router/stage-router.js';
import { GateEngine } from '../../gate/gate-engine.js';

class FakeAdapter implements HostClarificationAdapter {
  private responseCb?: (r: ClarificationResponse) => void;
  private timeoutCb?: (h: ClarificationHandle) => void;
  readonly dispatched: Array<{ target: ClarificationTarget; payload: ClarificationPayload }> = [];

  requestClarification(target: ClarificationTarget, payload: ClarificationPayload): ClarificationHandle {
    this.dispatched.push({ target, payload });
    return {
      clarificationId: payload.clarificationId,
      targetType: target.type,
      targetId: target.id,
      dispatchedAt: '2026-04-20T10:00:00.000Z',
      timeoutMs: 5000,
    };
  }
  onClarificationResponse(cb: (r: ClarificationResponse) => void): void { this.responseCb = cb; }
  onClarificationTimeout(cb: (h: ClarificationHandle) => void): void { this.timeoutCb = cb; }
  emitResponse(r: ClarificationResponse): void { this.responseCb?.(r); }
}

function art(id: string): ArtifactRef {
  return { id, type: 'doc', path: `/a/${id}`, createdAt: '2026-04-20T10:00:00.000Z' };
}

describe('TaskOrchestrator — clarification integration', () => {
  function makeOrchestrator(adapter: FakeAdapter) {
    const stageRecords = new Map<StageId, StageRecord>();
    stageRecords.set('spec', {
      stageId: 'spec', status: 'active', attempt: 1, artifacts: [],
    });

    let idCounter = 0;
    const coordinator = new ClarificationCoordinator({
      adapter,
      rules: [{
        id: 'missing-ac',
        evaluate(sr, artifacts) {
          if (artifacts.some((a) => a.id === 'ambiguous-spec')) {
            return [{
              pipelineId: 'pipe-1',
              stageId: sr.stageId,
              stageAttempt: sr.attempt,
              type: ClarificationType.BOUNDARY,
              blockingLevel: BlockingLevel.BLOCKING,
              targetType: 'user' as const,
              question: 'AC missing for retry logic.',
              sourceArtifacts: artifacts,
              impactScope: ['FR-11'],
              resolutionSinks: [ResolutionSink.SPEC_PACKAGE],
            }];
          }
          return [];
        },
      }],
      getStageRecord: (id) => stageRecords.get(id),
      updateStageRecord: (id, updater) => {
        const current = stageRecords.get(id)!;
        const next = updater(current);
        stageRecords.set(id, next);
        return { ...next };
      },
      applyResolution: (record) => [art(`settled-${record.clarificationId}`)],
      now: () => '2026-04-20T10:00:00.000Z',
      createId: () => `clr-${++idCounter}`,
    });

    const orchestrator = new TaskOrchestrator(
      new StageRouter(),
      new GateEngine(),
      { clarificationCoordinator: coordinator },
    );

    return { orchestrator, coordinator, stageRecords };
  }

  it('scanClarifications opens and dispatches blocking findings', () => {
    const adapter = new FakeAdapter();
    const { orchestrator } = makeOrchestrator(adapter);

    const run = orchestrator.startPipeline({
      taskId: 't1', title: 'test', initialStage: 'spec', stages: ['spec'],
    });
    orchestrator.submitArtifacts(run.runId, [art('ambiguous-spec')]);

    const records = orchestrator.scanClarifications(run.runId);
    expect(records).toHaveLength(1);
    expect(records[0]!.blockingLevel).toBe(BlockingLevel.BLOCKING);
    expect(adapter.dispatched).toHaveLength(1);
  });

  it('hasBlockingClarifications returns true when blocking open', () => {
    const adapter = new FakeAdapter();
    const { orchestrator } = makeOrchestrator(adapter);

    const run = orchestrator.startPipeline({
      taskId: 't2', title: 'test', initialStage: 'spec', stages: ['spec'],
    });
    orchestrator.submitArtifacts(run.runId, [art('ambiguous-spec')]);
    orchestrator.scanClarifications(run.runId);

    expect(orchestrator.hasBlockingClarifications(run.runId)).toBe(true);
  });

  it('returns empty when no coordinator configured', () => {
    const orchestrator = new TaskOrchestrator();
    const run = orchestrator.startPipeline({
      taskId: 't3', title: 'test', initialStage: 'spec', stages: ['spec'],
    });

    expect(orchestrator.scanClarifications(run.runId)).toEqual([]);
    expect(orchestrator.hasBlockingClarifications(run.runId)).toBe(false);
    expect(orchestrator.getClarificationSummary(run.runId)).toBeUndefined();
  });

  it('getClarificationSummary reflects open/settled counts', () => {
    const adapter = new FakeAdapter();
    const { orchestrator, coordinator } = makeOrchestrator(adapter);

    const run = orchestrator.startPipeline({
      taskId: 't4', title: 'test', initialStage: 'spec', stages: ['spec'],
    });
    orchestrator.submitArtifacts(run.runId, [art('ambiguous-spec')]);
    orchestrator.scanClarifications(run.runId);

    let summary = orchestrator.getClarificationSummary(run.runId);
    expect(summary).toEqual({ open: 1, resolved: 0, settled: 0, blockingOpen: 1 });

    // Resolve and settle
    adapter.emitResponse({
      clarificationId: 'clr-1',
      responderId: 'user-1',
      content: 'Add retry AC.',
      receivedAt: '2026-04-20T10:01:00.000Z',
    });
    coordinator.applyResolution('clr-1');

    summary = orchestrator.getClarificationSummary(run.runId);
    expect(summary).toEqual({ open: 0, resolved: 0, settled: 1, blockingOpen: 0 });
  });

  it('onClarificationSettled emits event with resumed=true when no more blockers', () => {
    const adapter = new FakeAdapter();
    const { orchestrator, coordinator } = makeOrchestrator(adapter);
    const events: unknown[] = [];
    orchestrator.events.on('clarification:settled', (e) => events.push(e));

    const run = orchestrator.startPipeline({
      taskId: 't5', title: 'test', initialStage: 'spec', stages: ['spec'],
    });
    orchestrator.submitArtifacts(run.runId, [art('ambiguous-spec')]);
    orchestrator.scanClarifications(run.runId);

    adapter.emitResponse({
      clarificationId: 'clr-1',
      responderId: 'user-1',
      content: 'Confirmed.',
      receivedAt: '2026-04-20T10:01:00.000Z',
    });
    coordinator.applyResolution('clr-1');
    orchestrator.onClarificationSettled(run.runId, 'clr-1');

    expect(events).toHaveLength(1);
    expect((events[0] as Record<string, unknown>).resumed).toBe(true);
  });
});
