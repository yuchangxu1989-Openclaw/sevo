import type { ArtifactRef } from '../types/index.js';

// ── Commercial Acceptance Check ────────────────────────────────

export type CommercialCheckStatus = 'pass' | 'fail' | 'skip';

export interface CommercialAcceptanceCheck {
  id: string;
  description: string;
  category: 'package' | 'readme' | 'security' | 'license' | 'release' | 'version';
  status: CommercialCheckStatus;
  detail?: string;
}

export interface CommercialAcceptanceChecklist {
  checks: CommercialAcceptanceCheck[];
  allPassed: boolean;
  failedChecks: CommercialAcceptanceCheck[];
}

// ── Stage I/O ───────────────────────────────────────────────────

export interface CommercialAcceptanceTarget {
  id: string;
  description: string;
  category: 'package' | 'readme' | 'security' | 'license' | 'release' | 'version';
}

export interface CommercialAcceptanceStageInput {
  taskId: string;
  pipelineId?: string;
  targets: CommercialAcceptanceTarget[];
  artifactBasePath?: string;
}

export interface CommercialAcceptanceStageOutput {
  checklist: CommercialAcceptanceChecklist;
  metadata: CommercialAcceptanceMetadata;
  artifact: ArtifactRef;
}

export interface CommercialAcceptanceMetadata {
  totalChecks: number;
  passed: number;
  failed: number;
  skipped: number;
  authoredAt: string;
  authorRole: 'product';
}

// ── Adapter SPI ─────────────────────────────────────────────────

export interface CommercialAcceptanceCheckRequest {
  target: CommercialAcceptanceTarget;
}

export interface CommercialAcceptanceCheckResponse {
  status: CommercialCheckStatus;
  detail?: string;
}

export interface CommercialAcceptanceStageOptions {
  adapter: {
    runCommercialCheck?: (request: CommercialAcceptanceCheckRequest) => Promise<CommercialAcceptanceCheckResponse>;
  };
  now?: () => string;
}
