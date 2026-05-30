import { describe, it, expect } from 'vitest';
import { evaluate } from '../gate-engine.js';
import { aggregate } from '../verdict-aggregator.js';
import {
  getGateConfig,
  findMissingRoles,
  getRequiredRoles,
} from '../review-role-assigner.js';
import type { ReviewBundle } from '../../types/index.js';

// ── helpers ─────────────────────────────────────────────────────

function makeBundle(
  overrides: Partial<ReviewBundle> & Pick<ReviewBundle, 'role'>,
): ReviewBundle {
  return {
    reviewer: overrides.reviewer ?? `${overrides.role}-reviewer`,
    role: overrides.role,
    conclusion: overrides.conclusion ?? 'passed',
    issues: overrides.issues ?? [],
  };
}

// ── review-role-assigner ────────────────────────────────────────

describe('review-role-assigner', () => {
  it('returns config for all known gates', () => {
    expect(getGateConfig('spec-review-gate')).toBeDefined();
    expect(getGateConfig('contract-review-gate')).toBeDefined();
    expect(getGateConfig('review')).toBeDefined();
  });

  it('returns undefined for unknown gate', () => {
    expect(getGateConfig('nonexistent')).toBeUndefined();
  });

  it('spec-review-gate requires architect', () => {
    expect(getRequiredRoles('spec-review-gate')).toEqual(['architect']);
  });

  it('contract-review-gate requires product, developer, quality', () => {
    expect(getRequiredRoles('contract-review-gate')).toEqual([
      'product',
      'developer',
      'quality',
    ]);
  });

  it('review requires quality and product (FR-06 dual release)', () => {
    expect(getRequiredRoles('review')).toEqual(['quality', 'product']);
  });

  it('finds missing roles when bundles incomplete', () => {
    const bundles = [makeBundle({ role: 'product' })];
    const missing = findMissingRoles('contract-review-gate', bundles);
    expect(missing).toContain('developer');
    expect(missing).toContain('quality');
    expect(missing).not.toContain('product');
  });

  it('returns empty when all roles covered', () => {
    const bundles = [
      makeBundle({ role: 'product' }),
      makeBundle({ role: 'developer' }),
      makeBundle({ role: 'quality' }),
    ];
    expect(findMissingRoles('contract-review-gate', bundles)).toEqual([]);
  });

  it('returns empty for unknown gate', () => {
    expect(findMissingRoles('nonexistent', [])).toEqual([]);
    expect(getRequiredRoles('nonexistent')).toEqual([]);
  });
});

// ── verdict-aggregator ──────────────────────────────────────────

describe('verdict-aggregator', () => {
  it('returns passed when all MUST dimensions pass', () => {
    const config = getGateConfig('contract-review-gate')!;
    const bundles = [
      makeBundle({ role: 'product' }),
      makeBundle({ role: 'developer' }),
      makeBundle({ role: 'quality' }),
    ];
    const result = aggregate(bundles, config);
    expect(result.conclusion).toBe('passed');
    expect(result.blockers).toEqual([]);
  });

  it('returns rejected when any MUST dimension is rejected', () => {
    const config = getGateConfig('contract-review-gate')!;
    const bundles = [
      makeBundle({ role: 'product' }),
      makeBundle({
        role: 'developer',
        conclusion: 'rejected',
        issues: ['API design flawed'],
      }),
      makeBundle({ role: 'quality' }),
    ];
    const result = aggregate(bundles, config);
    expect(result.conclusion).toBe('rejected');
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0]!.item).toBe('API design flawed');
  });

  it('returns rejected when MUST dimension is conditional', () => {
    const config = getGateConfig('spec-review-gate')!;
    const bundles = [
      makeBundle({
        role: 'architect',
        conclusion: 'conditional',
        issues: ['Missing edge case'],
      }),
    ];
    const result = aggregate(bundles, config);
    expect(result.conclusion).toBe('rejected');
    expect(result.blockers).toHaveLength(1);
  });

  it('collects blockers from all failing reviewers', () => {
    const config = getGateConfig('contract-review-gate')!;
    const bundles = [
      makeBundle({
        role: 'product',
        conclusion: 'rejected',
        issues: ['Missing FR-01'],
      }),
      makeBundle({
        role: 'developer',
        conclusion: 'rejected',
        issues: ['Infeasible API', 'Missing error handling'],
      }),
      makeBundle({ role: 'quality' }),
    ];
    const result = aggregate(bundles, config);
    expect(result.conclusion).toBe('rejected');
    expect(result.blockers).toHaveLength(3);
  });

  it('returns conditional when only SHOULD dimension fails', () => {
    const config = getGateConfig('spec-review-gate')!;
    // architect passes (MUST), but an extra advisory reviewer fails
    const bundles = [
      makeBundle({ role: 'architect' }),
      makeBundle({
        role: 'developer',
        conclusion: 'conditional',
        issues: ['Minor concern'],
      }),
    ];
    const result = aggregate(bundles, config);
    expect(result.conclusion).toBe('conditional');
    expect(result.blockers).toHaveLength(1);
  });
});

// ── gate-engine evaluate() ──────────────────────────────────────

