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

// FR-38 AC5/AC6 + FR-39a: advisory-mode spec-gap. At an entry, a detected gap must
// produce a "建议先补 spec" advance prompt WITHOUT pausing the pipeline; the main
// agent decides whether to fill the spec first.
describe('SEVO spec-gap advisory mode (FR-38 AC5/AC6 / FR-39a)', () => {
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

  it('frames the notice as a suggestion, not a block', () => {
    const text = mod.buildSpecGapAdvisory(baseResult);

    expect(text).toContain('建议先补 spec');
    expect(text).toContain('建议');
    // Must NOT claim the pipeline is paused/blocked (advisory, not blocking).
    expect(text).not.toContain('已暂停');
    expect(text).toContain('由主 Agent 决定');
  });

  it('includes target stage and entry type so the main agent has context', () => {
    const text = mod.buildSpecGapAdvisory(baseResult);

    expect(text).toContain('implement');
    expect(text).toContain('fix');
  });

  it('lists every missing gap item and related FR/AC', () => {
    const text = mod.buildSpecGapAdvisory(baseResult);

    for (const m of baseResult.missing) {
      expect(text).toContain(m);
    }
    expect(text).toContain('FR-B01');
    expect(text).toContain('AC15');
  });

  it('falls back to the reason when there is no explicit missing list', () => {
    const text = mod.buildSpecGapAdvisory({
      entryType: 'from',
      targetStage: 'review',
      reason: 'coverage could not be confirmed',
      missing: [],
    });

    expect(text).toContain('coverage could not be confirmed');
  });

  it('does not pause the pipeline (noticeSpecGapAdvisory is a no-throw advisory emit)', () => {
    // noticeSpecGapAdvisory only pushes a notice + appends an audit event; it must
    // never throw or touch pipeline pause state for an unregistered pipeline.
    expect(() =>
      mod.noticeSpecGapAdvisory('nonexistent-pipeline-id-for-test', baseResult, 'aco'),
    ).not.toThrow();
  });
});
