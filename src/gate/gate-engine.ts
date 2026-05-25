/**
 * Gate Engine — core gate evaluation logic.
 *
 * Validates inputs, checks review role coverage, and delegates to the
 * Verdict Aggregator for conclusion derivation.
 *
 * (arc42 §5.2.3, spec §FR-02/FR-04/FR-06)
 */

import type {
  GateVerdict,
  ReviewBundle,
  ArtifactRef,
  RuleVerdict,
  RuleResult,
  StageId,
  Result,
  RouterError,
  ObjectiveKeyResult,
  GoalAlignment,
} from '../types/index.js';
import { getGateConfig, findMissingRoles } from './review-role-assigner.js';
import { aggregate, aggregateRuleResults } from './verdict-aggregator.js';
import type { GateRule } from './gate-rule.js';

/**
 * Evaluate a gate with the provided review bundles.
 *
 * @param gateId - Identifier of the gate to evaluate.
 * @param reviewBundles - Review results from assigned reviewers.
 * @returns Result containing GateVerdict on success, RouterError on failure.
 */
export function evaluate(
  gateId: string,
  reviewBundles: ReviewBundle[],
): Result<GateVerdict> {
  // ── Input validation ────────────────────────────────────────

  if (!gateId || gateId.trim() === '') {
    return {
      ok: false,
      error: {
        code: 'INVALID_GATE_ID',
        message: 'gateId must be a non-empty string',
      },
    };
  }

  const config = getGateConfig(gateId);
  if (!config) {
    return {
      ok: false,
      error: {
        code: 'UNKNOWN_GATE',
        message: `No gate configuration found for '${gateId}'`,
        context: { gateId },
      },
    };
  }

  if (reviewBundles.length === 0) {
    return {
      ok: false,
      error: {
        code: 'NO_REVIEW_BUNDLES',
        message: 'At least one review bundle is required',
      },
    };
  }

  // ── Role coverage check ─────────────────────────────────────

  const missingRoles = findMissingRoles(gateId, reviewBundles);
  if (missingRoles.length > 0) {
    return {
      ok: false,
      error: {
        code: 'MISSING_REQUIRED_ROLES',
        message: `Missing required review roles: ${missingRoles.join(', ')}`,
        context: { missingRoles },
      },
    };
  }

  // ── Verdict aggregation ─────────────────────────────────────

  const { conclusion, blockers } = aggregate(reviewBundles, config);

  return {
    ok: true,
    value: {
      gateId,
      conclusion,
      blockers,
      reviewBundles: [...reviewBundles],
    },
  };
}

// ── FR-18 AC-18.7: Goal Alignment Assessment ──────────────────

/**
 * Assess how well current-stage artifacts align with the OKR tree.
 *
 * Returns 'aligned' when ≥80% of KRs are on track,
 * 'drifting' when 50-79%, 'misaligned' when <50%.
 *
 * This is advisory only — it does not change gate pass/fail logic (AC-18.7).
 */
export function assessGoalAlignment(
  okrTree: ObjectiveKeyResult[],
  _artifacts: ArtifactRef[],
): GoalAlignment {
  if (okrTree.length === 0) return 'aligned';

  const allKrs = okrTree.flatMap((obj) => obj.keyResults);
  if (allKrs.length === 0) return 'aligned';

  const onTrack = allKrs.filter(
    (kr) => kr.status === 'achieved' || kr.status === 'in-progress',
  ).length;
  const ratio = onTrack / allKrs.length;

  if (ratio >= 0.8) return 'aligned';
  if (ratio >= 0.5) return 'drifting';
  return 'misaligned';
}

// ── Rule-based GateEngine (SPI) ───────────────────────────────

/**
 * GateEngine — SPI-based artifact evaluation.
 *
 * Register GateRule instances, then call evaluateGate() with a stageId
 * and artifacts. The engine filters applicable rules, evaluates each,
 * and aggregates results into a RuleVerdict.
 */
export class GateEngine {
  private readonly rules: GateRule[] = [];

  /** Register a rule. Duplicate ids are allowed (evaluated independently). */
  registerRule(rule: GateRule): void {
    this.rules.push(rule);
  }

  /**
   * Load rules from a JSON configuration object (AC-4.53).
   *
   * Config format:
   * ```json
   * { "rules": [
   *   { "id": "my-rule", "appliesTo": ["implement", "review"],
   *     "check": { "artifactType": "test-result", "minCount": 1 },
   *     "severity": "blocker", "message": "At least one test required" }
   * ]}
   * ```
   */
  loadRulesFromConfig(config: GateRuleConfig): void {
    for (const entry of config.rules) {
      const rule: GateRule = {
        id: entry.id,
        appliesTo: entry.appliesTo as StageId[],
        evaluate(artifacts: ArtifactRef[]): RuleResult {
          if (entry.check.artifactType) {
            const matching = artifacts.filter((a) => a.type === entry.check.artifactType);
            const minCount = entry.check.minCount ?? 1;
            const pass = matching.length >= minCount;
            return {
              pass,
              message: pass
                ? `Found ${matching.length} ${entry.check.artifactType} artifacts (min: ${minCount})`
                : entry.message ?? `Expected at least ${minCount} ${entry.check.artifactType} artifacts, found ${matching.length}`,
              severity: entry.severity ?? 'warning',
            };
          }
          // Default: pass if any artifacts exist
          return {
            pass: artifacts.length > 0,
            message: entry.message ?? 'Artifact check',
            severity: entry.severity ?? 'warning',
          };
        },
      };
      this.rules.push(rule);
    }
  }

  /** Get all registered rules. */
  getRules(): readonly GateRule[] {
    return this.rules;
  }

  /**
   * Evaluate all applicable rules for a stage against the provided artifacts.
   * Returns a RuleVerdict with pass/fail, blockers, warnings, and score.
   * Empty rule set → default pass (score=1).
   */
  evaluateGate(stageId: StageId, artifacts: ArtifactRef[]): RuleVerdict {
    const applicable = this.rules.filter((r) => r.appliesTo.includes(stageId));
    const results: RuleResult[] = [];
    for (const rule of applicable) {
      const result = rule.evaluate(artifacts);
      if (isPromiseLike(result)) {
        results.push({
          pass: false,
          message: `Rule '${rule.id}' requires asynchronous LLM evaluation; use evaluateGateAsync`,
          severity: 'blocker',
        });
      } else {
        results.push(result);
      }
    }
    return aggregateRuleResults(results);
  }

  /** Async variant required by LLM semantic rules. */
  async evaluateGateAsync(stageId: StageId, artifacts: ArtifactRef[]): Promise<RuleVerdict> {
    const applicable = this.rules.filter((r) => r.appliesTo.includes(stageId));
    const results = await Promise.all(applicable.map((r) => r.evaluate(artifacts)));
    return aggregateRuleResults(results);
  }
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as Promise<T>).then === 'function';
}

/** Configuration format for loading gate rules from JSON/YAML (AC-4.53). */
export interface GateRuleConfig {
  rules: Array<{
    id: string;
    appliesTo: string[];
    check: {
      artifactType?: string;
      minCount?: number;
    };
    severity?: 'blocker' | 'warning';
    message?: string;
  }>;
}
