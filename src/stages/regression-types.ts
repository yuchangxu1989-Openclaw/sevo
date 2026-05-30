import type { ArtifactRef } from '../types/index.js';

// ── Regression Check ────────────────────────────────────────────

export type RegressionStatus = 'passed' | 'failed' | 'skipped';

export interface RegressionCheck {
  id: string;
  description: string;
  path: string;
  status: RegressionStatus;
  affectedScope?: string[];
  isRecurrencePrevention: boolean;
}

// ── Regression Bundle ───────────────────────────────────────────

export interface RegressionBundle {
  checks: RegressionCheck[];
  allPassed: boolean;
  failedChecks: RegressionCheck[];
  recurrenceChecks: RegressionCheck[];
}

// ── Stage I/O ───────────────────────────────────────────────────

export interface RegressionTarget {
  id: string;
  description: string;
  path: string;
  isRecurrencePrevention?: boolean;
}

export interface RegressionStageInput {
  taskId: string;
  pipelineId?: string;
  targets: RegressionTarget[];
  artifactBasePath?: string;
}

export interface RegressionStageOutput {
  regressionBundle: RegressionBundle;
  metadata: RegressionMetadata;
  artifact: ArtifactRef;
  deployReady: boolean;
}

export interface RegressionMetadata {
  totalChecks: number;
  passed: number;
  failed: number;
  skipped: number;
  generatedAt: string;
}

// ── Adapter SPI ─────────────────────────────────────────────────

export interface RegressionCheckRequest {
  target: RegressionTarget;
}

export interface RegressionCheckResponse {
  status: RegressionStatus;
  affectedScope?: string[];
}

export interface RegressionStageOptions {
  adapter: {
    runCheck?: (request: RegressionCheckRequest) => Promise<RegressionCheckResponse>;
  };
  now?: () => string;
}
