/**
 * Post-Release Validation types (FR-17 + FR-18 OKR/PDCA).
 *
 * Defines the gap analysis report structure produced after a successful
 * publish/deploy. Each FR from the spec is checked against three criteria:
 *   1. Code implemented?
 *   2. Running in production/runtime?
 *   3. Usable by a stranger (first-time user)?
 *
 * When an OKR tree is present (FR-18), gap analysis is upgraded to KR-level.
 */

import type {
  ArtifactRef,
  EndStateGoal,
  ObjectiveKeyResult,
  PdcaCycleRecord,
} from '../types/index.js';
import type { L3RuntimeVerifierInput, L3ScanReport } from '../scan/types.js';

export type FrGapStatus = 'covered' | 'code-only' | 'missing';

export interface FrGapEntry {
  /** FR identifier, e.g. "FR-01". */
  frId: string;
  /** Short description of the FR. */
  summary: string;
  /** Gap status. */
  status: FrGapStatus;
  /** Human-readable explanation of the gap (empty when covered). */
  reason: string;
}

/** KR-level gap entry (FR-18, AC-18.8). */
export type KrGapStatus = 'achieved' | 'partial' | 'not-achieved';

export interface KrGapEntry {
  /** KR identifier, e.g. "KR-1". */
  krId: string;
  /** Short description. */
  description: string;
  /** Achievement status. */
  status: KrGapStatus;
  /** Achievement percentage (0-100). */
  achievementPct: number;
  /** Human-readable reason for non-achievement. */
  reason: string;
}

export interface GapAnalysisReport {
  /** Total number of FRs in the spec. */
  totalFrs: number;
  /** Number of FRs fully covered (code + runtime + usable). */
  coveredCount: number;
  /** Number of FRs with code but not running or not usable. */
  codeOnlyCount: number;
  /** Number of FRs completely missing. */
  missingCount: number;
  /** Per-FR breakdown. */
  entries: FrGapEntry[];
  /** Overall gap count (codeOnly + missing). */
  gaps: number;
  /** ISO timestamp of the analysis. */
  analyzedAt: string;
  /** KR-level entries when OKR tree is present (FR-18, AC-18.8). */
  krEntries?: KrGapEntry[];
  /** KR-level gap count (FR-18, AC-18.8). */
  krGaps?: number;
  /** FR-29 L3 runtime verification report when configured. */
  tieredRuntime?: L3ScanReport;
}

export interface PostReleaseValidationInput {
  /** Pipeline ID. */
  pipelineId: string;
  /** Project slug. */
  projectSlug: string;
  /** List of FR entries to validate against. */
  frList: Array<{ frId: string; summary: string }>;
  /** Artifacts from the deploy/verify stages. */
  deployArtifacts: ArtifactRef[];
  /** End-state goal (FR-18, optional). */
  endStateGoal?: EndStateGoal;
  /** OKR tree (FR-18, optional). */
  okrTree?: ObjectiveKeyResult[];
  /** FR-29 L3 runtime verification config. Runs before clean-install verification. */
  runtimeVerification?: L3RuntimeVerifierInput;
  /** PDCA max cycles (FR-18, AC-18.11, default 3). */
  maxPdcaCycles?: number;
}

export interface PostReleaseValidationOutput {
  /** The gap analysis report. */
  report: GapAnalysisReport;
  /** Suggested fix tasks for gaps found. */
  fixTasks: Array<{ frId: string; description: string }>;
  /** Whether the pipeline can proceed to completion. */
  canComplete: boolean;
  /** PDCA cycle records (FR-18, AC-18.11). */
  pdcaCycles?: PdcaCycleRecord[];
}
