import type { ArtifactRef } from '../types/index.js';

// ── Verification Result ─────────────────────────────────────────

export type VerifyStatus = 'pass' | 'fail' | 'skip';

export interface VerificationCheck {
  id: string;
  description: string;
  category: 'functional' | 'nfr' | 'deliverability';
  status: VerifyStatus;
  detail?: string;
}

export interface VerificationBundle {
  checks: VerificationCheck[];
  allPassed: boolean;
  failedChecks: VerificationCheck[];
  deliverable: boolean;
}

// ── Stage I/O ───────────────────────────────────────────────────

export interface VerifyTarget {
  id: string;
  description: string;
  category: 'functional' | 'nfr' | 'deliverability';
}

export interface VerifyStageInput {
  taskId: string;
  pipelineId?: string;
  releaseArtifact: ArtifactRef;
  targets: VerifyTarget[];
  artifactBasePath?: string;
}

export interface VerifyStageOutput {
  verificationBundle: VerificationBundle;
  metadata: VerifyMetadata;
  artifact: ArtifactRef;
  deliverable: boolean;
}

export interface VerifyMetadata {
  totalChecks: number;
  passed: number;
  failed: number;
  skipped: number;
  verifiedAt: string;
}

// ── Adapter SPI ─────────────────────────────────────────────────

export interface VerifyCheckRequest {
  target: VerifyTarget;
  releaseArtifact: ArtifactRef;
}

export interface VerifyCheckResponse {
  status: VerifyStatus;
  detail?: string;
}

export interface VerifyStageOptions {
  adapter: {
    runVerification?: (request: VerifyCheckRequest) => Promise<VerifyCheckResponse>;
  };
  now?: () => string;
}
