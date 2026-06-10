import { describe, expect, it } from 'vitest';
import { getCheckPlan, formatCheckPlan, LAYERS, REVIEW_STAGE_IDS } from '../src/consistency-check-plan.js';

describe('consistency-check-plan', () => {
  it('returns null for non-review stages', () => {
    expect(getCheckPlan('implement')).toBeNull();
    expect(getCheckPlan('deploy')).toBeNull();
    expect(getCheckPlan('spec')).toBeNull();
  });

  it('returns a plan with layers and checkItems for review stages', () => {
    for (const stageId of REVIEW_STAGE_IDS) {
      const plan = getCheckPlan(stageId);
      expect(plan).not.toBeNull();
      expect(plan.layers).toEqual([...LAYERS]);
      expect(plan.checkItems.length).toBeGreaterThan(0);
      for (const item of plan.checkItems) {
        expect(item).toHaveProperty('from');
        expect(item).toHaveProperty('to');
        expect(item).toHaveProperty('question');
        expect(LAYERS).toContain(item.from);
        expect(LAYERS).toContain(item.to);
      }
    }
  });

  it('returns stage-specific items for known review stages', () => {
    const reviewPlan = getCheckPlan('review');
    const specGatePlan = getCheckPlan('spec-review-gate');
    expect(reviewPlan.checkItems).not.toEqual(specGatePlan.checkItems);
  });

  it('formatCheckPlan returns empty string for non-review stages', () => {
    expect(formatCheckPlan('implement')).toBe('');
    expect(formatCheckPlan('deploy')).toBe('');
  });

  it('formatCheckPlan returns structured text for review stages', () => {
    const text = formatCheckPlan('review');
    expect(text).toContain('[Consistency Check Plan]');
    expect(text).toContain('Layers:');
    expect(text).toContain('Check items:');
    expect(text).toContain('[spec → implementation]');
  });

  it('check items are immutable copies (no shared references)', () => {
    const plan1 = getCheckPlan('review');
    const plan2 = getCheckPlan('review');
    expect(plan1.checkItems).toEqual(plan2.checkItems);
    expect(plan1.checkItems).not.toBe(plan2.checkItems);
  });
});
