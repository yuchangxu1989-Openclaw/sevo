/**
 * ClarificationCoordinator — additional core flow tests.
 * Covers: scan → open → dispatch → resolve → apply → resume lifecycle.
 */

import { describe, it, expect } from 'vitest';
import type { StageRecord, ArtifactRef } from '../../types/index.js';
import {
  ClarificationCoordinator,
  type HostClarificationAdapter,
  type ClarificationCoordinatorOptions,
} from '../clarification-coordinator.js';
import {
  BlockingLevel,
  ClarificationType,
  Status,
  type ClarificationFinding,
  type ClarificationHandle,
  type ClarificationResponse,
  type ClarificationScanRule,
} from '../clarification-types.js';

function createMockAdapter(): HostClarificationAdapter & {
  responseCallbacks: Array<(r: ClarificationResponse) => void>;
  timeoutCallbacks: Array<(h: ClarificationHandle) => void>;
  dispatched: Array<{ target: unknown; payload: unknown }>;
} {
  const adapter = {
    responseCallbacks: [] as Array<(r: ClarificationResponse) => void>,
    timeoutCallbacks: [] as Array<(h: ClarificationHandle) => void>,
    dispatched: [] as Array<{ target: unknown; payload: unknown }>,
    requestClarification(target: unknown, payload: unknown): ClarificationHandle {
      adapter.dispatched.push({ target, payload });
      return {
        clarificationId: (payload as { clarificationId: string }).clarificationId,
        targetType: 'user',
        dispatchedAt: '2026-01-01T00:00:00Z',
        timeoutMs: 86400000,
      };
    },
    onClarificationResponse(cb: (r: ClarificationResponse) => void) {
      adapter.responseCallbacks.push(cb);
    },
    onClarificationTimeout(cb: (h: ClarificationHandle) => void) {
      adapter.timeoutCallbacks.push(cb);
    },
  };
  return adapter;
}

function createStageRecords(): Map<string, StageRecord> {
  const records = new Map<string, StageRecord>();
  records.set('spec', {
    stageId: 'spec',
    status: 'active',
    artifacts: [],
    attempt: 1,
  });
  return records;
}

function createCoordinator(
  adapter: ReturnType<typeof createMockAdapter>,
  stageRecords: Map<string, StageRecord>,
  rules?: ClarificationScanRule[],
): ClarificationCoordinator {
  let idCounter = 0;
  const opts: ClarificationCoordinatorOptions = {
    adapter,
    getStageRecord: (id) => stageRecords.get(id),
    updateStageRecord: (id, updater) => {
      const current = stageRecords.get(id)!;
      const updated = updater(current);
      stageRecords.set(id, updated);
      return updated;
    },
    rules: rules ?? [],
    defaultTimeoutMs: 86400000,
    now: () => '2026-01-01T00:00:00Z',
    createId: () => `clr-${++idCounter}`,
  };
  return new ClarificationCoordinator(opts);
}

