import { describe, it, expect } from 'vitest';
import * as mod from '../index.js';

// 原则1 / AC-27.1b: a spec-integrity gap at any entry must auto-dispatch the spec
// stage to fill the gap (instead of dead-ending at a manual-resume pause) and
// auto-recover on spec completion. These tests pin the pure, deterministic parts
// of that behavior.

describe('SEVO spec-gap auto-advance (原则1 / AC-27.1b)', () => {
  describe('buildSpecGapSupplement', () => {
    const baseResult = {
      entryType: 'fix',
      projectSlug: 'aco',
      targetStage: 'implement',
      verdict: 'incomplete',
      reason: 'spec does not cover the dispatch-guard why-backfill task',
      missing: [
        'A numbered FR requiring dispatch-guard injection text to include Why.',
        'A specific AC verifying every injected segment contains a Why line.',
      ],
      relatedFRs: ['FR-B01'],
      relatedACs: ['AC15'],
      resumeCondition: 'Add the FR/AC and pass Spec Review Gate.',
    };

    it('includes the spec-gap header and target stage so the author knows the context', () => {
      const text = mod.buildSpecGapSupplement(baseResult);

      expect(text).toContain('[SEVO Spec Gap');
      expect(text).toContain('implement');
      expect(text).toContain('fix');
    });

    it('lists every missing gap item', () => {
      const text = mod.buildSpecGapSupplement(baseResult);

      for (const m of baseResult.missing) {
        expect(text).toContain(m);
      }
    });

    it('surfaces related FRs and ACs', () => {
      const text = mod.buildSpecGapSupplement(baseResult);

      expect(text).toContain('FR-B01');
      expect(text).toContain('AC15');
    });

    it('falls back to the reason when there is no explicit missing list', () => {
      const text = mod.buildSpecGapSupplement({
        entryType: 'from',
        targetStage: 'review',
        reason: 'coverage could not be confirmed',
        missing: [],
      });

      expect(text).toContain('coverage could not be confirmed');
    });

    it('tells the user recovery is automatic (no manual sevo:resume needed)', () => {
      const text = mod.buildSpecGapSupplement(baseResult);

      expect(text).toContain('自动');
      expect(text).toContain('sevo:resume');
    });
  });

  describe('auto-fill bound', () => {
    it('caps spec-gap auto re-dispatch rounds to a finite number', () => {
      expect(mod.MAX_SPEC_GAP_AUTOFILL_ROUNDS).toBeGreaterThan(0);
      expect(Number.isInteger(mod.MAX_SPEC_GAP_AUTOFILL_ROUNDS)).toBe(true);
    });
  });

  describe('recoverFromSpecGapOnCompletion guard', () => {
    it('is a no-op for a pipeline that is not paused at spec-gap', async () => {
      // Unknown pipeline id → not registered → must report handled:false so the
      // completion handler falls through to the normal advance path untouched.
      const result = await mod.recoverFromSpecGapOnCompletion(
        'nonexistent-pipeline-id-for-test',
        'aco',
        '.',
      );

      expect(result).toEqual({ recovered: false, handled: false });
    });
  });
});
