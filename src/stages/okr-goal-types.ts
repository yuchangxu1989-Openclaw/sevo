import type { ArtifactRef, ObjectiveKeyResult, EndStateGoal } from '../types/index.js';

// ── OKR Goal Declaration Types (FR-18: OKR→SMART→PDCA) ─────────

/** Input for the OKR Goal Declaration stage. */
export interface OkrGoalInput {
  taskId: string;
  pipelineId?: string;
  /** One-sentence end-state objective. */
  endStateGoal: EndStateGoal;
  /** Optional pre-existing OKR tree for incremental refinement. */
  existingOkrTree?: ObjectiveKeyResult[];
  artifactBasePath?: string;
}

/** Output of the OKR Goal Declaration stage. */
export interface OkrGoalOutput {
  okrTree: ObjectiveKeyResult[];
  metadata: OkrGoalMetadata;
  artifact: ArtifactRef;
}

export interface OkrGoalMetadata {
  objectiveCount: number;
  totalKeyResults: number;
  declaredAt: string;
}

/** Request sent to the adapter for OKR decomposition. */
export interface OkrDecompositionRequest {
  endStateGoal: EndStateGoal;
  existingOkrTree?: ObjectiveKeyResult[];
}

/** Response from the adapter with decomposed OKR tree. */
export interface OkrDecompositionResponse {
  objectives: Array<{
    description: string;
    keyResults: Array<{
      description: string;
      measure: string;
      threshold?: string;
    }>;
  }>;
}

/** Adapter SPI for OKR Goal stage. */
export interface OkrGoalStageOptions {
  adapter: {
    decomposeOkr?: (request: OkrDecompositionRequest) => Promise<OkrDecompositionResponse>;
  };
  now?: () => string;
}
