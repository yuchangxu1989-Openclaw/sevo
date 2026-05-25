import { describe, expect, it } from 'vitest';

import { ContractReviewGate } from '../contract-review-gate.js';
import type {
  ContractReviewGateInput,
  ContractReviewRule,
  ContractFinding,
} from '../contract-review-types.js';
import type { ArtifactRef } from '../../types/index.js';

function makeArtifact(id = 'test:contract-package'): ArtifactRef {
  return { id, type: 'contract-package', path: '/tmp/contract.json', createdAt: '2026-01-01T00:00:00Z' };
}

function makeInput(overrides?: Partial<ContractReviewGateInput>): ContractReviewGateInput {
  return {
    contractPackage: makeArtifact(),
    ...overrides,
  };
}

function makePassingRule(perspective: 'product' | 'development' | 'quality'): ContractReviewRule {
  return {
    id: `${perspective}-pass`,
    perspective,
    evaluate: () => [],
  };
}

function makeBlockerRule(
  perspective: 'product' | 'development' | 'quality',
  message = 'Blocker issue',
  artifact = 'spec.md',
): ContractReviewRule {
  return {
    id: `${perspective}-blocker`,
    perspective,
    evaluate: (): ContractFinding[] => [{
      id: `${perspective}-blocker-1`,
      perspective,
      severity: 'blocker',
      message,
      artifact,
    }],
  };
}

function makeWarningRule(perspective: 'product' | 'development' | 'quality'): ContractReviewRule {
  return {
    id: `${perspective}-warning`,
    perspective,
    evaluate: (): ContractFinding[] => [{
      id: `${perspective}-warning-1`,
      perspective,
      severity: 'warning',
      message: 'Minor concern',
    }],
  };
}

