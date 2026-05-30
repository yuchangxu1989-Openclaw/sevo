/**
 * Contract Review Gate — four-party parallel review gate (FR-04).
 *
 * Evaluates contract package from up to four perspectives in parallel:
 *   - Product: requirement coverage completeness
 *   - Development: implementation feasibility
 *   - Quality: decision rigor and completeness
 *   - Experience: UX/usability (optional — omitted when hasUI=false)
 *
 * Gate conclusion:
 *   - All passed → passed
 *   - Any conditional (none rejected) → conditional
 *   - Any rejected → rejected
 *
 * (spec §FR-04, AC-4.13 through AC-4.16)
 */

import type { GateConclusion } from '../types/index.js';
import type {
  ReviewPerspective,
  PerspectiveReview,
  ContractFinding,
  FixRequirement,
  ContractReviewBundle,
  ContractReviewGateInput,
  ContractReviewGateOutput,
  ContractReviewRule,
} from './contract-review-types.js';

/** Full four-party perspectives (used when hasUI=true). */
const ALL_PERSPECTIVES: readonly ReviewPerspective[] = ['product', 'development', 'quality', 'experience'];

/** Core three-party perspectives (used when hasUI=false). */
const CORE_PERSPECTIVES: readonly ReviewPerspective[] = ['product', 'development', 'quality'];

export interface ContractReviewGateOptions {
  rules?: ContractReviewRule[];
  /** Whether the project has a UI. When false, experience perspective is omitted. Default: true. */
  hasUI?: boolean;
}

export class ContractReviewGate {
  private readonly rules: ContractReviewRule[];
  private readonly perspectives: readonly ReviewPerspective[];
  constructor(options?: ContractReviewGateOptions) {
    this.rules = options?.rules ?? [];
    this.perspectives = (options?.hasUI ?? true) ? ALL_PERSPECTIVES : CORE_PERSPECTIVES;
  }

  async evaluate(input: ContractReviewGateInput): Promise<ContractReviewGateOutput> {
    // Run all perspective evaluations in parallel (AC-4.13)
    const settled = await Promise.allSettled(
      this.perspectives.map((p) => this.evaluatePerspective(p, input)),
    );
    const reviews: PerspectiveReview[] = [];
    for (let i = 0; i < this.perspectives.length; i++) {
      const result = settled[i]!;
      if (result.status === 'fulfilled') {
        reviews.push(result.value);
      } else {
        // Perspective evaluation failed — treat as rejected
        reviews.push({
          perspective: this.perspectives[i]!,
          conclusion: 'rejected',
          findings: [{
            id: `error-${this.perspectives[i]!}`,
            perspective: this.perspectives[i]!,
            severity: 'blocker',
            message: `Perspective evaluation failed: ${String(result.reason)}`,
          }],
          reviewer: 'system',
        });
      }
    }

    // Check for missing perspectives (AC-4.14)
    const coveredPerspectives = new Set(reviews.map((r) => r.perspective));
    for (const required of this.perspectives) {
      if (!coveredPerspectives.has(required)) {
        reviews.push({
          perspective: required,
          conclusion: 'rejected',
          findings: [{
            id: `missing-${required}`,
            perspective: required,
            severity: 'blocker',
            message: `Missing required review perspective: ${required}`,
          }],
          reviewer: 'system',
        });
      }
    }

    // Derive gate conclusion (AC-4.15)
    const gateConclusion = deriveConclusion(reviews);

    // Extract blockers and generate fix requirements (AC-4.16)
    const blockers = reviews.flatMap((r) =>
      r.findings.filter((f) => f.severity === 'blocker'),
    );

    const fixRequirements = blockers.map((b) => toFixRequirement(b));

    const reviewBundle: ContractReviewBundle = {
      reviews,
      gateConclusion,
      blockers,
      fixRequirements,
    };

    return {
      reviewBundle,
      metadata: {
        gateId: 'contract-review-gate',
        evaluatedAt: new Date().toISOString(),
        perspectiveCount: reviews.length,
      },
    };
  }

  private async evaluatePerspective(
    perspective: ReviewPerspective,
    input: ContractReviewGateInput,
  ): Promise<PerspectiveReview> {
    const perspectiveRules = this.rules.filter((r) => r.perspective === perspective);
    const findings = perspectiveRules.flatMap((r) => r.evaluate(input));

    const hasBlocker = findings.some((f) => f.severity === 'blocker');
    const hasWarning = findings.some((f) => f.severity === 'warning');

    let conclusion: GateConclusion;
    if (hasBlocker) {
      conclusion = 'rejected';
    } else if (hasWarning) {
      conclusion = 'conditional';
    } else {
      conclusion = 'passed';
    }

    return {
      perspective,
      conclusion,
      findings,
      reviewer: `${perspective}-reviewer`,
    };
  }
}

function deriveConclusion(reviews: PerspectiveReview[]): GateConclusion {
  const hasRejected = reviews.some((r) => r.conclusion === 'rejected');
  if (hasRejected) return 'rejected';

  const hasConditional = reviews.some((r) => r.conclusion === 'conditional');
  if (hasConditional) return 'conditional';

  return 'passed';
}

function toFixRequirement(finding: ContractFinding): FixRequirement {
  return {
    findingId: finding.id,
    responsibleArtifact: finding.artifact ?? 'unknown',
    fixDescription: finding.message,
    reviewResponsible: finding.perspective,
  };
}
