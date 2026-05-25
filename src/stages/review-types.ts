import type { ArtifactRef, GateConclusion } from '../types/index.js';
import type { DeploymentViewReport } from './deployment-view-check.js';

// ── Review Dimensions ───────────────────────────────────────────

export type ReviewDimension = 'quality' | 'product';

export const ALL_REVIEW_DIMENSIONS: readonly ReviewDimension[] = ['quality', 'product'];

// ── Dimension Review ────────────────────────────────────────────

export interface ReviewFinding {
  id: string;
  dimension: ReviewDimension;
  severity: 'blocker' | 'warning' | 'info';
  message: string;
  artifact?: string;
}

export interface DimensionReview {
  dimension: ReviewDimension;
  conclusion: GateConclusion;
  findings: ReviewFinding[];
  reviewer: string;
}

// ── Review Bundle ───────────────────────────────────────────────

export interface ReviewFixRequirement {
  findingId: string;
  artifact: string;
  fixDescription: string;
  dimension: ReviewDimension;
}

export interface ReviewBundle {
  reviews: DimensionReview[];
  gateConclusion: GateConclusion;
  blockers: ReviewFinding[];
  fixRequirements: ReviewFixRequirement[];
  /** AC-4.24n3: configured source roots that must be scanned. */
  sourceRoots?: string[];
  /** AC-4.24n3: actual scanned directory list reported by Review. */
  scannedRoots?: string[];
  /** AC-4.24n3: source roots omitted from the scan. */
  missingSourceRoots?: string[];
  /** FR-06e: deployment view check report. */
  deploymentView?: DeploymentViewReport;
}

// ── Stage I/O ───────────────────────────────────────────────────

export interface ReviewStageInput {
  taskId: string;
  pipelineId?: string;
  implementationArtifacts: ArtifactRef[];
  artifactBasePath?: string;
  /** AC-4.24n3: configured project source roots. */
  sourceRoots?: string[];
  /** AC-4.24n3: actual directories scanned by the review executor. */
  scannedRoots?: string[];
  /** FR-06e: project root for deployment view check. */
  projectRoot?: string;
  /** FR-06e: skip deployment view check. */
  skipDeploymentCheck?: boolean;
}

export interface ReviewStageOutput {
  reviewBundle: ReviewBundle;
  metadata: ReviewMetadata;
  artifact: ArtifactRef;
}

export interface ReviewMetadata {
  gateConclusion: GateConclusion;
  totalFindings: number;
  blockerCount: number;
  evaluatedAt: string;
}

// ── Adapter SPI ─────────────────────────────────────────────────

export interface DimensionReviewRequest {
  dimension: ReviewDimension;
  implementationArtifacts: ArtifactRef[];
}

export interface DimensionReviewResponse {
  conclusion: GateConclusion;
  findings: Array<{ severity: 'blocker' | 'warning' | 'info'; message: string; artifact?: string }>;
  reviewer: string;
}

export interface ReviewStageOptions {
  adapter: {
    evaluateDimension?: (request: DimensionReviewRequest) => Promise<DimensionReviewResponse>;
  };
  now?: () => string;
}
