/**
 * Router module tests — StageRouter, StageGraph, StageContext.
 */

import { describe, it, expect } from 'vitest';
import { StageRouter } from '../router/stage-router.js';
import { StageGraph, DEFAULT_SDD_EDGES, DEFAULT_SDD_GRAPH } from '../router/stage-graph.js';
import { StageContext } from '../router/stage-context.js';
import type { GateVerdict, StageId } from '../types/index.js';

// ── Helpers ─────────────────────────────────────────────────────

function makeVerdict(conclusion: 'passed' | 'conditional' | 'rejected', gateId = 'test-gate'): GateVerdict {
  return {
    gateId,
    conclusion,
    blockers: conclusion === 'rejected' ? [{ item: 'blocker', owner: 'test' }] : [],
    reviewBundles: [],
  };
}

// ── StageRouter ─────────────────────────────────────────────────

describe('StageRouter', () => {
  describe('normal flow advancement', () => {
    it('advances through default SDD stages when verdict passes', () => {
      const router = new StageRouter();
      const verdict = makeVerdict('passed');

      expect(router.advance('spec', verdict)).toBe('spec-review-gate');
      expect(router.advance('spec-review-gate', verdict)).toBe('contract');
      expect(router.advance('contract', verdict)).toBe('contract-review-gate');
      expect(router.advance('contract-review-gate', verdict)).toBe('implement');
      expect(router.advance('implement', verdict)).toBe('review');
      expect(router.advance('review', verdict)).toBe('smoke-test');
      expect(router.advance('smoke-test', verdict)).toBe('ux-acceptance');
      expect(router.advance('ux-acceptance', verdict)).toBe('regression');
      expect(router.advance('regression', verdict)).toBe('publish-generalization-gate');
      expect(router.advance('publish-generalization-gate', verdict)).toBe('deploy');
      expect(router.advance('deploy', verdict)).toBe('verify');
      expect(router.advance('verify', verdict)).toBe('post-release-validation');
      expect(router.advance('post-release-validation', verdict)).toBe('clean-install-verification');
      expect(router.advance('clean-install-verification', verdict)).toBe('ledger');
    });

    it('returns null at terminal stage (ledger)', () => {
      const router = new StageRouter();
      expect(router.advance('ledger', makeVerdict('passed'))).toBeNull();
    });
  });

  describe('gate rejection — stays at current stage', () => {
    it('returns null when verdict is rejected', () => {
      const router = new StageRouter();
      expect(router.advance('spec', makeVerdict('rejected'))).toBeNull();
    });

    it('returns null when verdict is conditional', () => {
      const router = new StageRouter();
      expect(router.advance('spec', makeVerdict('conditional'))).toBeNull();
    });
  });

  describe('conditional branch routing', () => {
    it('takes conditional edge when condition matches', () => {
      const edges = [
        {
          from: 'spec' as StageId,
          to: 'spec-review-gate' as StageId,
          condition: (v: GateVerdict) => v.blockers.length === 0,
        },
        {
          from: 'spec' as StageId,
          to: 'contract' as StageId,
          condition: (v: GateVerdict) => v.blockers.length > 0,
        },
      ];
      const graph = new StageGraph(edges);
      const router = new StageRouter(graph);

      // No blockers → spec-review-gate
      const clean = makeVerdict('passed');
      expect(router.advance('spec', clean)).toBe('spec-review-gate');

      // Has blockers → contract (hypothetical branch)
      const withBlockers: GateVerdict = {
        ...clean,
        blockers: [{ item: 'issue', owner: 'dev' }],
      };
      expect(router.advance('spec', withBlockers)).toBe('contract');
    });

    it('falls back to unconditional edge when no condition matches', () => {
      const edges = [
        {
          from: 'spec' as StageId,
          to: 'contract' as StageId,
          condition: (_v: GateVerdict) => false, // never matches
        },
        {
          from: 'spec' as StageId,
          to: 'spec-review-gate' as StageId,
          // unconditional fallback
        },
      ];
      const graph = new StageGraph(edges);
      const router = new StageRouter(graph);

      expect(router.advance('spec', makeVerdict('passed'))).toBe('spec-review-gate');
    });

    it('returns null when all conditional edges fail and no unconditional exists', () => {
      const edges = [
        {
          from: 'spec' as StageId,
          to: 'contract' as StageId,
          condition: (_v: GateVerdict) => false,
        },
      ];
      const graph = new StageGraph(edges);
      const router = new StageRouter(graph);

      expect(router.advance('spec', makeVerdict('passed'))).toBeNull();
    });
  });

  describe('custom flow registration', () => {
    it('supports setGraph for custom pipeline', () => {
      const router = new StageRouter();
      const customEdges = [
        { from: 'spec' as StageId, to: 'implement' as StageId },
        { from: 'implement' as StageId, to: 'verify' as StageId },
      ];
      const customGraph = new StageGraph(customEdges);
      router.setGraph(customGraph);

      const verdict = makeVerdict('passed');
      expect(router.advance('spec', verdict)).toBe('implement');
      expect(router.advance('implement', verdict)).toBe('verify');
      expect(router.advance('verify', verdict)).toBeNull();
    });
  });
});

// ── StageContext ────────────────────────────────────────────────

describe('StageContext', () => {
  it('tracks current stage', () => {
    const ctx = new StageContext('spec');
    expect(ctx.getCurrentStage()).toBe('spec');
  });

  it('records transitions and updates current stage', () => {
    const ctx = new StageContext('spec');
    const verdict = makeVerdict('passed');

    ctx.recordTransition('spec', 'spec-review-gate', verdict);
    expect(ctx.getCurrentStage()).toBe('spec-review-gate');
    expect(ctx.getHistory()).toHaveLength(1);
    expect(ctx.getHistory()[0]!.from).toBe('spec');
    expect(ctx.getHistory()[0]!.to).toBe('spec-review-gate');
  });

  it('maintains full transition history', () => {
    const ctx = new StageContext('spec');
    const verdict = makeVerdict('passed');

    ctx.recordTransition('spec', 'spec-review-gate', verdict);
    ctx.recordTransition('spec-review-gate', 'contract', verdict);
    ctx.recordTransition('contract', 'contract-review-gate', verdict);

    expect(ctx.getHistory()).toHaveLength(3);
    expect(ctx.getCurrentStage()).toBe('contract-review-gate');
  });

  it('manages per-stage artifacts', () => {
    const ctx = new StageContext('spec');
    const artifact = {
      id: 'art-1',
      type: 'spec-doc',
      path: '/docs/spec.md',
      createdAt: new Date().toISOString(),
    };

    ctx.addArtifacts('spec', [artifact]);
    expect(ctx.getArtifacts('spec')).toHaveLength(1);
    expect(ctx.getArtifacts('spec')[0]).toEqual(artifact);
    expect(ctx.getArtifacts('contract')).toHaveLength(0);
  });
});

// ── StageGraph ──────────────────────────────────────────────────

describe('StageGraph', () => {
  it('returns outgoing edges for a stage', () => {
    const outgoing = DEFAULT_SDD_GRAPH.getOutgoing('spec');
    expect(outgoing).toHaveLength(1);
    expect(outgoing[0]!.to).toBe('spec-review-gate');
  });

  it('returns empty array for terminal stage', () => {
    expect(DEFAULT_SDD_GRAPH.getOutgoing('ledger')).toHaveLength(0);
  });

  it('default graph has 19 edges for full SDD flow', () => {
    expect(DEFAULT_SDD_GRAPH.getAllEdges()).toHaveLength(19);
  });
});
