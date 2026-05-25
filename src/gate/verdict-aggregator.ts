/**
 * Verdict Aggregator — aggregates multiple review bundles into a gate conclusion.
 *
 * Judgment rules (arc42 §5.2.3 Verdict Aggregator):
 *   passed:      all MUST dimensions passed, no SHOULD issues
 *   conditional:  all MUST dimensions passed, some SHOULD dimension not passed
 *   rejected:    any MUST dimension not passed (conditional or rejected)
 *
 * FR-06 dual release: quality + product are both MUST; both must pass for gate to pass.
 */

import type { GateConclusion, ReviewBundle, RuleResult, RuleVerdict } from '../types/index.js';
import type { GateConfig, DimensionPriority } from './review-role-assigner.js';

/** Result of verdict aggregation. */
export interface AggregatedVerdict {
  conclusion: GateConclusion;
  blockers: { item: string; owner: string }[];
}

/**
 * Aggregate review bundles against a gate configuration.
 *
 * Walks each bundle, classifies it as MUST or SHOULD based on the gate config,
 * extracts blockers from non-passing reviews, and derives the overall conclusion.
 */
export function aggregate(
  bundles: readonly ReviewBundle[],
  config: GateConfig,
): AggregatedVerdict {
  const blockers: { item: string; owner: string }[] = [];

  // Build role → priority lookup from gate config
  const rolePriority = new Map<string, DimensionPriority>();
  for (const dim of config.dimensions) {
    rolePriority.set(dim.role, dim.priority);
  }

  let hasMustFailure = false;
  let hasShouldFailure = false;

  for (const bundle of bundles) {
    if (bundle.conclusion === 'passed') continue;

    // Roles not in config default to SHOULD (advisory)
    const priority = rolePriority.get(bundle.role) ?? 'SHOULD';

    // Extract blockers: each issue becomes a blocker owned by the reviewer
    for (const issue of bundle.issues) {
      blockers.push({ item: issue, owner: bundle.reviewer });
    }

    if (priority === 'MUST') {
      hasMustFailure = true;
    } else {
      hasShouldFailure = true;
    }
  }

  let conclusion: GateConclusion;
  if (hasMustFailure) {
    conclusion = 'rejected';
  } else if (hasShouldFailure) {
    conclusion = 'conditional';
  } else {
    conclusion = 'passed';
  }

  return { conclusion, blockers };
}

// ── Rule-based aggregation ──────────────────────────────────────

/**
 * Aggregate multiple RuleResult entries into a single RuleVerdict.
 *
 * - Any blocker → pass=false
 * - Only warnings → pass=true (conditional)
 * - All pass → pass=true
 * - Score = passedCount / totalCount (1 when no rules)
 */
export function aggregateRuleResults(results: readonly RuleResult[]): RuleVerdict {
  if (results.length === 0) {
    return { pass: true, blockers: [], warnings: [], score: 1 };
  }

  const blockers: string[] = [];
  const warnings: string[] = [];

  for (const r of results) {
    if (!r.pass) {
      if (r.severity === 'blocker') {
        blockers.push(r.message);
      } else {
        warnings.push(r.message);
      }
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const score = passed / results.length;

  return {
    pass: blockers.length === 0,
    blockers,
    warnings,
    score,
  };
}
