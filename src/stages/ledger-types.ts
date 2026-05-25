import type { ArtifactRef, StageRecord } from '../types/index.js';

// ── Lesson Learned ──────────────────────────────────────────────

export interface LessonLearned {
  id: string;
  category: 'process' | 'technical' | 'communication';
  description: string;
  actionable: boolean;
  suggestedAction?: string;
}

// ── Ledger Entry (stage-local, extends shared LedgerEntry) ──────

export interface LedgerEntryDetail {
  pipelineId: string;
  version: string;
  createdAt: string;
  scope: string;
  stages: StageRecord[];
  conclusion: 'delivered' | 'aborted';
  evidence: ArtifactRef[];
  clarificationRefs?: ArtifactRef[];
  responsibilities: string[];
  followUpActions: string[];
  lessons: LessonLearned[];
}

// ── Stage I/O ───────────────────────────────────────────────────

export interface LedgerStageInput {
  taskId: string;
  pipelineId: string;
  version: string;
  scope: string;
  stages: StageRecord[];
  evidence: ArtifactRef[];
  verifyPassed: boolean;
  responsibilities?: string[];
  followUpActions?: string[];
  lessons?: LessonLearned[];
  clarificationRefs?: ArtifactRef[];
  artifactBasePath?: string;
}

export interface LedgerStageOutput {
  ledgerEntry: LedgerEntryDetail;
  metadata: LedgerMetadata;
  artifact: ArtifactRef;
}

export interface LedgerMetadata {
  pipelineId: string;
  conclusion: 'delivered' | 'aborted';
  evidenceCount: number;
  lessonCount: number;
  createdAt: string;
}

// ── Adapter SPI ─────────────────────────────────────────────────

export interface LedgerPersistRequest {
  entry: LedgerEntryDetail;
}

export interface LedgerPersistResponse {
  persisted: boolean;
  error?: string;
}

export interface LedgerStageOptions {
  adapter: {
    persistEntry?: (request: LedgerPersistRequest) => Promise<LedgerPersistResponse>;
  };
  now?: () => string;
}
