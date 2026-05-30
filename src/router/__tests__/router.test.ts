import { describe, it, expect } from 'vitest';
import { route } from '../router.js';
import { classifyLevel } from '../level-classifier.js';
import { DEFAULT_SDD_GRAPH } from '../stage-graph.js';
import type { PipelineTask, TaskScope } from '../../types/index.js';

// ── helpers ─────────────────────────────────────────────────────

function makeTask(scope: TaskScope, overrides?: Partial<PipelineTask>): PipelineTask {
  return {
    taskId: overrides?.taskId ?? 'task-001',
    title: overrides?.title ?? 'Test task',
    description: overrides?.description,
    scope,
  };
}

// ── classifyLevel ───────────────────────────────────────────────

describe('classifyLevel', () => {
  it('returns L0 for micro-change with userExplicitL0=true (single file, <50 lines)', () => {
    const result = classifyLevel({ userExplicitL0: true, estimatedFiles: 1, estimatedLines: 30 });
    expect(result.level).toBe('L0');
    expect(result.matchedRules).toEqual([]);
  });

  it('returns L1 (not L0) when scope is empty — L0 must be explicit (FR-2 AC3)', () => {
    const result = classifyLevel({});
    expect(result.level).toBe('L1');
  });

  it('returns L1 for medium change (multi-file, <500 lines, single domain)', () => {
    const result = classifyLevel({
      estimatedFiles: 5,
      estimatedLines: 200,
      affectedDomains: ['router'],
    });
    expect(result.level).toBe('L1');
    expect(result.matchedRules).toEqual([]);
  });

  it('returns L1 for single file with 50+ lines (exceeds L0 threshold)', () => {
    const result = classifyLevel({ estimatedFiles: 1, estimatedLines: 50 });
    expect(result.level).toBe('L1');
  });

  it('returns L2+ for new module', () => {
    const result = classifyLevel({ isNewModule: true });
    expect(result.level).toBe('L2+');
    expect(result.matchedRules).toContain('new-module');
  });

  it('returns L2+ for cross-domain change (≥2 domains)', () => {
    const result = classifyLevel({ affectedDomains: ['router', 'pipeline'] });
    expect(result.level).toBe('L2+');
    expect(result.matchedRules).toContain('cross-domain');
  });

  it('returns L2+ for large change (≥500 lines)', () => {
    const result = classifyLevel({ estimatedLines: 500 });
    expect(result.level).toBe('L2+');
    expect(result.matchedRules).toContain('large-change');
  });

  it('returns L2+ for large change (≥10 files)', () => {
    const result = classifyLevel({ estimatedFiles: 10 });
    expect(result.level).toBe('L2+');
    expect(result.matchedRules).toContain('large-change');
  });

  it('returns L2+ for data model change', () => {
    const result = classifyLevel({ hasDataModelChange: true });
    expect(result.level).toBe('L2+');
    expect(result.matchedRules).toContain('data-model-change');
  });

  it('returns L2+ for governance change', () => {
    const result = classifyLevel({ hasGovernanceChange: true });
    expect(result.level).toBe('L2+');
    expect(result.matchedRules).toContain('governance-change');
  });

  it('returns L2+ for release target change', () => {
    const result = classifyLevel({ hasReleaseTargetChange: true });
    expect(result.level).toBe('L2+');
    expect(result.matchedRules).toContain('release-target-change');
  });

  it('returns L2+ for user explicit full pipeline', () => {
    const result = classifyLevel({ userExplicitFullPipeline: true });
    expect(result.level).toBe('L2+');
    expect(result.matchedRules).toContain('user-explicit');
  });

  it('accumulates multiple matched rules', () => {
    const result = classifyLevel({
      isNewModule: true,
      affectedDomains: ['a', 'b', 'c'],
      estimatedLines: 1000,
      hasDataModelChange: true,
    });
    expect(result.level).toBe('L2+');
    expect(result.matchedRules).toEqual([
      'new-module',
      'cross-domain',
      'large-change',
      'data-model-change',
    ]);
  });
});

// ── route ───────────────────────────────────────────────────────

