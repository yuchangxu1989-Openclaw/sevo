import type { ArtifactRef, GateConclusion } from '../types/index.js';

// ── Smoke Test Check ────────────────────────────────────────────

/**
 * Three dimensions per AC-4.24p:
 * - core-path: Core functionality path validation
 * - build-integrity: Build artifact completeness (dist/, package.json, etc.)
 * - entry-crash: Key entry point no-crash verification
 */
export type SmokeTestDimension = 'core-path' | 'build-integrity' | 'entry-crash';

export type SmokeTestCheckStatus = 'pass' | 'fail' | 'skip';

export interface SmokeTestCheck {
  id: string;
  dimension: SmokeTestDimension;
  description: string;
  status: SmokeTestCheckStatus;
  detail?: string;
}

// ── Smoke Test Report ───────────────────────────────────────────

export interface SmokeTestReport {
  checks: SmokeTestCheck[];
  gateConclusion: GateConclusion;
  failedChecks: SmokeTestCheck[];
  /** Reproduction steps for each failure (AC-4.24q). */
  failureDetails: SmokeTestFailureDetail[];
}

export interface SmokeTestFailureDetail {
  checkId: string;
  reproductionSteps: string;
}

// ── Stage I/O ───────────────────────────────────────────────────

export interface SmokeTestTarget {
  id: string;
  dimension: SmokeTestDimension;
  description: string;
}

export interface SmokeTestStageInput {
  taskId: string;
  pipelineId?: string;
  /** Artifacts produced by the implement stage. */
  implementationArtifacts: ArtifactRef[];
  /** Smoke test targets to verify. */
  targets: SmokeTestTarget[];
  artifactBasePath?: string;
}

export interface SmokeTestStageOutput {
  smokeTestReport: SmokeTestReport;
  metadata: SmokeTestMetadata;
  artifact: ArtifactRef;
}

export interface SmokeTestMetadata {
  gateConclusion: GateConclusion;
  totalChecks: number;
  passed: number;
  failed: number;
  skipped: number;
  executedAt: string;
}

// ── Adapter SPI ─────────────────────────────────────────────────

export interface SmokeTestCheckRequest {
  target: SmokeTestTarget;
  implementationArtifacts: ArtifactRef[];
}

export interface SmokeTestCheckResponse {
  status: SmokeTestCheckStatus;
  detail?: string;
  reproductionSteps?: string;
}

export interface SmokeTestStageOptions {
  adapter: {
    runSmokeCheck?: (request: SmokeTestCheckRequest) => Promise<SmokeTestCheckResponse>;
  };
  now?: () => string;
}
