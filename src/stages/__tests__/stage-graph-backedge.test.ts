import { describe, expect, it } from 'vitest';

import { DEFAULT_SDD_EDGES, StageGraph } from '../../router/stage-graph.js';
import type { CleanInstallVerificationOutput } from '../clean-install-verification-types.js';
import type { PostReleaseValidationOutput } from '../post-release-validation-types.js';

describe('StageGraph — post-release-validation back-edge', () => {
  const graph = new StageGraph(DEFAULT_SDD_EDGES);

  it('has two outgoing edges from post-release-validation', () => {
    const outgoing = graph.getOutgoing('post-release-validation');
    expect(outgoing).toHaveLength(2);

    const targets = outgoing.map((e) => e.to);
    expect(targets).toContain('clean-install-verification');
    expect(targets).toContain('implement');
  });

  it('clean-install edge condition passes when canComplete is true', () => {
    const outgoing = graph.getOutgoing('post-release-validation');
    const cleanInstallEdge = outgoing.find((e) => e.to === 'clean-install-verification');

    expect(cleanInstallEdge).toBeDefined();
    expect(cleanInstallEdge!.validationCondition).toBeDefined();

    const passResult: PostReleaseValidationOutput = {
      report: {
        totalFrs: 3,
        coveredCount: 3,
        codeOnlyCount: 0,
        missingCount: 0,
        entries: [],
        gaps: 0,
        analyzedAt: '2026-01-01T00:00:00Z',
      },
      fixTasks: [],
      canComplete: true,
    };

    expect(cleanInstallEdge!.validationCondition!(passResult)).toBe(true);
  });

  it('implement back-edge condition passes when canComplete is false', () => {
    const outgoing = graph.getOutgoing('post-release-validation');
    const backEdge = outgoing.find((e) => e.to === 'implement');

    expect(backEdge).toBeDefined();
    expect(backEdge!.validationCondition).toBeDefined();

    const failResult: PostReleaseValidationOutput = {
      report: {
        totalFrs: 3,
        coveredCount: 2,
        codeOnlyCount: 0,
        missingCount: 1,
        entries: [],
        gaps: 1,
        analyzedAt: '2026-01-01T00:00:00Z',
      },
      fixTasks: [{ frId: 'FR-03', description: 'Fix FR-03' }],
      canComplete: false,
    };

    expect(backEdge!.validationCondition!(failResult)).toBe(true);
  });

  it('edges are mutually exclusive (exactly one fires for any result)', () => {
    const outgoing = graph.getOutgoing('post-release-validation');

    const passResult: PostReleaseValidationOutput = {
      report: { totalFrs: 1, coveredCount: 1, codeOnlyCount: 0, missingCount: 0, entries: [], gaps: 0, analyzedAt: '' },
      fixTasks: [],
      canComplete: true,
    };

    const failResult: PostReleaseValidationOutput = {
      report: { totalFrs: 1, coveredCount: 0, codeOnlyCount: 0, missingCount: 1, entries: [], gaps: 1, analyzedAt: '' },
      fixTasks: [{ frId: 'FR-01', description: 'Fix' }],
      canComplete: false,
    };

    // For pass: only clean-install verification fires
    const passEdges = outgoing.filter((e) => e.validationCondition?.(passResult));
    expect(passEdges).toHaveLength(1);
    expect(passEdges[0]!.to).toBe('clean-install-verification');

    // For fail: only implement fires
    const failEdges = outgoing.filter((e) => e.validationCondition?.(failResult));
    expect(failEdges).toHaveLength(1);
    expect(failEdges[0]!.to).toBe('implement');
  });

  it('clean-install verification blocks ledger when canComplete is false', () => {
    const outgoing = graph.getOutgoing('clean-install-verification');
    expect(outgoing).toHaveLength(1);
    const ledgerEdge = outgoing[0]!;
    expect(ledgerEdge.to).toBe('ledger');
    expect(ledgerEdge.validationCondition).toBeDefined();

    const passResult: CleanInstallVerificationOutput = {
      report: { l1: { pass: true, checks: [] }, l2: { pass: true, checks: [] }, l3: { pass: true, checks: [] }, overall: 'pass', failedChecks: [], fixTasks: [] },
      canComplete: true,
      artifact: { id: 'clean-report', type: 'clean-install-verification-report', path: 'docs/clean-install-report.json', createdAt: '' },
    };
    const failResult: CleanInstallVerificationOutput = {
      report: { l1: { pass: false, checks: [] }, l2: { pass: true, checks: [] }, l3: { pass: true, checks: [] }, overall: 'fail', failedChecks: [], fixTasks: [] },
      canComplete: false,
      artifact: { id: 'clean-report', type: 'clean-install-verification-report', path: 'docs/clean-install-report.json', createdAt: '' },
    };

    expect(ledgerEdge.validationCondition!(passResult)).toBe(true);
    expect(ledgerEdge.validationCondition!(failResult)).toBe(false);
  });
});
