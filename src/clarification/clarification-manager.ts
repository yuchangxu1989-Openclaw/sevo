import { randomUUID } from 'node:crypto';

import type { StageId } from '../types/index.js';
import {
  BlockingLevel,
  ClarificationType,
  type AmbiguitySignal,
  type ClarificationQuestion,
  type ClarificationRecordEntry,
  type ClarificationResponsePayload,
} from './clarification-types.js';

/**
 * Manages the lifecycle of clarification questions and responses.
 * Generates structured questions from ambiguity signals, processes responses,
 * and organizes records by stage and knowledge type (FR-11).
 */
export class ClarificationManager {
  private readonly records: ClarificationRecordEntry[] = [];
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(options?: { createId?: () => string; now?: () => string }) {
    this.createId = options?.createId ?? (() => `cq-${randomUUID()}`);
    this.now = options?.now ?? (() => new Date().toISOString());
  }

  generateQuestions(signals: AmbiguitySignal[]): ClarificationQuestion[] {
    return signals.map((signal) => ({
      questionId: this.createId(),
      signal,
      type: mapSignalToClarificationType(signal),
      impactScope: inferImpactScope(signal),
      context: `Detected ${signal.type} at ${signal.location}: ${signal.description}`,
      blockingLevel: inferBlockingLevel(signal),
    }));
  }

  processResponse(
    question: ClarificationQuestion,
    response: ClarificationResponsePayload,
    stage: StageId,
  ): ClarificationRecordEntry {
    const record: ClarificationRecordEntry = {
      questions: [question],
      responses: [response],
      stage,
      createdAt: this.now(),
    };
    this.records.push(record);
    return record;
  }

  getRecordsByStage(stage: StageId): ClarificationRecordEntry[] {
    return this.records.filter((r) => r.stage === stage);
  }

  getRecordsByKnowledgeType(type: ClarificationType): ClarificationRecordEntry[] {
    return this.records.filter((r) =>
      r.responses.some((resp) => resp.knowledgeType === type),
    );
  }

  getAllRecords(): ClarificationRecordEntry[] {
    return [...this.records];
  }
}

// ── Mapping helpers ─────────────────────────────────────────────

function mapSignalToClarificationType(signal: AmbiguitySignal): ClarificationType {
  switch (signal.type) {
    case 'spec-contract-contradiction':
      return ClarificationType.CORRECTION;
    case 'boundary-undefined':
      return ClarificationType.BOUNDARY;
    case 'acceptance-criteria-missing':
    case 'interface-incomplete':
    case 'data-flow-unclear':
      return ClarificationType.DECISION;
    case 'performance-constraint-missing':
    case 'dependency-undeclared':
      return ClarificationType.METHODOLOGY;
    case 'term-undefined':
      return ClarificationType.BOUNDARY;
    default:
      return ClarificationType.DECISION;
  }
}

function inferImpactScope(signal: AmbiguitySignal): string[] {
  const scopes: string[] = [signal.location];
  if (signal.severity === 'critical' || signal.severity === 'high') {
    scopes.push('downstream-stages');
  }
  return scopes;
}

function inferBlockingLevel(signal: AmbiguitySignal): BlockingLevel {
  if (signal.severity === 'critical' || signal.severity === 'high') {
    return BlockingLevel.BLOCKING;
  }
  return BlockingLevel.NON_BLOCKING;
}
