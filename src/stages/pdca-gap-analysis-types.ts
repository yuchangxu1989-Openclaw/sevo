import type { ArtifactRef, ObjectiveKeyResult, PdcaCycleRecord } from '../types/index.js';
import type { FunctionalRequirement, AcceptanceCriteria } from './spec-types.js';

// ── PDCA Gap Analysis Types (FR-18: OKR→SMART→PDCA) ────────────

/** Structured audit finding with explicit severity. */
export interface AuditFinding {
  id: string;
  message: string;
  severity: 'critical' | 'blocker' | 'major' | 'minor' | 'info';
  artifact?: string;
}

/** Coverage status for a single KR. */
export interface KrCoverage {
  krId: string;
  description: string;
  /** FR ids that trace to this KR. */
  coveredByFrs: string[];
  /** Percentage of AC implemented (0-100). */
  implementationPct: number;
  /** Audit findings related to this KR. */
  auditFindings: (string | AuditFinding)[];
  status: 'covered' | 'partial' | 'uncovered';
}

/** A single gap identified during analysis. */
export interface PdcaGap {
  id: string;
  phase: 'plan' | 'do' | 'check' | 'act';
  severity: 'critical' | 'major' | 'minor';
  description: string;
  /** Suggested remediation. */
  remediation: string;
  /** Related KR id (if applicable). */
  krId?: string;
}

/** Full PDCA gap analysis report. */
export interface PdcaGapReport {
  /** Plan: OKR KR coverage assessment. */
  plan: {
    totalKrs: number;
    coveredKrs: number;
    krCoverageDetails: KrCoverage[];
  };
  /** Do: FR/AC implementation coverage. */
  do: {
    totalFrs: number;
    implementedFrs: number;
    totalAcs: number;
    implementedAcs: number;
  };
  /** Check: audit findings vs OKR alignment. */
  check: {
    totalFindings: number;
    criticalFindings: number;
    okrAligned: boolean;
  };
  /** Act: gaps to address in the next cycle. */
  act: {
    gaps: PdcaGap[];
    nextCycleTasks: string[];
  };
  /** Overall convergence assessment. */
  convergence: 'converged' | 'gap-remaining' | 'escalated';
  cycleRecord: PdcaCycleRecord;
}

/** Input for the PDCA Gap Analysis stage. */
export interface PdcaGapAnalysisInput {
  taskId: string;
  pipelineId?: string;
  /** OKR tree (optional — graceful skip when absent). */
  okrTree?: ObjectiveKeyResult[];
  /** KR mapping from spec stage (FR id → KR id). */
  krMapping?: Record<string, string>;
  /** All FRs from the spec. */
  functionalRequirements: FunctionalRequirement[];
  /** Implementation status per FR (FR id → implemented). */
  implementationStatus?: Record<string, boolean>;
  /** Implementation status per AC (AC id → implemented). */
  acImplementationStatus?: Record<string, boolean>;
  /** Audit findings (structured preferred; plain strings accepted for backward compat). */
  auditFindings?: (string | AuditFinding)[];
  /** Current PDCA cycle number (1-based). */
  cycleNumber?: number;
  artifactBasePath?: string;
}

/** Output of the PDCA Gap Analysis stage. */
export interface PdcaGapAnalysisOutput {
  report: PdcaGapReport;
  metadata: PdcaGapAnalysisMetadata;
  artifact: ArtifactRef;
}

export interface PdcaGapAnalysisMetadata {
  totalGaps: number;
  criticalGaps: number;
  convergence: 'converged' | 'gap-remaining' | 'escalated';
  analyzedAt: string;
}

/** Request sent to the adapter for gap analysis. */
export interface PdcaAnalyzeRequest {
  okrTree?: ObjectiveKeyResult[];
  krMapping?: Record<string, string>;
  functionalRequirements: FunctionalRequirement[];
  implementationStatus?: Record<string, boolean>;
  acImplementationStatus?: Record<string, boolean>;
  auditFindings?: (string | AuditFinding)[];
  cycleNumber: number;
}

/** Response from the adapter with gap analysis. */
export interface PdcaAnalyzeResponse {
  gaps: Array<{
    phase: 'plan' | 'do' | 'check' | 'act';
    severity: 'critical' | 'major' | 'minor';
    description: string;
    remediation: string;
    krId?: string;
  }>;
  nextCycleTasks: string[];
  convergence: 'converged' | 'gap-remaining' | 'escalated';
}

/** Adapter SPI for PDCA Gap Analysis stage. */
export interface PdcaGapAnalysisStageOptions {
  adapter: {
    analyzeGaps?: (request: PdcaAnalyzeRequest) => Promise<PdcaAnalyzeResponse>;
  };
  now?: () => string;
}