describe('ClarificationCoordinator core flow', () => {
  it('full lifecycle: open → dispatch → resolve → apply → resume', () => {
    const adapter = createMockAdapter();
    const stageRecords = createStageRecords();
    const coordinator = createCoordinator(adapter, stageRecords);

    const finding: ClarificationFinding = {
      pipelineId: 'pipe-1',
      stageId: 'spec',
      stageAttempt: 1,
      type: ClarificationType.BOUNDARY,
      blockingLevel: BlockingLevel.BLOCKING,
      targetType: 'user',
      targetId: 'user-1',
      question: 'What is the max retry count?',
      sourceArtifacts: [],
      impactScope: ['spec'],
    };

    // Open
    const records = coordinator.open([finding]);
    expect(records).toHaveLength(1);
    expect(records[0]!.status).toBe(Status.OPEN);
    expect(stageRecords.get('spec')!.status).toBe('blocked');

    // Dispatch
    const handle = coordinator.dispatch(records[0]!);
    expect(handle.clarificationId).toBe(records[0]!.clarificationId);
    expect(adapter.dispatched).toHaveLength(1);

    // Resolve
    const resolved = coordinator.resolve(records[0]!.clarificationId, {
      clarificationId: records[0]!.clarificationId,
      responderId: 'user-1',
      content: 'Max retry count is 3.',
      receivedAt: '2026-01-01T01:00:00Z',
    });
    expect(resolved.status).toBe(Status.RESOLVED);

    // Apply
    const artifacts = coordinator.applyResolution(records[0]!.clarificationId);
    expect(coordinator.getRecord(records[0]!.clarificationId)!.status).toBe(Status.SETTLED);

    // Resume
    const transition = coordinator.resumeStage('spec', records[0]!.clarificationId);
    expect(transition.from).toBe('blocked');
    expect(transition.to).toBe('active');
    expect(stageRecords.get('spec')!.status).toBe('active');
  });

  it('scan with custom rule produces findings', () => {
    const adapter = createMockAdapter();
    const stageRecords = createStageRecords();

    const rule: ClarificationScanRule = {
      id: 'test-rule',
      evaluate(stageRecord, artifacts): ClarificationFinding[] {
        if (stageRecord.stageId === 'spec') {
          return [{
            pipelineId: 'pipe-1',
            stageId: 'spec',
            type: ClarificationType.DECISION,
            blockingLevel: BlockingLevel.NON_BLOCKING,
            targetType: 'user',
            question: 'Which database?',
            sourceArtifacts: [],
            impactScope: ['contract'],
          }];
        }
        return [];
      },
    };

    const coordinator = createCoordinator(adapter, stageRecords, [rule]);
    const findings = coordinator.scan(stageRecords.get('spec')!, []);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.question).toBe('Which database?');
  });

  it('non-blocking clarification does not block stage', () => {
    const adapter = createMockAdapter();
    const stageRecords = createStageRecords();
    const coordinator = createCoordinator(adapter, stageRecords);

    const finding: ClarificationFinding = {
      pipelineId: 'pipe-1',
      stageId: 'spec',
      stageAttempt: 1,
      type: ClarificationType.EXPERIENCE,
      blockingLevel: BlockingLevel.NON_BLOCKING,
      targetType: 'user',
      question: 'Any preferred naming convention?',
      sourceArtifacts: [],
      impactScope: [],
    };

    coordinator.open([finding]);
    expect(stageRecords.get('spec')!.status).toBe('active');
  });

  it('listRecords returns all opened records', () => {
    const adapter = createMockAdapter();
    const stageRecords = createStageRecords();
    const coordinator = createCoordinator(adapter, stageRecords);

    const findings: ClarificationFinding[] = [
      {
        pipelineId: 'pipe-1', stageId: 'spec', stageAttempt: 1,
        type: ClarificationType.BOUNDARY, blockingLevel: BlockingLevel.NON_BLOCKING,
        targetType: 'user', question: 'Q1?', sourceArtifacts: [], impactScope: [],
      },
      {
        pipelineId: 'pipe-1', stageId: 'spec', stageAttempt: 1,
        type: ClarificationType.DECISION, blockingLevel: BlockingLevel.NON_BLOCKING,
        targetType: 'user', question: 'Q2?', sourceArtifacts: [], impactScope: [],
      },
    ];

    coordinator.open(findings);
    expect(coordinator.listRecords()).toHaveLength(2);
  });

  it('throws when resolving unknown clarification', () => {
    const adapter = createMockAdapter();
    const stageRecords = createStageRecords();
    const coordinator = createCoordinator(adapter, stageRecords);

    expect(() => coordinator.resolve('nonexistent', {
      clarificationId: 'nonexistent',
      responderId: 'x',
      content: 'y',
      receivedAt: '2026-01-01T00:00:00Z',
    })).toThrow('Unknown clarification');
  });

  it('throws when applying resolution before resolving', () => {
    const adapter = createMockAdapter();
    const stageRecords = createStageRecords();
    const coordinator = createCoordinator(adapter, stageRecords);

    const records = coordinator.open([{
      pipelineId: 'pipe-1', stageId: 'spec', stageAttempt: 1,
      type: ClarificationType.BOUNDARY, blockingLevel: BlockingLevel.BLOCKING,
      targetType: 'user', question: 'Q?', sourceArtifacts: [], impactScope: [],
    }]);

    expect(() => coordinator.applyResolution(records[0]!.clarificationId))
      .toThrow('must be resolved before applyResolution');
  });
});
