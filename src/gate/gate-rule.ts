/**
 * GateRule SPI — interface for pluggable gate evaluation rules.
 *
 * Each rule declares which stages it applies to and how to evaluate
 * a set of artifacts. The GateEngine collects applicable rules per stage
 * and aggregates their results into a RuleVerdict.
 */

import type { ArtifactRef, RuleResult, StageId } from '../types/index.js';

export interface GateRule {
  /** Unique rule identifier. */
  readonly id: string;
  /** Stages this rule applies to. */
  readonly appliesTo: StageId[];
  /** Evaluate artifacts and return a pass/fail result. */
  evaluate(artifacts: ArtifactRef[]): RuleResult | Promise<RuleResult>;
}
