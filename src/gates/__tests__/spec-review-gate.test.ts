import { describe, expect, it } from 'vitest';

import { SpecReviewGate } from '../spec-review-gate.js';
import type { ReviewRule } from '../gate-types.js';
import type { SpecOutput } from '../../stages/spec-types.js';
import type { ArtifactRef } from '../../types/index.js';

function makeArtifact(id = 'test:spec-package'): ArtifactRef {
  return { id, type: 'spec-package', path: '/tmp/spec.json', createdAt: '2026-01-01T00:00:00Z' };
}

function makeCompleteSpec(overrides?: Partial<SpecOutput>): SpecOutput {
  return {
    summary: 'A complete spec',
    functionalRequirements: [
      {
        id: 'FR-01',
        title: 'Feature one',
        description: 'Does something',
        acceptanceCriteria: [{ id: 'AC-1.1', description: 'Works', requirementId: 'FR-01' }],
      },
    ],
    acceptanceCriteria: [{ id: 'AC-1.1', description: 'Works', requirementId: 'FR-01' }],
    clarifications: [],
    artifact: makeArtifact(),
    ...overrides,
  };
}

describe('SpecReviewGate', () => {
  it('passes a complete spec', () => {
    const gate = new SpecReviewGate();
    const result = gate.evaluate(makeCompleteSpec());

    expect(result.conclusion).toBe('passed');
    expect(result.findings).toHaveLength(0);
    expect(result.mustFix).toHaveLength(0);
    expect(result.score).toBe(1);
  });

  it('rejects when summary is missing', () => {
    const gate = new SpecReviewGate();
    const result = gate.evaluate(makeCompleteSpec({ summary: '' }));

    expect(result.conclusion).toBe('rejected');
    expect(result.mustFix.length).toBeGreaterThan(0);
    expect(result.mustFix[0]!.field).toBe('summary');
  });

  it('rejects when no functional requirements', () => {
    const gate = new SpecReviewGate();
    const result = gate.evaluate(makeCompleteSpec({ functionalRequirements: [] }));

    expect(result.conclusion).toBe('rejected');
    expect(result.mustFix.some((f) => f.field === 'functionalRequirements')).toBe(true);
  });

  it('rejects when FR id format is invalid', () => {
    const gate = new SpecReviewGate();
    const spec = makeCompleteSpec({
      functionalRequirements: [
        {
          id: 'BAD-1',
          title: 'Bad',
          description: 'Invalid id',
          acceptanceCriteria: [{ id: 'AC-1.1', description: 'x', requirementId: 'BAD-1' }],
        },
      ],
    });
    const result = gate.evaluate(spec);

    expect(result.conclusion).toBe('rejected');
    expect(result.mustFix.some((f) => f.ruleId === 'fr-numbering')).toBe(true);
  });

  it('rejects when FR has no acceptance criteria', () => {
    const gate = new SpecReviewGate();
    const spec = makeCompleteSpec({
      functionalRequirements: [
        { id: 'FR-01', title: 'No AC', description: 'Missing AC', acceptanceCriteria: [] },
      ],
    });
    const result = gate.evaluate(spec);

    expect(result.conclusion).toBe('rejected');
    expect(result.mustFix.some((f) => f.ruleId === 'ac-coverage')).toBe(true);
  });

  it('returns conditional when only warnings exist', () => {
    const gate = new SpecReviewGate();
    const spec = makeCompleteSpec({
      functionalRequirements: [
        {
          id: 'FR-01',
          title: '',
          description: 'Has desc but no title',
          acceptanceCriteria: [{ id: 'AC-1.1', description: 'ok', requirementId: 'FR-01' }],
        },
      ],
    });
    const result = gate.evaluate(spec);

    expect(result.conclusion).toBe('conditional');
    expect(result.mustFix).toHaveLength(0);
    expect(result.findings.some((f) => f.severity === 'warning')).toBe(true);
  });

  it('evaluates custom ReviewRule', () => {
    const customRule: ReviewRule = {
      id: 'min-fr-count',
      evaluate(spec) {
        if (spec.functionalRequirements.length < 3) {
          return [{ ruleId: 'min-fr-count', severity: 'warning', message: 'Less than 3 FRs' }];
        }
        return [];
      },
    };

    const gate = new SpecReviewGate({ rules: [customRule] });
    const result = gate.evaluate(makeCompleteSpec());

    expect(result.conclusion).toBe('conditional');
    expect(result.findings.some((f) => f.ruleId === 'min-fr-count')).toBe(true);
  });

  it('custom blocker rule causes rejection', () => {
    const blockerRule: ReviewRule = {
      id: 'must-have-nfr',
      evaluate() {
        return [{ ruleId: 'must-have-nfr', severity: 'blocker', message: 'NFR section required' }];
      },
    };

    const gate = new SpecReviewGate({ rules: [blockerRule] });
    const result = gate.evaluate(makeCompleteSpec());

    expect(result.conclusion).toBe('rejected');
    expect(result.mustFix.some((f) => f.ruleId === 'must-have-nfr')).toBe(true);
  });
});
