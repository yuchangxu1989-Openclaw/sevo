import { describe, it, expect } from 'vitest';
import { GateEngine } from '../gate/gate-engine.js';
import { aggregateRuleResults } from '../gate/verdict-aggregator.js';
import {
  FileExistsRule,
  TypeCheckRule,
  TestPassRule,
  MinCoverageRule,
} from '../gate/built-in-rules.js';
import type { GateRule } from '../gate/gate-rule.js';
import type { ArtifactRef, RuleResult, StageId } from '../types/index.js';

// ── helpers ─────────────────────────────────────────────────────

function makeArtifact(overrides: Partial<ArtifactRef> & { type: string }): ArtifactRef {
  return {
    id: overrides.id ?? `art-${Math.random().toString(36).slice(2, 8)}`,
    type: overrides.type,
    path: overrides.path ?? '',
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    metadata: overrides.metadata,
  };
}

// ── GateEngine ──────────────────────────────────────────────────

describe('GateEngine', () => {
  it('returns default pass when no rules registered', () => {
    const engine = new GateEngine();
    const verdict = engine.evaluateGate('implement', []);
    expect(verdict.pass).toBe(true);
    expect(verdict.blockers).toEqual([]);
    expect(verdict.warnings).toEqual([]);
    expect(verdict.score).toBe(1);
  });

  it('returns default pass when no rules apply to stage', () => {
    const engine = new GateEngine();
    engine.registerRule(new TypeCheckRule(['implement']));
    const verdict = engine.evaluateGate('spec', []);
    expect(verdict.pass).toBe(true);
    expect(verdict.score).toBe(1);
  });

  it('registers and evaluates multiple rules', () => {
    const engine = new GateEngine();
    engine.registerRule(new TypeCheckRule(['implement']));
    engine.registerRule(new TestPassRule(['implement']));

    const artifacts = [
      makeArtifact({ type: 'typecheck', metadata: { errors: 0 } }),
      makeArtifact({ type: 'test-result', metadata: { passed: true } }),
    ];
    const verdict = engine.evaluateGate('implement', artifacts);
    expect(verdict.pass).toBe(true);
    expect(verdict.score).toBe(1);
  });

  it('fails when a blocker rule fails', () => {
    const engine = new GateEngine();
    engine.registerRule(new TypeCheckRule(['implement']));
    engine.registerRule(new TestPassRule(['implement']));

    const artifacts = [
      makeArtifact({ type: 'typecheck', metadata: { errors: 3 } }),
      makeArtifact({ type: 'test-result', metadata: { passed: true } }),
    ];
    const verdict = engine.evaluateGate('implement', artifacts);
    expect(verdict.pass).toBe(false);
    expect(verdict.blockers).toHaveLength(1);
    expect(verdict.blockers[0]).toContain('3 error');
    expect(verdict.score).toBe(0.5);
  });

  it('exposes registered rules via getRules()', () => {
    const engine = new GateEngine();
    expect(engine.getRules()).toHaveLength(0);
    engine.registerRule(new TypeCheckRule(['implement']));
    expect(engine.getRules()).toHaveLength(1);
  });
});

// ── FileExistsRule ──────────────────────────────────────────────

describe('FileExistsRule', () => {
  it('passes when all required files present', () => {
    const rule = new FileExistsRule(['spec'], ['spec.md', 'readme.md']);
    const artifacts = [
      makeArtifact({ type: 'file', path: 'spec.md' }),
      makeArtifact({ type: 'file', path: 'readme.md' }),
    ];
    const result = rule.evaluate(artifacts);
    expect(result.pass).toBe(true);
  });

  it('fails when files missing', () => {
    const rule = new FileExistsRule(['spec'], ['spec.md', 'readme.md']);
    const artifacts = [makeArtifact({ type: 'file', path: 'spec.md' })];
    const result = rule.evaluate(artifacts);
    expect(result.pass).toBe(false);
    expect(result.severity).toBe('blocker');
    expect(result.message).toContain('readme.md');
  });

  it('fails when no artifacts at all', () => {
    const rule = new FileExistsRule(['spec'], ['spec.md']);
    expect(rule.evaluate([]).pass).toBe(false);
  });
});

// ── TypeCheckRule ───────────────────────────────────────────────

