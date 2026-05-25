import { randomUUID } from 'node:crypto';

import type { ArtifactRef, StageId, StageRecord } from '../types/index.js';
import { Status, BlockingLevel, type ClarificationFinding, type ClarificationHandle, type ClarificationPayload, type ClarificationResponse, type ClarificationScanRule, type ClarificationStageTransition, type ClarificationTarget } from './clarification-types.js';
import type { ClarificationRecord } from './clarification-record.js';
import { writeResolutionArtifacts } from './resolution-writer.js';

export interface HostClarificationAdapter {
  requestClarification(
    target: ClarificationTarget,
    payload: ClarificationPayload,
  ): ClarificationHandle;
  onClarificationResponse(callback: (response: ClarificationResponse) => void): void;
  onClarificationTimeout(callback: (handle: ClarificationHandle) => void): void;
}

export interface ClarificationCoordinatorOptions {
  adapter: HostClarificationAdapter;
  getStageRecord: (stageId: StageId) => StageRecord | undefined;
  updateStageRecord?: (
    stageId: StageId,
    updater: (record: StageRecord) => StageRecord,
  ) => StageRecord;
  applyResolution?: (record: ClarificationRecord) => ArtifactRef[];
  artifactBasePath?: string;
  rules?: ClarificationScanRule[];
  defaultTimeoutMs?: number;
  now?: () => string;
  createId?: () => string;
}

function resolveStageAttempt(stageRecord: StageRecord, fallback?: number): number {
  return stageRecord.attempt ?? fallback ?? 1;
}

function summarizeContext(record: ClarificationRecord): string {
  const scope = record.impactScope.length > 0
    ? record.impactScope.join(', ')
    : 'unspecified';
  return `stage=${record.stageId}; attempt=${record.stageAttempt}; scope=${scope}`;
}

export class ClarificationCoordinator {
  private readonly records = new Map<string, ClarificationRecord>();
  private readonly handles = new Map<string, ClarificationHandle>();
  private readonly rules: ClarificationScanRule[];
  private readonly now: () => string;
  private readonly createId: () => string;

  constructor(private readonly options: ClarificationCoordinatorOptions) {
    this.rules = [...(options.rules ?? [])];
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? (() => `clr-${randomUUID()}`);

    options.adapter.onClarificationResponse((response) => {
      this.resolve(response.clarificationId, response);
    });
    options.adapter.onClarificationTimeout((handle) => {
      this.handleTimeout(handle);
    });
  }

  scan(stageRecord: StageRecord, artifacts: ArtifactRef[]): ClarificationFinding[] {
    return this.rules.flatMap((rule) => rule.evaluate(stageRecord, artifacts));
  }

  open(findings: ClarificationFinding[]): ClarificationRecord[] {
    return findings.map((finding) => {
      const stageRecord = this.options.getStageRecord(finding.stageId);
      const stageAttempt = finding.stageAttempt
        ?? resolveStageAttempt(
          stageRecord ?? { stageId: finding.stageId, status: 'pending', artifacts: [] },
        );
      const record: ClarificationRecord = {
        schema_version: '1.0',
        clarificationId: this.createId(),
        pipelineId: finding.pipelineId,
        stageId: finding.stageId,
        stageAttempt,
        type: finding.type,
        blockingLevel: finding.blockingLevel,
        status: Status.OPEN,
        targetType: finding.targetType,
        targetId: finding.targetId,
        sourceArtifacts: [...finding.sourceArtifacts],
        impactScope: [...finding.impactScope],
        question: finding.question,
        suggestedOptions: finding.suggestedOptions ? [...finding.suggestedOptions] : undefined,
        assumedDefault: finding.assumedDefault,
        resolutionSinks: [...(finding.resolutionSinks ?? [])],
        createdAt: this.now(),
      };

      this.records.set(record.clarificationId, record);

      if (
        record.blockingLevel === BlockingLevel.BLOCKING &&
        this.options.updateStageRecord !== undefined
      ) {
        this.options.updateStageRecord(record.stageId, (current) => {
          if (resolveStageAttempt(current) !== record.stageAttempt) {
            return current;
          }
          if (current.status !== 'active') {
            return current;
          }
          return {
            ...current,
            status: 'blocked',
            blockReason: `Blocking clarification open: ${record.clarificationId}`,
          };
        });
      }

      return { ...record };
    });
  }

