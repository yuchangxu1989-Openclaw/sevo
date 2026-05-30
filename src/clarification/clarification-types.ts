import type { ArtifactRef, StageId, StageRecord } from '../types/index.js';

// ── Ambiguity Signal Types (FR-11) ──────────────────────────────

export type AmbiguitySignalType =
  | 'acceptance-criteria-missing'
  | 'boundary-undefined'
  | 'term-undefined'
  | 'dependency-undeclared'
  | 'interface-incomplete'
  | 'data-flow-unclear'
  | 'performance-constraint-missing'
  | 'spec-contract-contradiction';

export type AmbiguitySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AmbiguitySignal {
  type: AmbiguitySignalType;
  description: string;
  location: string;
  severity: AmbiguitySeverity;
}

export interface DetectionRule {
  id: string;
  signalType: AmbiguitySignalType;
  detect(content: string): AmbiguitySignal[];
}

export interface ClarificationQuestion {
  questionId: string;
  signal: AmbiguitySignal;
  type: ClarificationType;
  impactScope: string[];
  context: string;
  suggestedOptions?: string[];
  blockingLevel: BlockingLevel;
}

export interface ClarificationResponsePayload {
  questionId: string;
  answer: string;
  convergenceConclusion: string;
  knowledgeType: ClarificationType;
}

export interface ClarificationRecordEntry {
  questions: ClarificationQuestion[];
  responses: ClarificationResponsePayload[];
  stage: StageId;
  createdAt: string;
}

export enum ClarificationType {
  CORRECTION = 'correction',
  METHODOLOGY = 'methodology',
  DECISION = 'decision',
  BOUNDARY = 'boundary',
  EXPERIENCE = 'experience',
  META = 'meta',
}

export enum BlockingLevel {
  BLOCKING = 'blocking',
  NON_BLOCKING = 'non-blocking',
}

export enum Status {
  OPEN = 'open',
  RESOLVED = 'resolved',
  SETTLED = 'settled',
  EXPIRED = 'expired',
}

export enum ResolutionSink {
  SPEC_PACKAGE = 'spec-package',
  CONTRACT_PACKAGE = 'contract-package',
  TASK_DESCRIPTION = 'task-description',
  ADR = 'adr',
  FACT = 'fact',
  METHODOLOGY = 'methodology',
  EXPERIENCE = 'experience',
  META = 'meta',
}

export type ClarificationTargetType =
  | 'user'
  | 'upstream-stage'
  | 'reviewer'
  | 'internal-owner';

export interface ClarificationFinding {
  pipelineId: string;
  stageId: StageId;
  stageAttempt?: number;
  type: ClarificationType;
  blockingLevel: BlockingLevel;
  targetType: ClarificationTargetType;
  targetId?: string;
  question: string;
  suggestedOptions?: string[];
  sourceArtifacts: ArtifactRef[];
  impactScope: string[];
  assumedDefault?: string;
  resolutionSinks?: ResolutionSink[];
  context?: string;
}

export interface ClarificationHandle {
  clarificationId: string;
  targetType: ClarificationTargetType;
  targetId?: string;
  dispatchedAt: string;
  timeoutMs?: number;
}

export interface ClarificationResponse {
  clarificationId: string;
  responderId: string;
  content: string;
  receivedAt: string;
}

export interface ClarificationStageTransition {
  stageId: StageId;
  from: StageRecord['status'];
  to: StageRecord['status'];
  triggeredBy: string;
}

export interface ClarificationTarget {
  type: ClarificationTargetType;
  id?: string;
}

export interface ClarificationPayload {
  clarificationId: string;
  question: string;
  suggestedOptions?: string[];
  context: string;
}

export interface ClarificationScanRule {
  id: string;
  evaluate(stageRecord: StageRecord, artifacts: ArtifactRef[]): ClarificationFinding[];
}

