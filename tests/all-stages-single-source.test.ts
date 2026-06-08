import { describe, it, expect } from 'vitest';
import * as mod from '../index.js';

// P0-2 单一阶段源 guard：ALL_STAGES 是唯一 canonical 有序阶段列表，
// FULL_PIPELINE_STAGES 与 FALLBACK_STAGE_ORDER 全部从它派生，不允许各自维护。
const {
  ALL_STAGES,
  AUX_STAGE_IDS,
  FULL_PIPELINE_STAGES,
  FALLBACK_STAGE_ORDER,
  STAGE_IDS,
  buildPipelineStagePlan,
} = mod as any;

describe('P0-2: single canonical stage source', () => {
  it('ALL_STAGES is the canonical ordered list with no duplicates', () => {
    expect(Array.isArray(ALL_STAGES)).toBe(true);
    expect(new Set(ALL_STAGES).size).toBe(ALL_STAGES.length);
  });

  it('FALLBACK_STAGE_ORDER equals ALL_STAGES (derived, not maintained separately)', () => {
    expect([...FALLBACK_STAGE_ORDER]).toEqual([...ALL_STAGES]);
  });

  it('FULL_PIPELINE_STAGES = ALL_STAGES minus AUX_STAGE_IDS, order preserved', () => {
    const derived = ALL_STAGES.filter((s: string) => !AUX_STAGE_IDS.has(s));
    expect([...FULL_PIPELINE_STAGES]).toEqual(derived);
  });

  it('every FULL_PIPELINE_STAGES entry is a member of ALL_STAGES', () => {
    for (const sid of FULL_PIPELINE_STAGES) {
      expect(ALL_STAGES).toContain(sid);
    }
  });

  it('AUX stages are not in the main pipeline chain', () => {
    for (const sid of AUX_STAGE_IDS) {
      expect(FULL_PIPELINE_STAGES).not.toContain(sid);
    }
  });

  it('canonical chain unconditionally includes the spec, design and gate stages (原则 12)', () => {
    for (const sid of [
      STAGE_IDS.SPEC,
      STAGE_IDS.SPEC_REVIEW_GATE,
      STAGE_IDS.UX_INTERACTION_DESIGN,
      STAGE_IDS.ARCHITECTURE_DESIGN,
      STAGE_IDS.CONTRACT,
      STAGE_IDS.CONTRACT_REVIEW_GATE,
    ]) {
      expect(FULL_PIPELINE_STAGES).toContain(sid);
    }
  });

  it('buildPipelineStagePlan returns the full chain with no skipped stages', () => {
    const plan = buildPipelineStagePlan();
    expect(plan.requiredStages).toEqual([...FULL_PIPELINE_STAGES]);
    expect(plan.skippedStages).toEqual([]);
  });
});
