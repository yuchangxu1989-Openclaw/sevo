import { describe, it, expect } from 'vitest';
import * as mod from '../index.js';

// P1-3: mandatory gate stages must fail closed when no structured verdict is
// present, and a canonical [SEVO_GATE_VERDICT] block must be parsed when given.
describe('P1-3 gate verdict fail-closed', () => {
  it('marks the canonical gate stages as mandatory', () => {
    expect(mod.isMandatoryGateStage('spec-review-gate')).toBe(true);
    expect(mod.isMandatoryGateStage('contract-review-gate')).toBe(true);
    expect(mod.isMandatoryGateStage('review')).toBe(true);
    expect(mod.isMandatoryGateStage('verify')).toBe(true);
    expect(mod.isMandatoryGateStage('implement')).toBe(false);
  });

  it('returns null when no structured verdict is present (caller fails closed)', () => {
    expect(mod.parseGateVerdict({ status: 'succeeded', output: 'looks good to me' })).toBeNull();
  });

  it('resolves a missing mandatory gate verdict to failed even when completion succeeded', () => {
    const resolved = mod.resolveCompletionOutcomeForStage('review', { status: 'succeeded', output: 'looks good to me' });
    expect(resolved.outcome).toBe('failed');
    expect(resolved.gateVerdict).toBeNull();
    expect(resolved.missingMandatoryGateVerdict).toBe(true);
    expect(resolved.verdictBlockers[0].item).toContain('mandatory gate produced no structured verdict');
  });

  it('does not fail-close non-gate stages without a structured verdict', () => {
    const resolved = mod.resolveCompletionOutcomeForStage('implement', { status: 'succeeded', output: 'implementation done' });
    expect(resolved.outcome).toBe('passed');
    expect(resolved.missingMandatoryGateVerdict).toBe(false);
  });

  it('parses a pre-computed conclusion verdict', () => {
    const v = mod.parseGateVerdict({ result: { conclusion: 'rejected', blockers: [{ item: 'x' }] } });
    expect(v.conclusion).toBe('rejected');
    expect(v.blockers).toHaveLength(1);
  });

  it('parses a canonical [SEVO_GATE_VERDICT] block from free text', () => {
    const text = 'report...\n[SEVO_GATE_VERDICT] conclusion=conditional blockers=AC-1; AC-2 [/SEVO_GATE_VERDICT]\nmore';
    const v = mod.parseGateVerdict({ output: text });
    expect(v.conclusion).toBe('conditional');
    expect(v.blockers.map((b: any) => b.item)).toEqual(['AC-1', 'AC-2']);
  });

  it('treats a present-but-malformed verdict block as rejected', () => {
    const v = mod.parseGateVerdictBlock('[SEVO_GATE_VERDICT] no conclusion here [/SEVO_GATE_VERDICT]');
    expect(v.conclusion).toBe('rejected');
  });

  it('reads conclusion=passed with no blockers', () => {
    const v = mod.parseGateVerdict({ output: '[SEVO_GATE_VERDICT] conclusion=passed blockers=none [/SEVO_GATE_VERDICT]' });
    expect(v.conclusion).toBe('passed');
    expect(v.blockers).toHaveLength(0);
  });

  it('never returns passed on a parser exception', () => {
    // A getter that throws when the parser touches evt.result.
    const evil: any = {};
    Object.defineProperty(evil, 'result', { get() { throw new Error('boom'); } });
    const v = mod.parseGateVerdict(evil);
    expect(v).not.toBeNull();
    expect(v.conclusion).toBe('rejected');
  });
});
