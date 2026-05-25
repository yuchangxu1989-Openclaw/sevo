/**
 * Contract Review Gate types — four-party parallel review (FR-04).
 *
 * Product (requirement coverage), Development (feasibility),
 * Quality (rigor), Experience (UX/usability — optional when hasUI=false).
 */

import type { GateConclusion, ArtifactRef } from '../types/index.js';

/** The four review perspectives for contract review (experience optional when hasUI=false). */
export type ReviewPerspective = 'product' | 'development' | 'quality' | 'experience';

/** A single finding from a perspective review. */
export interface ContractFinding {
  id: string;
  perspective: ReviewPerspective;
  severity: 'blocker' | 'warning';
  message: string;
  artifact?: string;
}

/** Result of one perspective's review. */
export interface PerspectiveReview {
  perspective: ReviewPerspective;
  conclusion: GateConclusion;
  findings: ContractFinding[];
  reviewer: string;
}

/** A fix requirement derived from a blocker finding. */
export interface FixRequirement {
  findingId: string;
  responsibleArtifact: string;
  fixDescription: string;
  reviewResponsible: ReviewPerspective;
}

/** Aggregated bundle of all perspective reviews (three or four depending on hasUI). */
export interface ContractReviewBundle {
  reviews: PerspectiveReview[];
  gateConclusion: GateConclusion;
  blockers: ContractFinding[];
  fixRequirements: FixRequirement[];
}

/** Input to the Contract Review Gate. */
export interface ContractReviewGateInput {
  contractPackage: ArtifactRef;
  architectureDecisions?: ArtifactRef[];
  reviewRules?: ContractReviewRule[];
}

/** Output from the Contract Review Gate. */
export interface ContractReviewGateOutput {
  reviewBundle: ContractReviewBundle;
  metadata: {
    gateId: string;
    evaluatedAt: string;
    perspectiveCount: number;
  };
}

/** Pluggable review rule for a specific perspective. */
export interface ContractReviewRule {
  readonly id: string;
  readonly perspective: ReviewPerspective;
  evaluate(input: ContractReviewGateInput): ContractFinding[];
}