describe('TypeCheckRule', () => {
  it('passes with zero errors', () => {
    const rule = new TypeCheckRule(['implement']);
    const result = rule.evaluate([makeArtifact({ type: 'typecheck', metadata: { errors: 0 } })]);
    expect(result.pass).toBe(true);
  });

  it('fails with nonzero errors', () => {
    const rule = new TypeCheckRule(['implement']);
    const result = rule.evaluate([makeArtifact({ type: 'typecheck', metadata: { errors: 5 } })]);
    expect(result.pass).toBe(false);
    expect(result.severity).toBe('blocker');
  });

  it('fails when no typecheck artifact', () => {
    const rule = new TypeCheckRule(['implement']);
    expect(rule.evaluate([]).pass).toBe(false);
  });
});

// ── TestPassRule ────────────────────────────────────────────────

describe('TestPassRule', () => {
  it('passes when tests passed', () => {
    const rule = new TestPassRule(['implement']);
    const result = rule.evaluate([makeArtifact({ type: 'test-result', metadata: { passed: true } })]);
    expect(result.pass).toBe(true);
  });

  it('fails when tests failed', () => {
    const rule = new TestPassRule(['implement']);
    const result = rule.evaluate([makeArtifact({ type: 'test-result', metadata: { passed: false } })]);
    expect(result.pass).toBe(false);
    expect(result.severity).toBe('blocker');
  });

  it('fails when no test-result artifact', () => {
    const rule = new TestPassRule(['implement']);
    expect(rule.evaluate([]).pass).toBe(false);
  });
});

// ── MinCoverageRule ─────────────────────────────────────────────

describe('MinCoverageRule', () => {
  it('passes when coverage meets threshold', () => {
    const rule = new MinCoverageRule(['implement'], 80);
    const result = rule.evaluate([makeArtifact({ type: 'coverage', metadata: { percentage: 85 } })]);
    expect(result.pass).toBe(true);
  });

  it('fails when coverage below threshold', () => {
    const rule = new MinCoverageRule(['implement'], 80);
    const result = rule.evaluate([makeArtifact({ type: 'coverage', metadata: { percentage: 60 } })]);
    expect(result.pass).toBe(false);
    expect(result.severity).toBe('warning');
    expect(result.message).toContain('60%');
  });

  it('fails when no coverage artifact (warning severity)', () => {
    const rule = new MinCoverageRule(['implement'], 80);
    const result = rule.evaluate([]);
    expect(result.pass).toBe(false);
    expect(result.severity).toBe('warning');
  });

  it('passes at exact threshold', () => {
    const rule = new MinCoverageRule(['implement'], 80);
    const result = rule.evaluate([makeArtifact({ type: 'coverage', metadata: { percentage: 80 } })]);
    expect(result.pass).toBe(true);
  });
});

// ── VerdictAggregator (rule-based) ──────────────────────────────

describe('aggregateRuleResults', () => {
  it('returns pass with empty results', () => {
    const verdict = aggregateRuleResults([]);
    expect(verdict.pass).toBe(true);
    expect(verdict.score).toBe(1);
  });

  it('returns pass when all rules pass', () => {
    const results: RuleResult[] = [
      { pass: true, message: 'ok', severity: 'blocker' },
      { pass: true, message: 'ok', severity: 'warning' },
    ];
    const verdict = aggregateRuleResults(results);
    expect(verdict.pass).toBe(true);
    expect(verdict.score).toBe(1);
  });

  it('fails when any blocker fails', () => {
    const results: RuleResult[] = [
      { pass: true, message: 'ok', severity: 'blocker' },
      { pass: false, message: 'tsc failed', severity: 'blocker' },
    ];
    const verdict = aggregateRuleResults(results);
    expect(verdict.pass).toBe(false);
    expect(verdict.blockers).toEqual(['tsc failed']);
    expect(verdict.score).toBe(0.5);
  });

  it('passes with only warnings (no blockers)', () => {
    const results: RuleResult[] = [
      { pass: true, message: 'ok', severity: 'blocker' },
      { pass: false, message: 'low coverage', severity: 'warning' },
    ];
    const verdict = aggregateRuleResults(results);
    expect(verdict.pass).toBe(true);
    expect(verdict.warnings).toEqual(['low coverage']);
    expect(verdict.score).toBe(0.5);
  });

  it('separates blockers and warnings', () => {
    const results: RuleResult[] = [
      { pass: false, message: 'tsc failed', severity: 'blocker' },
      { pass: false, message: 'low coverage', severity: 'warning' },
      { pass: true, message: 'ok', severity: 'warning' },
    ];
    const verdict = aggregateRuleResults(results);
    expect(verdict.pass).toBe(false);
    expect(verdict.blockers).toEqual(['tsc failed']);
    expect(verdict.warnings).toEqual(['low coverage']);
    expect(verdict.score).toBeCloseTo(1 / 3);
  });
});
