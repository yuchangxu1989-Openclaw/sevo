import { describe, it, expect } from 'vitest';
import { isProtectedStage, canSkip, canEnterFrom, FULL_PIPELINE_STAGES } from '../src/stage-policy.js';

describe('stage-policy', () => {
  describe('FULL_PIPELINE_STAGES', () => {
    it('contains exactly 23 stages', () => {
      expect(FULL_PIPELINE_STAGES).toHaveLength(23);
    });

    it('is frozen', () => {
      expect(Object.isFrozen(FULL_PIPELINE_STAGES)).toBe(true);
    });

    it('starts with spec and ends with ledger', () => {
      expect(FULL_PIPELINE_STAGES[0]).toBe('spec');
      expect(FULL_PIPELINE_STAGES[22]).toBe('ledger');
    });
  });

  describe('isProtectedStage', () => {
    it('returns true for explicitly protected stages', () => {
      expect(isProtectedStage('review')).toBe(true);
      expect(isProtectedStage('implement')).toBe(true);
      expect(isProtectedStage('fix')).toBe(true);
      expect(isProtectedStage('spec-review-gate')).toBe(true);
      expect(isProtectedStage('contract-review-gate')).toBe(true);
      expect(isProtectedStage('publish-generalization-gate')).toBe(true);
      expect(isProtectedStage('pm-commercial-review')).toBe(true);
    });

    it('returns true for stages containing review or audit', () => {
      expect(isProtectedStage('some-review-step')).toBe(true);
      expect(isProtectedStage('audit-gate')).toBe(true);
    });

    it('returns false for non-protected stages', () => {
      expect(isProtectedStage('spec')).toBe(false);
      expect(isProtectedStage('deploy')).toBe(false);
      expect(isProtectedStage('ledger')).toBe(false);
      expect(isProtectedStage('smoke-test')).toBe(false);
    });
  });

  describe('canSkip', () => {
    it('returns false for protected stages', () => {
      expect(canSkip('review')).toBe(false);
      expect(canSkip('implement')).toBe(false);
      expect(canSkip('spec-review-gate')).toBe(false);
    });

    it('returns true for non-protected stages', () => {
      expect(canSkip('spec')).toBe(true);
      expect(canSkip('deploy')).toBe(true);
      expect(canSkip('regression')).toBe(true);
    });
  });

  describe('canEnterFrom', () => {
    it('returns allowed with no advisories when all prior protected stages are completed', () => {
      const completed = ['spec-review-gate', 'contract-review-gate', 'implement', 'review', 'fix'];
      const result = canEnterFrom('smoke-test', completed);
      expect(result.allowed).toBe(true);
      expect(result.advisories).toHaveLength(0);
    });

    it('returns advisories for uncompleted protected prior stages', () => {
      const result = canEnterFrom('implement', []);
      expect(result.allowed).toBe(true);
      expect(result.advisories.length).toBeGreaterThan(0);
      expect(result.advisories.some((a) => a.stageId === 'spec-review-gate')).toBe(true);
    });

    it('returns not allowed for unknown stage', () => {
      const result = canEnterFrom('nonexistent-stage', []);
      expect(result.allowed).toBe(false);
      expect(result.advisories[0].reason).toContain('not in pipeline');
    });

    it('returns allowed with empty advisories for the first stage', () => {
      const result = canEnterFrom('spec', []);
      expect(result.allowed).toBe(true);
      expect(result.advisories).toHaveLength(0);
    });
  });
});
