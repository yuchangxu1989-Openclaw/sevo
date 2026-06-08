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
} from '../index.js';

class FakeClarificationAdapter implements HostClarificationAdapter {
  private responseCallback?: (response: ClarificationResponse) => void;
  private timeoutCallback?: (handle: ClarificationHandle) => void;

  readonly dispatched: Array<{ target: ClarificationTarget; payload: ClarificationPayload }> = [];

  requestClarification(
    target: ClarificationTarget,
    payload: ClarificationPayload,
  ): ClarificationHandle {
    this.dispatched.push({ target, payload });
    return {
      clarificationId: payload.clarificationId,
      targetType: target.type,
      targetId: target.id,
      dispatchedAt: '2026-04-20T09:14:00.000Z',
      timeoutMs: 3000,
    };
  }

  onClarificationResponse(callback: (response: ClarificationResponse) => void): void {
    this.responseCallback = callback;
  }

  onClarificationTimeout(callback: (handle: ClarificationHandle) => void): void {
    this.timeoutCallback = callback;
  }

  emitResponse(response: ClarificationResponse): void {
    this.responseCallback?.(response);
  }

  emitTimeout(handle: ClarificationHandle): void {
    this.timeoutCallback?.(handle);
  }
}

function makeArtifact(id: string): ArtifactRef {
  return {
    id,
    type: 'document',
    path: `/artifacts/${id}.md`,
    createdAt: '2026-04-20T09:14:00.000Z',
  };
}

function makeStageRecord(stageId: StageId, attempt = 1): StageRecord {
  return {
    stageId,
    status: 'active',
    attempt,
    artifacts: [],
  };
}