describe('evaluate', () => {
  describe('validation', () => {
    it('rejects empty gateId', () => {
      const result = evaluate('', []);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('INVALID_GATE_ID');
    });

    it('rejects whitespace-only gateId', () => {
      const result = evaluate('   ', []);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('INVALID_GATE_ID');
    });

    it('rejects unknown gate', () => {
      const result = evaluate('nonexistent', [makeBundle({ role: 'architect' })]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('UNKNOWN_GATE');
    });

    it('rejects empty bundles', () => {
      const result = evaluate('spec-review-gate', []);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('NO_REVIEW_BUNDLES');
    });

    it('rejects when required roles missing', () => {
      const result = evaluate('contract-review-gate', [
        makeBundle({ role: 'product' }),
      ]);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('MISSING_REQUIRED_ROLES');
        expect(result.error.message).toContain('developer');
        expect(result.error.message).toContain('quality');
      }
    });
  });

  describe('spec-review-gate (FR-02)', () => {
    it('passes when architect passes', () => {
      const result = evaluate('spec-review-gate', [
        makeBundle({ role: 'architect' }),
      ]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.conclusion).toBe('passed');
      expect(result.value.blockers).toEqual([]);
      expect(result.value.gateId).toBe('spec-review-gate');
    });

    it('rejects when architect rejects', () => {
      const result = evaluate('spec-review-gate', [
        makeBundle({
          role: 'architect',
          conclusion: 'rejected',
          issues: ['Spec incomplete'],
        }),
      ]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.conclusion).toBe('rejected');
      expect(result.value.blockers).toHaveLength(1);
    });
  });

  describe('contract-review-gate (FR-04)', () => {
    it('passes when all three parties pass', () => {
      const result = evaluate('contract-review-gate', [
        makeBundle({ role: 'product' }),
        makeBundle({ role: 'developer' }),
        makeBundle({ role: 'quality' }),
      ]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.conclusion).toBe('passed');
    });

    it('rejects when any party rejects (AC-4.15)', () => {
      const result = evaluate('contract-review-gate', [
        makeBundle({ role: 'product' }),
        makeBundle({
          role: 'developer',
          conclusion: 'rejected',
          issues: ['Over-abstraction'],
        }),
        makeBundle({ role: 'quality' }),
      ]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.conclusion).toBe('rejected');
      expect(result.value.blockers[0]!.item).toBe('Over-abstraction');
    });

    it('rejects when any party is conditional (MUST must fully pass)', () => {
      const result = evaluate('contract-review-gate', [
        makeBundle({ role: 'product' }),
        makeBundle({ role: 'developer' }),
        makeBundle({
          role: 'quality',
          conclusion: 'conditional',
          issues: ['ADR missing alternatives'],
        }),
      ]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.conclusion).toBe('rejected');
    });
  });

  describe('review / FR-06 dual release', () => {
    it('passes when both quality and product pass', () => {
      const result = evaluate('review', [
        makeBundle({ role: 'quality', reviewer: 'audit-01' }),
        makeBundle({ role: 'product', reviewer: 'pm-01' }),
      ]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.conclusion).toBe('passed');
    });

    it('rejects when quality fails', () => {
      const result = evaluate('review', [
        makeBundle({
          role: 'quality',
          reviewer: 'audit-01',
          conclusion: 'rejected',
          issues: ['Security vulnerability'],
        }),
        makeBundle({ role: 'product', reviewer: 'pm-01' }),
      ]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.conclusion).toBe('rejected');
      expect(result.value.blockers[0]!.owner).toBe('audit-01');
    });

    it('rejects when product fails', () => {
      const result = evaluate('review', [
        makeBundle({ role: 'quality', reviewer: 'audit-01' }),
        makeBundle({
          role: 'product',
          reviewer: 'pm-01',
          conclusion: 'rejected',
          issues: ['Missing feature X'],
        }),
      ]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.conclusion).toBe('rejected');
      expect(result.value.blockers[0]!.owner).toBe('pm-01');
    });

    it('rejects when both fail, collects all blockers', () => {
      const result = evaluate('review', [
        makeBundle({
          role: 'quality',
          reviewer: 'audit-01',
          conclusion: 'rejected',
          issues: ['Bug A'],
        }),
        makeBundle({
          role: 'product',
          reviewer: 'pm-01',
          conclusion: 'conditional',
          issues: ['Incomplete B'],
        }),
      ]);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.conclusion).toBe('rejected');
      expect(result.value.blockers).toHaveLength(2);
    });
  });

  describe('output integrity', () => {
    it('includes all input bundles in verdict', () => {
      const bundles = [
        makeBundle({ role: 'quality', reviewer: 'audit-01' }),
        makeBundle({ role: 'product', reviewer: 'pm-01' }),
      ];
      const result = evaluate('review', bundles);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.reviewBundles).toHaveLength(2);
      expect(result.value.reviewBundles[0]!.reviewer).toBe('audit-01');
      expect(result.value.reviewBundles[1]!.reviewer).toBe('pm-01');
    });

    it('does not mutate input bundles array', () => {
      const bundles = [
        makeBundle({ role: 'quality' }),
        makeBundle({ role: 'product' }),
      ];
      const result = evaluate('review', bundles);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Output is a copy, not the same reference
      expect(result.value.reviewBundles).not.toBe(bundles);
      expect(result.value.reviewBundles).toEqual(bundles);
    });
  });

  describe('determinism', () => {
    it('produces identical results for identical input', () => {
      const bundles = [
        makeBundle({ role: 'product' }),
        makeBundle({ role: 'developer' }),
        makeBundle({ role: 'quality' }),
      ];
      const a = evaluate('contract-review-gate', bundles);
      const b = evaluate('contract-review-gate', bundles);
      expect(a).toEqual(b);
    });
  });
});
