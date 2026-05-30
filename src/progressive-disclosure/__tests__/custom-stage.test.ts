import { describe, it, expect, beforeEach } from 'vitest';
import { CustomStageRegistry } from '../custom-stage.js';
import type { CustomStageDefinition } from '../custom-stage.js';
import { ALL_STAGES, STAGE_IDS } from '../../constants.js';

describe('CustomStageRegistry (L2 Progressive Disclosure)', () => {
  let registry: CustomStageRegistry;

  beforeEach(() => {
    registry = new CustomStageRegistry();
  });

  // ── Registration ──

  describe('register', () => {
    it('registers a valid custom stage', () => {
      const def: CustomStageDefinition = {
        stageId: 'security-audit',
        name: 'Security Audit',
        description: 'Run OWASP security checks',
        anchorStage: STAGE_IDS.REVIEW,
        position: 'after',
      };

      const result = registry.register(def);

      expect(result.success).toBe(true);
      expect(result.stageId).toBe('security-audit');
      expect(result.errors).toHaveLength(0);
    });

    it('rejects registration with a built-in stage ID', () => {
      const def: CustomStageDefinition = {
        stageId: 'spec',
        name: 'Duplicate Spec',
        anchorStage: STAGE_IDS.IMPLEMENT,
        position: 'before',
      };

      const result = registry.register(def);

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('collides with a built-in stage');
    });

    it('rejects duplicate registration', () => {
      const def: CustomStageDefinition = {
        stageId: 'perf-test',
        name: 'Performance Test',
        anchorStage: STAGE_IDS.SMOKE_TEST,
        position: 'after',
      };

      registry.register(def);
      const result = registry.register(def);

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('already registered');
    });

    it('rejects registration with invalid anchor stage', () => {
      const def: CustomStageDefinition = {
        stageId: 'my-stage',
        name: 'My Stage',
        anchorStage: 'nonexistent' as any,
        position: 'before',
      };

      const result = registry.register(def);

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('not a valid built-in stage');
    });
  });

  // ── Query ──

  describe('get / list / isCustomStage', () => {
    it('retrieves a registered stage by ID', () => {
      registry.register({
        stageId: 'a11y-check',
        name: 'Accessibility Check',
        anchorStage: STAGE_IDS.UX_ACCEPTANCE,
        position: 'before',
      });

      const def = registry.get('a11y-check');
      expect(def).toBeDefined();
      expect(def!.name).toBe('Accessibility Check');
    });

    it('returns undefined for unknown stage ID', () => {
      expect(registry.get('unknown')).toBeUndefined();
    });

    it('lists all registered stages', () => {
      registry.register({
        stageId: 'stage-a',
        name: 'A',
        anchorStage: STAGE_IDS.IMPLEMENT,
        position: 'before',
      });
      registry.register({
        stageId: 'stage-b',
        name: 'B',
        anchorStage: STAGE_IDS.REVIEW,
        position: 'after',
      });

      expect(registry.list()).toHaveLength(2);
    });

    it('isCustomStage returns true for registered, false for built-in', () => {
      registry.register({
        stageId: 'custom-one',
        name: 'Custom',
        anchorStage: STAGE_IDS.DEPLOY,
        position: 'before',
      });

      expect(registry.isCustomStage('custom-one')).toBe(true);
      expect(registry.isCustomStage('spec')).toBe(false);
    });
  });

  // ── Unregister ──

  describe('unregister', () => {
    it('removes a registered stage', () => {
      registry.register({
        stageId: 'temp-stage',
        name: 'Temp',
        anchorStage: STAGE_IDS.LEDGER,
        position: 'before',
      });

      expect(registry.unregister('temp-stage')).toBe(true);
      expect(registry.get('temp-stage')).toBeUndefined();
    });

    it('returns false for unknown stage', () => {
      expect(registry.unregister('nope')).toBe(false);
    });
  });

  // ── Stage Sequence Resolution (AC-15.3) ──

  describe('resolveStageSequence', () => {
    it('inserts a custom stage after its anchor', () => {
      registry.register({
        stageId: 'security-audit',
        name: 'Security Audit',
        anchorStage: STAGE_IDS.REVIEW,
        position: 'after',
      });

      const resolved = registry.resolveStageSequence(ALL_STAGES);
      const reviewIdx = resolved.indexOf('review');
      const customIdx = resolved.indexOf('security-audit');

      expect(customIdx).toBe(reviewIdx + 1);
    });

    it('inserts a custom stage before its anchor', () => {
      registry.register({
        stageId: 'pre-deploy-check',
        name: 'Pre-Deploy Check',
        anchorStage: STAGE_IDS.DEPLOY,
        position: 'before',
      });

      const resolved = registry.resolveStageSequence(ALL_STAGES);
      const deployIdx = resolved.indexOf('deploy');
      const customIdx = resolved.indexOf('pre-deploy-check');

      expect(customIdx).toBe(deployIdx - 1);
    });

    it('preserves original stages when no custom stages registered', () => {
      const resolved = registry.resolveStageSequence(ALL_STAGES);
      expect(resolved).toEqual([...ALL_STAGES]);
    });

    it('handles multiple custom stages at different anchors', () => {
      registry.register({
        stageId: 'perf-test',
        name: 'Perf Test',
        anchorStage: STAGE_IDS.SMOKE_TEST,
        position: 'after',
      });
      registry.register({
        stageId: 'security-scan',
        name: 'Security Scan',
        anchorStage: STAGE_IDS.IMPLEMENT,
        position: 'after',
      });

      const resolved = registry.resolveStageSequence(ALL_STAGES);

      expect(resolved.indexOf('security-scan')).toBe(resolved.indexOf('implement') + 1);
      expect(resolved.indexOf('perf-test')).toBe(resolved.indexOf('smoke-test') + 1);
      // Total length = original + 2 custom
      expect(resolved.length).toBe(ALL_STAGES.length + 2);
    });
  });

  // ── createStageRecord ──

  describe('createStageRecord', () => {
    it('creates a pending StageRecord for a registered custom stage', () => {
      registry.register({
        stageId: 'my-stage',
        name: 'My Stage',
        anchorStage: STAGE_IDS.REVIEW,
        position: 'after',
      });

      const record = registry.createStageRecord('my-stage');
      expect(record).toBeDefined();
      expect(record!.stageId).toBe('my-stage');
      expect(record!.status).toBe('pending');
      expect(record!.artifacts).toEqual([]);
    });

    it('returns undefined for unregistered stage', () => {
      expect(registry.createStageRecord('nope')).toBeUndefined();
    });
  });
});
