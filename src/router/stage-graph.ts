/**
 * Stage Graph — DAG definition for stage flow.
 * (arc42 §5.1, spec §3.3)
 */

import type { GateVerdict, StageId } from '../types/index.js';
import type { PostReleaseValidationOutput } from '../stages/post-release-validation-types.js';
import type { CleanInstallVerificationOutput } from '../stages/clean-install-verification-types.js';

/** An edge in the stage flow graph. */
export interface StageEdge {
  from: StageId;
  to: StageId;
  /** Optional condition evaluated against the gate verdict. If omitted, edge is unconditional. */
  condition?: (verdict: GateVerdict) => boolean;
  /** Optional condition evaluated against stage-specific output. */
  validationCondition?: (result: PostReleaseValidationOutput | CleanInstallVerificationOutput) => boolean;
}

/** Immutable stage graph built from edges. */
export class StageGraph {
  private readonly edges: StageEdge[];

  constructor(edges: StageEdge[]) {
    this.edges = [...edges];
  }

  /** Get all outgoing edges from a given stage. */
  getOutgoing(stage: StageId): readonly StageEdge[] {
    return this.edges.filter((e) => e.from === stage);
  }

  /** Get all edges in the graph. */
  getAllEdges(): readonly StageEdge[] {
    return this.edges;
  }
}

/**
 * Default SDD flow:
 * spec → spec-review-gate → contract → contract-review-gate → implement → review
 *   → smoke-test → { ux-acceptance, pm-commercial-review } → regression
 *   → publish-generalization-gate → deploy → verify → post-release-validation
 *   → clean-install-verification → ledger (if clean install passes)
 *   OR clean-install-verification blocks ledger (if clean install fails)
 *   OR post-release-validation → implement (back-edge if !canComplete, AC-18.10)
 */
export const DEFAULT_SDD_EDGES: StageEdge[] = [
  { from: 'spec', to: 'spec-review-gate' },
  { from: 'spec-review-gate', to: 'contract' },
  { from: 'spec-review-gate', to: 'ux-interaction-design' },
  { from: 'spec-review-gate', to: 'architecture-design' },
  { from: 'contract', to: 'contract-review-gate' },
  { from: 'contract-review-gate', to: 'implement' },
  { from: 'implement', to: 'review' },
  { from: 'review', to: 'smoke-test' },
  { from: 'smoke-test', to: 'ux-acceptance' },
  { from: 'smoke-test', to: 'pm-commercial-review' },
  { from: 'ux-acceptance', to: 'regression' },
  { from: 'pm-commercial-review', to: 'regression' },
  { from: 'regression', to: 'publish-generalization-gate' },
  { from: 'publish-generalization-gate', to: 'deploy' },
  { from: 'deploy', to: 'verify' },
  { from: 'verify', to: 'post-release-validation' },
  {
    from: 'post-release-validation',
    to: 'clean-install-verification',
    validationCondition: (result: PostReleaseValidationOutput | CleanInstallVerificationOutput) =>
      'canComplete' in result && result.canComplete,
  },
  {
    from: 'post-release-validation',
    to: 'implement',
    validationCondition: (result: PostReleaseValidationOutput | CleanInstallVerificationOutput) =>
      'canComplete' in result && !result.canComplete,
  },
  {
    from: 'clean-install-verification',
    to: 'ledger',
    validationCondition: (result: PostReleaseValidationOutput | CleanInstallVerificationOutput) =>
      'canComplete' in result && result.canComplete,
  },
];

/** Pre-built default SDD graph instance. */
export const DEFAULT_SDD_GRAPH = new StageGraph(DEFAULT_SDD_EDGES);
