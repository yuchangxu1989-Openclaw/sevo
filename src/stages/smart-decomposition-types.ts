import type { ArtifactRef, ObjectiveKeyResult } from '../types/index.js';
import type { FunctionalRequirement } from './spec-types.js';

// ── SMART Decomposition Types (FR-18: OKR→SMART→PDCA) ──────────

/** A single SMART-qualified task derived from an FR. */
export interface SmartTask {
  id: string;
  frId: string;
  /** Specific: unambiguous action statement. */
  specific: string;
  /** Measurable: how completion is verified. */
  measurable: string;
  /** Achievable: feasibility assessment. */
  achievable: string;
  /** Relevant: which KR this task traces to (empty if no OKR). */
  relevant: string;
  /** Time-bound: estimated effort or deadline. */
  timeBound: string;
  /** Optional KR id this task aligns with. */
  krId?: string;
}

/** Input for the SMART Decomposition stage. */
export interface SmartDecompositionInput {
  taskId: string;
  pipelineId?: string;
  /** FR list from the spec stage. */
  functionalRequirements: FunctionalRequirement[];
  /** OKR tree for relevance mapping (optional — graceful skip). */
  okrTree?: ObjectiveKeyResult[];
  /** KR mapping from spec stage (FR id → KR id). */
  krMapping?: Record<string, string>;
  artifactBasePath?: string;
}

/** Output of the SMART Decomposition stage. */
export interface SmartDecompositionOutput {
  tasks: SmartTask[];
  metadata: SmartDecompositionMetadata;
  artifact: ArtifactRef;
}

export interface SmartDecompositionMetadata {
  totalTasks: number;
  krCoverage: number;
  decomposedAt: string;
}

/** Request sent to the adapter for SMART decomposition. */
export interface SmartDecomposeRequest {
  functionalRequirements: FunctionalRequirement[];
  okrTree?: ObjectiveKeyResult[];
  krMapping?: Record<string, string>;
}

/** Response from the adapter with SMART-qualified tasks. */
export interface SmartDecomposeResponse {
  tasks: Array<{
    frId: string;
    specific: string;
    measurable: string;
    achievable: string;
    relevant: string;
    timeBound: string;
    krId?: string;
  }>;
}

/** Adapter SPI for SMART Decomposition stage. */
export interface SmartDecompositionStageOptions {
  adapter: {
    decomposeSmart?: (request: SmartDecomposeRequest) => Promise<SmartDecomposeResponse>;
  };
  now?: () => string;
}