  dispatch(record: ClarificationRecord): ClarificationHandle {
    this.assertKnownRecord(record.clarificationId);

    const handle = this.options.adapter.requestClarification(
      { type: record.targetType, id: record.targetId },
      {
        clarificationId: record.clarificationId,
        question: record.question,
        suggestedOptions: record.suggestedOptions,
        context: summarizeContext(record),
      },
    );

    const normalizedHandle: ClarificationHandle = {
      ...handle,
      clarificationId: record.clarificationId,
      targetType: record.targetType,
      targetId: record.targetId,
      dispatchedAt: handle.dispatchedAt,
      timeoutMs: handle.timeoutMs ?? this.options.defaultTimeoutMs,
    };

    this.handles.set(record.clarificationId, normalizedHandle);
    return { ...normalizedHandle };
  }

  resolve(clarificationId: string, response: ClarificationResponse): ClarificationRecord {
    const record = this.getMutableRecord(clarificationId);

    if (record.status === Status.SETTLED) {
      return { ...record };
    }

    record.responder = response.responderId;
    record.response = response.content;
    record.resolution = response.content;
    record.resolvedAt = response.receivedAt;
    record.status = Status.RESOLVED;
    return { ...record };
  }

  applyResolution(clarificationId: string): ArtifactRef[] {
    const record = this.getMutableRecord(clarificationId);
    if (record.status !== Status.RESOLVED) {
      throw new Error(`Clarification '${clarificationId}' must be resolved before applyResolution`);
    }

    const callbackArtifacts = this.options.applyResolution?.(record) ?? [];

    // AC-4.44: Write resolution to sink-specific files when artifactBasePath is configured
    const sinkArtifacts = this.options.artifactBasePath
      ? writeResolutionArtifacts(record, this.options.artifactBasePath, this.now())
      : [];

    const settledArtifacts = [...callbackArtifacts, ...sinkArtifacts];
    record.settledArtifacts = [...settledArtifacts];
    record.settledAt = this.now();
    record.status = Status.SETTLED;
    return [...settledArtifacts];
  }

  resumeStage(stageId: StageId, clarificationId: string): ClarificationStageTransition {
    const record = this.getMutableRecord(clarificationId);
    const stageRecord = this.options.getStageRecord(stageId);
    if (!stageRecord) {
      throw new Error(`Stage '${stageId}' not found`);
    }

    const currentAttempt = resolveStageAttempt(stageRecord);
    const from = stageRecord.status;

    if (
      record.stageId !== stageId ||
      record.blockingLevel !== BlockingLevel.BLOCKING ||
      record.status !== Status.SETTLED ||
      record.stageAttempt !== currentAttempt ||
      from !== 'blocked' ||
      this.countBlockingOutstanding(stageId, currentAttempt) > 0 ||
      this.options.updateStageRecord === undefined
    ) {
      return {
        stageId,
        from,
        to: from,
        triggeredBy: clarificationId,
      };
    }

    const updated = this.options.updateStageRecord(stageId, (current) => {
      if (resolveStageAttempt(current) !== currentAttempt || current.status !== 'blocked') {
        return current;
      }
      return {
        ...current,
        status: 'active',
        blockReason: undefined,
      };
    });

    return {
      stageId,
      from,
      to: updated.status,
      triggeredBy: clarificationId,
    };
  }

  getRecord(clarificationId: string): ClarificationRecord | undefined {
    const record = this.records.get(clarificationId);
    return record ? { ...record } : undefined;
  }

  listRecords(): ClarificationRecord[] {
    return [...this.records.values()].map((record) => ({ ...record }));
  }

  private handleTimeout(handle: ClarificationHandle): void {
    const record = this.records.get(handle.clarificationId);
    if (!record || record.status !== Status.OPEN) {
      return;
    }

    if (record.blockingLevel === BlockingLevel.BLOCKING) {
      record.status = Status.EXPIRED;
      return;
    }

    if (!record.assumedDefault) {
      return;
    }

    this.resolve(record.clarificationId, {
      clarificationId: record.clarificationId,
      responderId: 'timeout-fallback',
      content: record.assumedDefault,
      receivedAt: this.now(),
    });
    this.applyResolution(record.clarificationId);
    this.resumeStage(record.stageId, record.clarificationId);
  }

  private countBlockingOutstanding(stageId: StageId, attempt: number): number {
    return [...this.records.values()].filter((record) => (
      record.stageId === stageId &&
      record.stageAttempt === attempt &&
      record.blockingLevel === BlockingLevel.BLOCKING &&
      record.status !== Status.SETTLED
    )).length;
  }

  private assertKnownRecord(clarificationId: string): void {
    if (!this.records.has(clarificationId)) {
      throw new Error(`Unknown clarification '${clarificationId}'`);
    }
  }

  private getMutableRecord(clarificationId: string): ClarificationRecord {
    const record = this.records.get(clarificationId);
    if (!record) {
      throw new Error(`Unknown clarification '${clarificationId}'`);
    }
    return record;
  }
}
