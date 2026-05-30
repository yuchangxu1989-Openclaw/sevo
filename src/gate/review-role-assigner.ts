/**
 * Review Role Assigner — manages gate configurations and review role assignments.
 *
 * Defines which review roles are required (MUST) or advisory (SHOULD) for each
 * gate type, and validates role coverage against provided review bundles.
 *
 * (arc42 §5.2.3 Review Coordinator, spec §FR-02/FR-04/FR-06)
 */

import type { ReviewBundle } from '../types/index.js';

/** Review role identifier. */
export type ReviewRole = 'architect' | 'product' | 'developer' | 'quality' | 'experience';

/** Priority level for a review dimension. */
export type DimensionPriority = 'MUST' | 'SHOULD';

/** A single review dimension within a gate. */
export interface ReviewDimension {
  role: ReviewRole;
  priority: DimensionPriority;
}

/** Configuration for a gate's review requirements. */
export interface GateConfig {
  gateId: string;
  dimensions: readonly ReviewDimension[];
}

// ── Gate configurations (arc42 §5.2.3) ─────────────────────────

/**
 * Spec Review Gate (FR-02): single architect review.
 * Architect checks spec completeness, phase isolation, concept integrity.
 */
const SPEC_REVIEW_GATE: GateConfig = {
  gateId: 'spec-review-gate',
  dimensions: [{ role: 'architect', priority: 'MUST' }],
};

/**
 * Contract Review Gate (FR-04): four-party parallel review.
 * Product (requirement coverage), Developer (feasibility), Quality (rigor),
 * Experience (UX/usability — SHOULD, omitted when hasUI=false).
 */
const CONTRACT_REVIEW_GATE: GateConfig = {
  gateId: 'contract-review-gate',
  dimensions: [
    { role: 'product', priority: 'MUST' },
    { role: 'developer', priority: 'MUST' },
    { role: 'quality', priority: 'MUST' },
    { role: 'experience', priority: 'SHOULD' },
  ],
};

/**
 * Review gate (FR-06): dual release — quality + product both must pass.
 * Quality (code quality, security, compliance), Product (feature completeness).
 */
const REVIEW_GATE: GateConfig = {
  gateId: 'review',
  dimensions: [
    { role: 'quality', priority: 'MUST' },
    { role: 'product', priority: 'MUST' },
  ],
};

const GATE_CONFIGS: ReadonlyMap<string, GateConfig> = new Map([
  [SPEC_REVIEW_GATE.gateId, SPEC_REVIEW_GATE],
  [CONTRACT_REVIEW_GATE.gateId, CONTRACT_REVIEW_GATE],
  [REVIEW_GATE.gateId, REVIEW_GATE],
]);

// ── Public API ──────────────────────────────────────────────────

/** Get the gate configuration for a given gate ID. */
export function getGateConfig(gateId: string): GateConfig | undefined {
  return GATE_CONFIGS.get(gateId);
}

/** Get all required (MUST) review roles for a gate. */
export function getRequiredRoles(gateId: string): ReviewRole[] {
  const config = GATE_CONFIGS.get(gateId);
  if (!config) return [];
  return config.dimensions
    .filter((d) => d.priority === 'MUST')
    .map((d) => d.role);
}

/**
 * Find MUST roles not covered by the provided bundles.
 * Returns an empty array when all required roles are present.
 */
export function findMissingRoles(
  gateId: string,
  bundles: readonly ReviewBundle[],
): ReviewRole[] {
  const config = GATE_CONFIGS.get(gateId);
  if (!config) return [];

  const providedRoles = new Set(bundles.map((b) => b.role));
  return config.dimensions
    .filter((d) => d.priority === 'MUST')
    .map((d) => d.role)
    .filter((role) => !providedRoles.has(role));
}
