import type { ArtifactRef } from '../types/index.js';

// ── UX Acceptance Check ────────────────────────────────────────

export type UxCheckStatus = 'pass' | 'fail' | 'skip';

export interface UxAcceptanceCheck {
  id: string;
  description: string;
  category: 'install' | 'first-run' | 'core-flow' | 'error-ux' | 'docs';
  status: UxCheckStatus;
  detail?: string;
}

export interface UxAcceptanceChecklist {
  checks: UxAcceptanceCheck[];
  allPassed: boolean;
  failedChecks: UxAcceptanceCheck[];
}

// ── SOP Document (AC-4.24u2) ─────────────────────────────────────

/** A single step in a UX acceptance SOP document. */
export interface UxSopStep {
  /** Step number. */
  step: number;
  /** Page or navigation path. */
  page: string;
  /** Interaction action to perform. */
  action: string;
  /** Expected result after the action. */
  expectedResult: string;
  /** Placeholder for screenshot file path. */
  screenshotPath?: string;
}

/** Standard Operating Procedure document for UX acceptance (AC-4.24u2). */
export interface UxSopDocument {
  /** Task identifier this SOP belongs to. */
  taskId: string;
  /** When this SOP was generated. */
  generatedAt: string;
  /** Ordered list of verification steps. */
  steps: UxSopStep[];
}

// ── Stage I/O ───────────────────────────────────────────────────

export interface UxAcceptanceTarget {
  id: string;
  description: string;
  category: 'install' | 'first-run' | 'core-flow' | 'error-ux' | 'docs';
}

export interface UxAcceptanceStageInput {
  taskId: string;
  pipelineId?: string;
  targets: UxAcceptanceTarget[];
  artifactBasePath?: string;
}

export interface UxAcceptanceStageOutput {
  checklist: UxAcceptanceChecklist;
  metadata: UxAcceptanceMetadata;
  artifact: ArtifactRef;
  /** AC-4.24u2: Reusable SOP document generated from the acceptance steps. */
  sopDocument?: UxSopDocument;
  /** AC-4.24u2: Artifact ref for the persisted SOP file. */
  sopArtifact?: ArtifactRef;
}

export interface UxAcceptanceMetadata {
  totalChecks: number;
  passed: number;
  failed: number;
  skipped: number;
  authoredAt: string;
  authorRole: 'ux';
}

// ── Adapter SPI ─────────────────────────────────────────────────

export interface UxAcceptanceCheckRequest {
  target: UxAcceptanceTarget;
}

export interface UxAcceptanceCheckResponse {
  status: UxCheckStatus;
  detail?: string;
}

export interface UxAcceptanceStageOptions {
  adapter: {
    runUxCheck?: (request: UxAcceptanceCheckRequest) => Promise<UxAcceptanceCheckResponse>;
  };
  now?: () => string;
}
