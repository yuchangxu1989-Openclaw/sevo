import type { ArtifactRef } from '../types/index.js';

export type PublishTarget = string | string[];

// ── Activation / Skip ──────────────────────────────────────────

export interface CommercializationGateActivationConfig {
  publishTarget?: PublishTarget;
}

export interface CommercializationGateSkipContext {
  taskId: string;
  pipelineId?: string;
  projectRoot: string;
  publishTarget?: PublishTarget;
  reason: string;
  stageId: 'publish-generalization-gate';
  skippedAt: string;
}

export type CommercializationGateSkipHandler = (
  context: CommercializationGateSkipContext,
) => Promise<void> | void;

// ── Five-Layer Check Model ─────────────────────────────────────

export type CommercializationCheckLayer =
  | 'code-cleanliness'
  | 'package-integrity'
  | 'documentation'
  | 'buildability'
  | 'out-of-box'
  | 'error-handling';

export type CommercializationCheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

export interface CommercializationCheckItem {
  layer: CommercializationCheckLayer;
  id: string;
  description: string;
  status: CommercializationCheckStatus;
  detail?: string;
  suggestion?: string;
  /** When true, deploy-stage must actually execute this check (e.g., run build/test) for full verification. */
  requiresExternalVerification?: boolean;
}

export interface CommercializationGateResult {
  passed: boolean;
  layers: Record<CommercializationCheckLayer, CommercializationCheckItem[]>;
  summary: CommercializationGateSummary;
  skippedReason?: string;
}

export interface CommercializationGateSummary {
  totalChecks: number;
  passed: number;
  failed: number;
  warned: number;
  skipped: number;
}

// ── Backward-compatible aliases ────────────────────────────────

/** @deprecated Use CommercializationCheckItem */
export type PublishCheckId =
  | 'publish-dir-non-empty'
  | 'skill-md-entry-points'
  | 'full-english'
  | 'no-internal-paths'
  | 'package-json-fields'
  | 'readme-exists'
  | 'sensitive-file-scan';

/** @deprecated Use CommercializationCheckItem */
export interface PublishCheckResult {
  id: PublishCheckId | string;
  passed: boolean;
  reason?: string;
}

/** @deprecated Use CommercializationGateResult */
export type PublishGateConclusion = 'passed' | 'blocked' | 'skipped';

/** @deprecated Use CommercializationGateResult */
export interface PublishGateResult {
  conclusion: PublishGateConclusion;
  checks: PublishCheckResult[];
  failedChecks: PublishCheckResult[];
  skippedReason?: string;
}

// ── Stage I/O ──────────────────────────────────────────────────

export interface CommercializationGateInput extends CommercializationGateActivationConfig {
  taskId: string;
  pipelineId?: string;
  projectRoot: string;
  userConfirmed: boolean;
  artifactBasePath?: string;
  onSkip?: CommercializationGateSkipHandler;
  syncScript?: string;
  syncProject?: string;
  /** Specific layers to run (for incremental re-run). Omit to run all. */
  layers?: CommercializationCheckLayer[];
  /** Whether the project is a CLI project (affects out-of-box checks). */
  isCli?: boolean;
}

export interface CommercializationGateOutput {
  result: CommercializationGateResult;
  /** Legacy result for backward compatibility */
  legacyResult: PublishGateResult;
  metadata: CommercializationGateMetadata;
  artifact: ArtifactRef;
}

export interface CommercializationGateMetadata {
  publishTarget?: PublishTarget;
  totalChecks: number;
  passed: number;
  failed: number;
  warned: number;
  skipped: number;
  evaluatedAt: string;
}

// ── Backward-compatible aliases for input/output ───────────────

/** @deprecated Use CommercializationGateActivationConfig */
export type PublishGeneralizationGateActivationConfig = CommercializationGateActivationConfig;

/** @deprecated Use CommercializationGateSkipContext */
export type PublishGeneralizationGateSkipContext = CommercializationGateSkipContext;

/** @deprecated Use CommercializationGateSkipHandler */
export type PublishGeneralizationGateSkipHandler = CommercializationGateSkipHandler;

/** @deprecated Use CommercializationGateInput */
export type PublishGeneralizationGateInput = CommercializationGateInput;

/** @deprecated Use CommercializationGateOutput */
export interface PublishGeneralizationGateOutput {
  result: PublishGateResult;
  metadata: PublishGateMetadata;
  artifact: ArtifactRef;
}

/** @deprecated Use CommercializationGateMetadata */
export interface PublishGateMetadata {
  publishTarget?: PublishTarget;
  totalChecks: number;
  passed: number;
  failed: number;
  evaluatedAt: string;
}
