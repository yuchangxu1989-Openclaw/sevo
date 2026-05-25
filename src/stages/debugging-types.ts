import type { ArtifactRef } from '../types/index.js';

// ── Debugging Phases ────────────────────────────────────────────

export type DebuggingPhase = 'reproduce' | 'locate' | 'analyze' | 'verify';

export const DEBUGGING_PHASE_ORDER: readonly DebuggingPhase[] = [
  'reproduce',
  'locate',
  'analyze',
  'verify',
];

// ── Evidence ────────────────────────────────────────────────────

export type DebuggingEvidenceType =
  | 'reproduction_steps'
  | 'stack_trace'
  | 'log_excerpt'
  | 'root_cause'
  | 'fix_diff'
  | 'verification_result';

export interface DebuggingEvidence {
  type: DebuggingEvidenceType;
  content: string;
  timestamp: string;
}

// ── Phase Record ────────────────────────────────────────────────

export interface DebuggingPhaseRecord {
  phase: DebuggingPhase;
  status: 'passed' | 'failed' | 'skipped';
  evidence: DebuggingEvidence[];
  conclusion: string;
}

// ── Debugging Record ────────────────────────────────────────────

export interface DebuggingRecord {
  issueId: string;
  phases: DebuggingPhaseRecord[];
  rootCause: string | null;
  fixApplied: boolean;
  regressionCovered: boolean;
}

// ── Stage I/O ───────────────────────────────────────────────────

export interface DebuggingIssue {
  id: string;
  title: string;
  description: string;
  reproductionHint?: string;
}

export interface DebuggingStageInput {
  taskId: string;
  pipelineId?: string;
  issues: DebuggingIssue[];
  artifactBasePath?: string;
}

export interface DebuggingStageOutput {
  records: DebuggingRecord[];
  metadata: DebuggingMetadata;
  artifact: ArtifactRef;
}

export interface DebuggingMetadata {
  totalIssues: number;
  resolved: number;
  unresolved: number;
  generatedAt: string;
}

// ── Adapter SPI ─────────────────────────────────────────────────

export interface DebuggingPhaseRequest {
  issue: DebuggingIssue;
  phase: DebuggingPhase;
  priorPhases: DebuggingPhaseRecord[];
}

export interface DebuggingPhaseResponse {
  status: 'passed' | 'failed';
  evidence: Array<{ type: DebuggingEvidenceType; content: string }>;
  conclusion: string;
}

export interface DebuggingStageOptions {
  adapter: {
    executePhase?: (request: DebuggingPhaseRequest) => Promise<DebuggingPhaseResponse>;
  };
  now?: () => string;
}