describe('ClarificationCoordinator', () => {
  it('opens blocking findings without freezing the stage (pipeline keeps advancing)', () => {
    const adapter = new FakeClarificationAdapter();
    const stage = makeStageRecord('spec');
    const settled: string[] = [];

    const coordinator = new ClarificationCoordinator({
      adapter,
      rules: [
        {
          id: 'missing-ac',
          evaluate(stageRecord, artifacts) {
            return [{
              pipelineId: 'pipe-1',
              stageId: stageRecord.stageId,
              stageAttempt: stageRecord.attempt,
              type: ClarificationType.BOUNDARY,
              blockingLevel: BlockingLevel.BLOCKING,
              targetType: 'user',
              question: 'Acceptance criteria are missing.',
              sourceArtifacts: artifacts,
              impactScope: ['FR-11'],
              resolutionSinks: [ResolutionSink.SPEC_PACKAGE],
            }];
          },
        },
      ],
      getStageRecord: () => stage,
      updateStageRecord: (_stageId, updater) => {
        const next = updater(stage);
        Object.assign(stage, next);
        return { ...stage };
      },
      applyResolution: (record) => {
        settled.push(record.clarificationId);
        return [makeArtifact(`settled-${record.clarificationId}`)];
      },
      now: () => '2026-04-20T09:14:00.000Z',
      createId: () => 'clr-blocking',
    });

    const findings = coordinator.scan(stage, [makeArtifact('spec-draft')]);
    const [record] = coordinator.open(findings);
    // 原则：流水线永远往前走。BLOCKING 澄清不再冻结 stage，保持 active 继续推进。
    expect(stage.status).toBe('active');

    const handle = coordinator.dispatch(record!);
    expect(handle.clarificationId).toBe('clr-blocking');
    expect(adapter.dispatched).toHaveLength(1);

    adapter.emitResponse({
      clarificationId: 'clr-blocking',
      responderId: 'user-1',
      content: 'Add retry limit acceptance criteria.',
      receivedAt: '2026-04-20T09:15:00.000Z',
    });
    coordinator.applyResolution('clr-blocking');
    const transition = coordinator.resumeStage('spec', 'clr-blocking');

    expect(settled).toEqual(['clr-blocking']);
    expect(coordinator.getRecord('clr-blocking')?.status).toBe(Status.SETTLED);
    // resumeStage 对未冻结 stage 是兼容 no-op：from/to 均为 active。
    expect(transition).toEqual({
      stageId: 'spec',
      from: 'active',
      to: 'active',
      triggeredBy: 'clr-blocking',
    });
    expect(stage.status).toBe('active');
  });

  it('keeps the stage active for non-blocking clarifications', () => {
    const adapter = new FakeClarificationAdapter();
    const stage = makeStageRecord('implement');

    const coordinator = new ClarificationCoordinator({
      adapter,
      getStageRecord: () => stage,
      updateStageRecord: (_stageId, updater) => {
        const next = updater(stage);
        Object.assign(stage, next);
        return { ...stage };
      },
      applyResolution: () => [],
      now: () => '2026-04-20T09:14:00.000Z',
      createId: () => 'clr-non-blocking',
    });

    const [record] = coordinator.open([{
      pipelineId: 'pipe-2',
      stageId: 'implement',
      stageAttempt: 1,
      type: ClarificationType.DECISION,
      blockingLevel: BlockingLevel.NON_BLOCKING,
      targetType: 'reviewer',
      targetId: 'audit-01',
      question: 'Should logging stay minimal in wave 1?',
      sourceArtifacts: [makeArtifact('task-1')],
      impactScope: ['WP-01-T-02'],
      assumedDefault: 'Keep current logging scope.',
      resolutionSinks: [ResolutionSink.TASK_DESCRIPTION],
    }]);

    coordinator.dispatch(record!);
    expect(stage.status).toBe('active');
    expect(coordinator.getRecord('clr-non-blocking')?.status).toBe(Status.OPEN);
  });

  it('keeps the stage active while concurrent blocking clarifications are tracked and settled', () => {
    const adapter = new FakeClarificationAdapter();
    const stage = makeStageRecord('contract');
    let idCounter = 0;

    const coordinator = new ClarificationCoordinator({
      adapter,
      getStageRecord: () => stage,
      updateStageRecord: (_stageId, updater) => {
        const next = updater(stage);
        Object.assign(stage, next);
        return { ...stage };
      },
      applyResolution: (record) => [makeArtifact(record.clarificationId)],
      now: () => '2026-04-20T09:14:00.000Z',
      createId: () => `clr-${++idCounter}`,
    });

    const records = coordinator.open([
      {
        pipelineId: 'pipe-3',
        stageId: 'contract',
        stageAttempt: 1,
        type: ClarificationType.BOUNDARY,
        blockingLevel: BlockingLevel.BLOCKING,
        targetType: 'user',
        question: 'What is the timeout budget?',
        sourceArtifacts: [makeArtifact('contract-draft')],
        impactScope: ['ADR-001'],
      },
      {
        pipelineId: 'pipe-3',
        stageId: 'contract',
        stageAttempt: 1,
        type: ClarificationType.CORRECTION,
        blockingLevel: BlockingLevel.BLOCKING,
        targetType: 'upstream-stage',
        targetId: 'spec',
        question: 'Spec and contract disagree on retry semantics.',
        sourceArtifacts: [makeArtifact('contract-draft')],
        impactScope: ['FR-11', 'ADR-002'],
      },
    ]);

    for (const record of records) {
      coordinator.dispatch(record);
    }

    coordinator.resolve('clr-1', {
      clarificationId: 'clr-1',
      responderId: 'user-1',
      content: 'Timeout is 30s.',
      receivedAt: '2026-04-20T09:16:00.000Z',
    });
    coordinator.applyResolution('clr-1');
    const firstTransition = coordinator.resumeStage('contract', 'clr-1');

    // 原则：流水线永远往前走。stage 从未被冻结，始终是 active；resumeStage 是 no-op。
    expect(firstTransition.to).toBe('active');
    expect(stage.status).toBe('active');

    coordinator.resolve('clr-2', {
      clarificationId: 'clr-2',
      responderId: 'spec',
      content: 'Retry semantics follow spec.',
      receivedAt: '2026-04-20T09:17:00.000Z',
    });
    coordinator.applyResolution('clr-2');
    const secondTransition = coordinator.resumeStage('contract', 'clr-2');

    expect(secondTransition.to).toBe('active');
    expect(stage.status).toBe('active');
  });

  it('isolates old attempt clarifications from a newer blocked attempt', () => {
    const adapter = new FakeClarificationAdapter();
    const stage = makeStageRecord('implement', 2);
    stage.status = 'blocked';

    const coordinator = new ClarificationCoordinator({
      adapter,
      getStageRecord: () => stage,
      updateStageRecord: (_stageId, updater) => {
        const next = updater(stage);
        Object.assign(stage, next);
        return { ...stage };
      },
      applyResolution: (record) => [makeArtifact(record.clarificationId)],
      now: () => '2026-04-20T09:14:00.000Z',
      createId: () => 'clr-old',
    });

    const [oldRecord] = coordinator.open([{
      pipelineId: 'pipe-4',
      stageId: 'implement',
      stageAttempt: 1,
      type: ClarificationType.META,
      blockingLevel: BlockingLevel.BLOCKING,
      targetType: 'user',
      question: 'Old attempt clarification',
      sourceArtifacts: [makeArtifact('task-old')],
      impactScope: ['WP-02-T-01'],
    }]);

    coordinator.dispatch(oldRecord!);
    coordinator.resolve('clr-old', {
      clarificationId: 'clr-old',
      responderId: 'user-1',
      content: 'Resolved for attempt 1.',
      receivedAt: '2026-04-20T09:18:00.000Z',
    });
    coordinator.applyResolution('clr-old');
    const transition = coordinator.resumeStage('implement', 'clr-old');

    expect(transition).toEqual({
      stageId: 'implement',
      from: 'blocked',
      to: 'blocked',
      triggeredBy: 'clr-old',
    });
    expect(stage.status).toBe('blocked');
  });

  it('marks blocking clarifications as expired on timeout while the stage stays active', () => {
    const adapter = new FakeClarificationAdapter();
    const stage = makeStageRecord('spec');
    stage.status = 'active';

    const coordinator = new ClarificationCoordinator({
      adapter,
      getStageRecord: () => stage,
      updateStageRecord: (_stageId, updater) => {
        const next = updater(stage);
        Object.assign(stage, next);
        return { ...stage };
      },
      applyResolution: (record) => [makeArtifact(`fallback-${record.clarificationId}`)],
      now: () => '2026-04-20T09:14:00.000Z',
      createId: () => 'clr-timeout',
    });

    const [record] = coordinator.open([{
      pipelineId: 'pipe-5',
      stageId: 'spec',
      stageAttempt: 1,
      type: ClarificationType.BOUNDARY,
      blockingLevel: BlockingLevel.BLOCKING,
      targetType: 'user',
      question: 'Confirm retry scope.',
      sourceArtifacts: [makeArtifact('spec-draft')],
      impactScope: ['FR-11'],
      assumedDefault: 'Retry scope stays inside current module.',
      resolutionSinks: [ResolutionSink.SPEC_PACKAGE],
    }]);

    const handle = coordinator.dispatch(record!);
    // 原则：流水线永远往前走。BLOCKING 澄清不冻结 stage，保持 active。
    expect(stage.status).toBe('active');

    adapter.emitTimeout(handle);

    const expired = coordinator.getRecord('clr-timeout');
    expect(expired?.status).toBe(Status.EXPIRED);
    expect(expired?.response).toBeUndefined();
    expect(stage.status).toBe('active');
  });

  it('applies timeout fallback with assumedDefault for non-blocking clarifications', () => {
    const adapter = new FakeClarificationAdapter();
    const stage = makeStageRecord('spec');
    stage.status = 'active';

    const coordinator = new ClarificationCoordinator({
      adapter,
      getStageRecord: () => stage,
      updateStageRecord: (_stageId, updater) => {
        const next = updater(stage);
        Object.assign(stage, next);
        return { ...stage };
      },
      applyResolution: (record) => [makeArtifact(`fallback-${record.clarificationId}`)],
      now: () => '2026-04-20T09:14:00.000Z',
      createId: () => 'clr-timeout',
    });

    const [record] = coordinator.open([{
      pipelineId: 'pipe-5',
      stageId: 'spec',
      stageAttempt: 1,
      type: ClarificationType.BOUNDARY,
      blockingLevel: BlockingLevel.NON_BLOCKING,
      targetType: 'user',
      question: 'Confirm retry scope.',
      sourceArtifacts: [makeArtifact('spec-draft')],
      impactScope: ['FR-11'],
      assumedDefault: 'Retry scope stays inside current module.',
      resolutionSinks: [ResolutionSink.SPEC_PACKAGE],
    }]);

    const handle = coordinator.dispatch(record!);
    expect(stage.status).toBe('active');

    adapter.emitTimeout(handle);

    const settled = coordinator.getRecord('clr-timeout');
    expect(settled?.status).toBe(Status.SETTLED);
    expect(settled?.response).toBe('Retry scope stays inside current module.');
    expect(stage.status).toBe('active');
  });

  it('writes resolution artifacts to sink files when artifactBasePath is set (AC-4.44)', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-coord-sink-'));

    const adapter = new FakeClarificationAdapter();
    const stage = makeStageRecord('spec');

    const coordinator = new ClarificationCoordinator({
      adapter,
      getStageRecord: () => stage,
      updateStageRecord: (_stageId: any, updater: any) => {
        const next = updater(stage);
        Object.assign(stage, next);
        return { ...stage };
      },
      artifactBasePath: tmpDir,
      now: () => '2026-04-20T09:14:00.000Z',
      createId: () => 'clr-sink-test',
    });

    const [record] = coordinator.open([{
      pipelineId: 'pipe-sink',
      stageId: 'spec',
      stageAttempt: 1,
      type: ClarificationType.DECISION,
      blockingLevel: BlockingLevel.BLOCKING,
      targetType: 'user',
      question: 'Use event sourcing?',
      sourceArtifacts: [makeArtifact('spec-draft')],
      impactScope: ['FR-11'],
      resolutionSinks: [ResolutionSink.SPEC_PACKAGE, ResolutionSink.FACT],
    }]);

    coordinator.dispatch(record!);
    adapter.emitResponse({
      clarificationId: 'clr-sink-test',
      responderId: 'user-1',
      content: 'Yes, use event sourcing.',
      receivedAt: '2026-04-20T09:15:00.000Z',
    });

    const artifacts = coordinator.applyResolution('clr-sink-test');

    // Should have artifacts for both sinks
    expect(artifacts).toHaveLength(2);
    expect(artifacts.map((a: any) => a.type)).toContain('clarification-spec-package');
    expect(artifacts.map((a: any) => a.type)).toContain('clarification-fact');

    // Files should exist on disk
    for (const art of artifacts) {
      expect(fs.existsSync(art.path)).toBe(true);
    }

    // Settled record should have the artifacts
    const settled = coordinator.getRecord('clr-sink-test');
    expect(settled?.settledArtifacts).toHaveLength(2);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes ADR format when sink is ADR with artifactBasePath (AC-4.47)', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-coord-adr-'));

    const adapter = new FakeClarificationAdapter();
    const stage = makeStageRecord('spec');

    const coordinator = new ClarificationCoordinator({
      adapter,
      getStageRecord: () => stage,
      updateStageRecord: (_stageId: any, updater: any) => {
        const next = updater(stage);
        Object.assign(stage, next);
        return { ...stage };
      },
      artifactBasePath: tmpDir,
      now: () => '2026-04-20T09:14:00.000Z',
      createId: () => 'clr-adr-test',
    });

    const [record] = coordinator.open([{
      pipelineId: 'pipe-adr',
      stageId: 'spec',
      stageAttempt: 1,
      type: ClarificationType.DECISION,
      blockingLevel: BlockingLevel.BLOCKING,
      targetType: 'user',
      question: 'Should we use gRPC or REST?',
      sourceArtifacts: [makeArtifact('spec-draft')],
      impactScope: ['FR-03'],
      resolutionSinks: [ResolutionSink.ADR],
    }]);

    coordinator.dispatch(record!);
    adapter.emitResponse({
      clarificationId: 'clr-adr-test',
      responderId: 'user-1',
      content: 'Use gRPC for internal, REST for external.',
      receivedAt: '2026-04-20T09:15:00.000Z',
    });

    const artifacts = coordinator.applyResolution('clr-adr-test');

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]!.type).toBe('clarification-adr');
    expect(artifacts[0]!.path).toMatch(/decisions\/ADR-1-/);

    const content = fs.readFileSync(artifacts[0]!.path, 'utf-8');
    expect(content).toContain('# ADR-1:');
    expect(content).toContain('## Context');
    expect(content).toContain('## Decision');
    expect(content).toContain('Use gRPC for internal, REST for external.');
    expect(content).toContain('## Consequences');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('combines callback artifacts with sink artifacts when both are configured (AC-4.44)', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-coord-both-'));

    const adapter = new FakeClarificationAdapter();
    const stage = makeStageRecord('spec');

    const coordinator = new ClarificationCoordinator({
      adapter,
      getStageRecord: () => stage,
      updateStageRecord: (_stageId: any, updater: any) => {
        const next = updater(stage);
        Object.assign(stage, next);
        return { ...stage };
      },
      applyResolution: (record) => [makeArtifact(`callback-${record.clarificationId}`)],
      artifactBasePath: tmpDir,
      now: () => '2026-04-20T09:14:00.000Z',
      createId: () => 'clr-both-test',
    });

    const [record] = coordinator.open([{
      pipelineId: 'pipe-both',
      stageId: 'spec',
      stageAttempt: 1,
      type: ClarificationType.CORRECTION,
      blockingLevel: BlockingLevel.BLOCKING,
      targetType: 'user',
      question: 'Fix the boundary?',
      sourceArtifacts: [],
      impactScope: ['FR-01'],
      resolutionSinks: [ResolutionSink.SPEC_PACKAGE],
    }]);

    coordinator.dispatch(record!);
    adapter.emitResponse({
      clarificationId: 'clr-both-test',
      responderId: 'user-1',
      content: 'Yes, fix it.',
      receivedAt: '2026-04-20T09:15:00.000Z',
    });

    const artifacts = coordinator.applyResolution('clr-both-test');

    // 1 from callback + 1 from sink writer
    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]!.id).toBe('callback-clr-both-test');
    expect(artifacts[1]!.type).toBe('clarification-spec-package');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
