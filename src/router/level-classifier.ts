/**
 * Level Classifier — determines L0/L1/L2+ based on task scope.
 *
 * Rules (spec §3.1, §3.2):
 *   L2+: new module, cross-domain (≥2), ≥500 lines or ≥10 files,
 *         data model change, governance change, release target change,
 *         user explicit full pipeline.
 *   L0:  single file, <50 lines, no data model change, single domain.
 *   L1:  everything else (conservative default per arc42 §8.1).
 */

import type { TaskScope, TaskLevel, TriggerRule } from '../types/index.js';
import { L2_THRESHOLDS, L0_THRESHOLDS } from '../constants.js';

export interface ClassificationResult {
  level: TaskLevel;
  matchedRules: TriggerRule[];
}

/** Classify a task's routing level from its scope metadata. */
export function classifyLevel(scope: TaskScope): ClassificationResult {
  // FR-3: explicit user level overrides every other rule.
  if (scope.userExplicitLevel) {
    return { level: scope.userExplicitLevel, matchedRules: [] };
  }

  const matchedRules = matchTriggerRules(scope);

  if (matchedRules.length > 0) {
    return { level: 'L2+', matchedRules };
  }

  if (isL0(scope)) {
    return { level: 'L0', matchedRules: [] };
  }

  // Default conservative routing (arc42 §8.1) — also catches the historical
  // "empty scope" pitfall now that isL0 demands userExplicitL0=true.
  return { level: 'L1', matchedRules: [] };
}

// ── internals ───────────────────────────────────────────────────

function matchTriggerRules(scope: TaskScope): TriggerRule[] {
  const rules: TriggerRule[] = [];

  if (scope.isNewModule) rules.push('new-module');

  if ((scope.affectedDomains?.length ?? 0) >= L2_THRESHOLDS.domains) {
    rules.push('cross-domain');
  }

  if (
    (scope.estimatedLines ?? 0) >= L2_THRESHOLDS.lines ||
    (scope.estimatedFiles ?? 0) >= L2_THRESHOLDS.files
  ) {
    rules.push('large-change');
  }

  if (scope.hasDataModelChange) rules.push('data-model-change');
  if (scope.hasGovernanceChange) rules.push('governance-change');
  if (scope.hasReleaseTargetChange) rules.push('release-target-change');
  if (scope.userExplicitFullPipeline) rules.push('user-explicit');

  return rules;
}

function isL0(scope: TaskScope): boolean {
  // FR-2 AC3: L0 must be explicitly opted-in. Empty / partial scopes fall
  // through to the L1 default. Historical badcase (2026-05-24): empty scope
  // → all-defaults → false-L0 → architecture-design skipped → FR implementers
  // hung 30 minutes without an architecture spec.
  if (!scope.userExplicitL0) return false;

  const files = scope.estimatedFiles ?? 1;
  const lines = scope.estimatedLines ?? 0;
  const domains = scope.affectedDomains?.length ?? 0;

  return (
    files <= L0_THRESHOLDS.maxFiles &&
    lines < L0_THRESHOLDS.maxLines &&
    domains <= 1 &&
    !scope.hasDataModelChange &&
    !scope.isNewModule &&
    !scope.hasGovernanceChange &&
    !scope.hasReleaseTargetChange &&
    !scope.userExplicitFullPipeline
  );
}
