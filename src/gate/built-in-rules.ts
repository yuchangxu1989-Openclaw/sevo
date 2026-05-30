/**
 * Built-in GateRules — standard artifact checks.
 *
 * FileExistsRule:   required files present in artifact set
 * TypeCheckRule:    tsc reports zero errors (artifact type='typecheck', metadata.errors=0)
 * TestPassRule:     all tests passed (artifact type='test-result', metadata.passed=true)
 * MinCoverageRule:  coverage meets threshold (artifact type='coverage', metadata.percentage >= threshold)
 */

import type { ArtifactRef, RuleResult, StageId } from '../types/index.js';
import type { GateRule } from './gate-rule.js';
import { FrValidationCriteriaRule } from './rules/fr-validation-criteria-rule.js';
import { FrTraceabilityRule } from './rules/fr-traceability-rule.js';
import { SpecSectionsRule } from './rules/spec-sections-rule.js';

/** Spec-review-gate semantic pre-gate rules for FR-02-pre / AC-4.4 / AC-4.9. */
export function createSpecReviewGateRules(options?: ConstructorParameters<typeof SpecSectionsRule>[0]): GateRule[] {
  return [
    new SpecSectionsRule(options),
    new FrValidationCriteriaRule(options),
    new FrTraceabilityRule(options),
  ];
}

export { SpecSectionsRule, FrValidationCriteriaRule, FrTraceabilityRule };

export class FileExistsRule implements GateRule {
  readonly id = 'file-exists';
  readonly appliesTo: StageId[];
  private readonly requiredPaths: string[];

  constructor(appliesTo: StageId[], requiredPaths: string[]) {
    this.appliesTo = appliesTo;
    this.requiredPaths = requiredPaths;
  }

  evaluate(artifacts: ArtifactRef[]): RuleResult {
    const paths = new Set(artifacts.map((a) => a.path));
    const missing = this.requiredPaths.filter((p) => !paths.has(p));
    if (missing.length > 0) {
      return {
        pass: false,
        message: `Missing files: ${missing.join(', ')}`,
        severity: 'blocker',
      };
    }
    return { pass: true, message: 'All required files present', severity: 'warning' };
  }
}

export class TypeCheckRule implements GateRule {
  readonly id = 'type-check';
  readonly appliesTo: StageId[];

  constructor(appliesTo: StageId[]) {
    this.appliesTo = appliesTo;
  }

  evaluate(artifacts: ArtifactRef[]): RuleResult {
    const tc = artifacts.find((a) => a.type === 'typecheck');
    if (!tc) {
      return { pass: false, message: 'No typecheck artifact found', severity: 'blocker' };
    }
    const errors = (tc.metadata?.['errors'] as number | undefined) ?? -1;
    if (errors !== 0) {
      return {
        pass: false,
        message: `TypeCheck failed with ${errors} error(s)`,
        severity: 'blocker',
      };
    }
    return { pass: true, message: 'TypeCheck passed (0 errors)', severity: 'warning' };
  }
}

export class TestPassRule implements GateRule {
  readonly id = 'test-pass';
  readonly appliesTo: StageId[];

  constructor(appliesTo: StageId[]) {
    this.appliesTo = appliesTo;
  }

  evaluate(artifacts: ArtifactRef[]): RuleResult {
    const tr = artifacts.find((a) => a.type === 'test-result');
    if (!tr) {
      return { pass: false, message: 'No test-result artifact found', severity: 'blocker' };
    }
    const passed = (tr.metadata?.['passed'] as boolean | undefined) ?? false;
    if (!passed) {
      return { pass: false, message: 'Tests did not pass', severity: 'blocker' };
    }
    return { pass: true, message: 'All tests passed', severity: 'warning' };
  }
}

export class MinCoverageRule implements GateRule {
  readonly id = 'min-coverage';
  readonly appliesTo: StageId[];
  private readonly threshold: number;

  constructor(appliesTo: StageId[], threshold: number) {
    this.appliesTo = appliesTo;
    this.threshold = threshold;
  }

  evaluate(artifacts: ArtifactRef[]): RuleResult {
    const cov = artifacts.find((a) => a.type === 'coverage');
    if (!cov) {
      return { pass: false, message: 'No coverage artifact found', severity: 'warning' };
    }
    const pct = (cov.metadata?.['percentage'] as number | undefined) ?? 0;
    if (pct < this.threshold) {
      return {
        pass: false,
        message: `Coverage ${pct}% below threshold ${this.threshold}%`,
        severity: 'warning',
      };
    }
    return {
      pass: true,
      message: `Coverage ${pct}% meets threshold ${this.threshold}%`,
      severity: 'warning',
    };
  }
}