describe('route', () => {
  describe('validation', () => {
    it('rejects empty taskId', async () => {
      const result = await route(makeTask({}, { taskId: '' }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_TASK_ID');
      }
    });

    it('rejects empty title', async () => {
      const result = await route(makeTask({}, { title: '  ' }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_TITLE');
      }
    });
  });

  describe('L0 routing', () => {
    it('returns 5 required stages for L0 (with userExplicitL0)', async () => {
      const result = await route(
        makeTask({ userExplicitL0: true, estimatedFiles: 1, estimatedLines: 10 }),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.level).toBe('L0');
      expect(result.value.requiredStages).toEqual([
        'implement',
        'review',
        'regression',
        'verify',
        'ledger',
      ]);
    });

    it('skips 16 stages for L0 with reasons', async () => {
      const result = await route(
        makeTask({ userExplicitL0: true, estimatedFiles: 1, estimatedLines: 10 }),
      );
      if (!result.ok) return;

      expect(result.value.skippedStages).toHaveLength(16);
      const skippedIds = result.value.skippedStages.map((s) => s.stage);
      expect(skippedIds).toEqual([
        'spec',
        'spec-review-gate',
        'test-case-authoring',
        'ux-acceptance-authoring',
        'commercial-acceptance-authoring',
        'ux-interaction-design',
        'architecture-design',
        'contract',
        'contract-review-gate',
        'smoke-test',
        'ux-acceptance',
        'pm-commercial-review',
        'publish-generalization-gate',
        'deploy',
        'post-release-validation',
        'clean-install-verification',
      ]);
      // Every skipped stage has a non-empty reason
      for (const s of result.value.skippedStages) {
        expect(s.reason.length).toBeGreaterThan(0);
      }
    });
  });

  describe('L1 routing', () => {
    it('returns selected design-aware stages for L1', async () => {
      const result = await route(makeTask({ estimatedFiles: 3, estimatedLines: 100 }));
      if (!result.ok) return;

      expect(result.value.level).toBe('L1');
      expect(result.value.requiredStages).toHaveLength(20);
      expect(result.value.requiredStages).toContain('ux-interaction-design');
      expect(result.value.skippedStages).toHaveLength(1);
      expect(result.value.skippedStages[0]?.stage).toBe('architecture-design');
    });
  });

  describe('L2+ routing', () => {
    it('returns selected design-aware stages for L2+', async () => {
      const result = await route(makeTask({ isNewModule: true, estimatedLines: 800 }));
      if (!result.ok) return;

      expect(result.value.level).toBe('L2+');
      expect(result.value.requiredStages).toHaveLength(21);
      expect(result.value.requiredStages).toContain('ux-interaction-design');
      expect(result.value.requiredStages).toContain('architecture-design');
      expect(result.value.skippedStages).toHaveLength(0);
      expect(result.value.matchedRules.length).toBeGreaterThan(0);
    });

    it('includes matchedRules in result', async () => {
      const result = await route(makeTask({
        affectedDomains: ['router', 'gate'],
        hasDataModelChange: true,
      }));
      if (!result.ok) return;

      expect(result.value.matchedRules).toContain('cross-domain');
      expect(result.value.matchedRules).toContain('data-model-change');
    });
  });

  describe('determinism (AC-3.1)', () => {
    it('produces identical results for identical input', async () => {
      delete process.env.OPENAI_API_KEY;
      const task = makeTask({ estimatedFiles: 5, estimatedLines: 200 });
      const a = await route(task);
      const b = await route(task);
      expect(a).toEqual(b);
    });
  });

  describe('traceability (AC-3.2, AC-3.3)', () => {
    it('every task gets a stage list and skip reasons', async () => {
      const levels: TaskScope[] = [
        { userExplicitL0: true, estimatedFiles: 1, estimatedLines: 10 },
        { estimatedFiles: 5, estimatedLines: 200 },
        { isNewModule: true },
      ];
      for (const scope of levels) {
        const result = await route(makeTask(scope));
        expect(result.ok).toBe(true);
        if (!result.ok) continue;
        expect(result.value.requiredStages.length).toBeGreaterThan(0);
        // required + skipped = all stages
        const total =
          result.value.requiredStages.length + result.value.skippedStages.length;
        expect(total).toBe(21);
      }
    });
  });

  describe('DEFAULT_SDD_GRAPH parallel edges', () => {
    it('smoke-test has two outgoing edges to ux-acceptance and pm-commercial-review', () => {
      const outgoing = DEFAULT_SDD_GRAPH.getOutgoing('smoke-test' as any);
      expect(outgoing).toHaveLength(2);
      const targets = outgoing.map(e => e.to);
      expect(targets).toContain('ux-acceptance');
      expect(targets).toContain('pm-commercial-review');
    });

    it('both ux-acceptance and pm-commercial-review have edges into regression', () => {
      const fromUx = DEFAULT_SDD_GRAPH.getOutgoing('ux-acceptance' as any);
      const fromPm = DEFAULT_SDD_GRAPH.getOutgoing('pm-commercial-review' as any);
      expect(fromUx.some(e => e.to === 'regression')).toBe(true);
      expect(fromPm.some(e => e.to === 'regression')).toBe(true);
    });
  });
});