describe('ContractReviewGate', () => {
  it('passes when all four perspectives pass (no rules = no findings)', async () => {
    const gate = new ContractReviewGate();
    const result = await gate.evaluate(makeInput());

    expect(result.reviewBundle.gateConclusion).toBe('passed');
    expect(result.reviewBundle.blockers).toHaveLength(0);
    expect(result.reviewBundle.fixRequirements).toHaveLength(0);
    expect(result.reviewBundle.reviews).toHaveLength(4);
    expect(result.metadata.gateId).toBe('contract-review-gate');
    expect(result.metadata.perspectiveCount).toBe(4);
  });

  it('passes when all perspectives have passing rules', async () => {
    const gate = new ContractReviewGate({
      rules: [
        makePassingRule('product'),
        makePassingRule('development'),
        makePassingRule('quality'),
      ],
    });
    const result = await gate.evaluate(makeInput());

    expect(result.reviewBundle.gateConclusion).toBe('passed');
    expect(result.reviewBundle.reviews.every((r) => r.conclusion === 'passed')).toBe(true);
  });

  it('returns conditional when one perspective has warnings only', async () => {
    const gate = new ContractReviewGate({
      rules: [
        makePassingRule('product'),
        makeWarningRule('development'),
        makePassingRule('quality'),
      ],
    });
    const result = await gate.evaluate(makeInput());

    expect(result.reviewBundle.gateConclusion).toBe('conditional');
    const devReview = result.reviewBundle.reviews.find((r) => r.perspective === 'development');
    expect(devReview?.conclusion).toBe('conditional');
    expect(result.reviewBundle.blockers).toHaveLength(0);
  });

  it('returns rejected when one perspective has a blocker', async () => {
    const gate = new ContractReviewGate({
      rules: [
        makePassingRule('product'),
        makeBlockerRule('development', 'Infeasible architecture'),
        makePassingRule('quality'),
      ],
    });
    const result = await gate.evaluate(makeInput());

    expect(result.reviewBundle.gateConclusion).toBe('rejected');
    expect(result.reviewBundle.blockers).toHaveLength(1);
    expect(result.reviewBundle.blockers[0]!.message).toBe('Infeasible architecture');
  });

  it('generates fix requirements with responsible perspective (AC-4.16)', async () => {
    const gate = new ContractReviewGate({
      rules: [
        makeBlockerRule('product', 'FR-03 not covered', 'arc42.md'),
        makePassingRule('development'),
        makeBlockerRule('quality', 'ADR missing alternatives', 'ADR-001.md'),
      ],
    });
    const result = await gate.evaluate(makeInput());

    expect(result.reviewBundle.gateConclusion).toBe('rejected');
    expect(result.reviewBundle.fixRequirements).toHaveLength(2);

    const productFix = result.reviewBundle.fixRequirements.find(
      (f) => f.reviewResponsible === 'product',
    );
    expect(productFix).toBeDefined();
    expect(productFix!.responsibleArtifact).toBe('arc42.md');
    expect(productFix!.fixDescription).toBe('FR-03 not covered');

    const qualityFix = result.reviewBundle.fixRequirements.find(
      (f) => f.reviewResponsible === 'quality',
    );
    expect(qualityFix).toBeDefined();
    expect(qualityFix!.responsibleArtifact).toBe('ADR-001.md');
  });

  it('rejected takes precedence over conditional', async () => {
    const gate = new ContractReviewGate({
      rules: [
        makeWarningRule('product'),
        makeBlockerRule('development'),
        makePassingRule('quality'),
      ],
    });
    const result = await gate.evaluate(makeInput());

    expect(result.reviewBundle.gateConclusion).toBe('rejected');
  });

  it('covers all four perspectives in reviews (AC-4.14)', async () => {
    const gate = new ContractReviewGate();
    const result = await gate.evaluate(makeInput());

    const perspectives = result.reviewBundle.reviews.map((r) => r.perspective).sort();
    expect(perspectives).toEqual(['development', 'experience', 'product', 'quality']);
  });

  it('fix requirement defaults responsibleArtifact to unknown when no artifact', async () => {
    const rule: ContractReviewRule = {
      id: 'no-artifact-blocker',
      perspective: 'quality',
      evaluate: (): ContractFinding[] => [{
        id: 'q-1',
        perspective: 'quality',
        severity: 'blocker',
        message: 'Missing something',
        // no artifact field
      }],
    };
    const gate = new ContractReviewGate({ rules: [rule] });
    const result = await gate.evaluate(makeInput());

    expect(result.reviewBundle.fixRequirements[0]!.responsibleArtifact).toBe('unknown');
  });

  it('handles perspective evaluation failure gracefully', async () => {
    const failingRule: ContractReviewRule = {
      id: 'failing-rule',
      perspective: 'product',
      evaluate: (): ContractFinding[] => {
        throw new Error('Evaluation crashed');
      },
    };
    const gate = new ContractReviewGate({ rules: [failingRule] });
    const result = await gate.evaluate(makeInput());

    expect(result.reviewBundle.gateConclusion).toBe('rejected');
    const productReview = result.reviewBundle.reviews.find((r) => r.perspective === 'product');
    expect(productReview?.conclusion).toBe('rejected');
    expect(productReview?.reviewer).toBe('system');
  });

  it('degrades to three perspectives when hasUI=false', async () => {
    const gate = new ContractReviewGate({ hasUI: false });
    const result = await gate.evaluate(makeInput());

    expect(result.reviewBundle.reviews).toHaveLength(3);
    const perspectives = result.reviewBundle.reviews.map((r) => r.perspective).sort();
    expect(perspectives).toEqual(['development', 'product', 'quality']);
    expect(perspectives).not.toContain('experience');
  });

  it('includes experience perspective when hasUI=true (explicit)', async () => {
    const gate = new ContractReviewGate({ hasUI: true });
    const result = await gate.evaluate(makeInput());

    expect(result.reviewBundle.reviews).toHaveLength(4);
    const perspectives = result.reviewBundle.reviews.map((r) => r.perspective).sort();
    expect(perspectives).toContain('experience');
  });
});
