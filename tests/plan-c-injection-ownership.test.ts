import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as sevo from '../index.js';

const STATE_KEY = Symbol.for('openclaw.sevo.promptInjectionState');

function resetSharedState() {
  // @ts-expect-error global symbol indexing
  delete globalThis[STATE_KEY];
}

describe('Plan C: SEVO pipeline discipline injection ownership', () => {
  beforeEach(resetSharedState);
  afterEach(resetSharedState);

  it('builds full discipline text with marker and four rule groups', () => {
    const text = sevo.buildSevoPipelineDiscipline(['projects/sevo/index.js']);

    // AC-14a.1/AC-14a.2: marker + four rule groups
    expect(text).toContain(sevo.SEVO_DISCIPLINE_MARKER);
    expect(text).toContain('[SEVO_CONTEXT_V1]');
    expect(text).toContain('Spec-First');
    expect(text).toContain('SEVO 入口');
    expect(text).toContain('开发→审计→复验');
    expect(text).toContain('引导式握手');

    // AC-14a.3: each group carries goal / what-to-do / Why
    expect(text).toContain('目标：');
    expect(text).toContain('做什么：');
    expect(text).toContain('Why：');

    // marker sits in the first screen (right after heading)
    const lines = text.split('\n');
    expect(lines[0]).toContain('SEVO 流水线纪律提醒');
    expect(lines[1]).toBe(sevo.SEVO_DISCIPLINE_MARKER);
  });

  it('AC-14a.4: discipline text uses no adversarial wording', () => {
    const text = sevo.buildSevoPipelineDiscipline([]);
    for (const banned of ['规避', '绕过', '阻止 Agent', '防止 Agent', '惩罚', '对抗']) {
      expect(text).not.toContain(banned);
    }
  });

  it('injects discipline even with no tracked paths (AC-14a.1: not gated by tracked project)', () => {
    const text = sevo.buildSevoPipelineDiscipline([]);
    expect(text).toContain(sevo.SEVO_DISCIPLINE_MARKER);
    expect(text).toContain('（暂无路径提示）');
  });

  it('records injection into shared state keyed by promptBuildId (no time window)', () => {
    const entry = sevo.recordSevoPromptInjection({
      sessionKey: 'agent:main:feishu:direct:ou_x',
      promptBuildId: 'run-123',
      degraded: false,
    });
    expect(entry).toBeTruthy();

    const state = sevo.getSevoPromptInjectionState();
    const stored = state.promptBuilds.get('run-123');
    expect(stored).toBeTruthy();
    expect(stored.marker).toBe(sevo.SEVO_DISCIPLINE_MARKER);
    expect(stored.degraded).toBe(false);
    expect(stored.promptBuildId).toBe('run-123');
  });

  it('bounds shared state growth to recent prompt builds', () => {
    for (let i = 0; i < 260; i++) {
      sevo.recordSevoPromptInjection({ sessionKey: 'agent:main:x', promptBuildId: `run-${i}`, degraded: false });
    }
    const state = sevo.getSevoPromptInjectionState();
    expect(state.promptBuilds.size).toBeLessThanOrEqual(200);
    // most recent entry retained
    expect(state.promptBuilds.has('run-259')).toBe(true);
  });
});
