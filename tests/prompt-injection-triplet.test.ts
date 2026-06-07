import { describe, expect, it } from 'vitest';
import * as mod from '../index.js';

function expectTriplet(text: string) {
  expect(text).toContain('目标：');
  expect(text).toContain('做什么：');
  expect(text).toContain('Why：');
}

describe('before_prompt_build injection text quality', () => {
  it('builds route guidance with goal, action, and why', () => {
    const guidance = mod.buildSevoRouteGuidance('任务引用 sevo 源码路径/构建命令', 'sevo');

    expectTriplet(guidance);
    expect(guidance).toContain('可追溯到 spec FR/AC');
    expect(guidance).toContain('sevo:fix / sevo:implement');
    expect(guidance).toContain('禁止裸 spawn');
    expect(guidance).toContain('代码不可追溯、审计断裂、dispatch-guard 阻塞');
    expect(guidance.length).toBeLessThan(500);
  });

  it('builds permanent route reference with goal, action, and why', () => {
    const reference = mod.buildSevoContextQuickReference(['projects/sevo/index.js'], ['sevo']);

    expectTriplet(reference);
    expect(reference).toContain('每个代码变更可追溯到 spec FR/AC');
    expect(reference).toContain('sevo:implement / sevo:fix / sevo:from');
    expect(reference).toContain('用户追问时无法证明质量');
    expect(reference.length).toBeLessThan(500);
  });

  it('summarizes many tracked paths to keep permanent route reference concise', () => {
    const paths = Array.from({ length: 20 }, (_, i) => `projects/p${i}/src/index-${i}.ts`);
    const reference = mod.buildSevoContextQuickReference(paths, ['sevo']);

    expectTriplet(reference);
    expect(reference).toContain('… +17 more');
    expect(reference).not.toContain('projects/p19/src/index-19.ts');
    expect(reference.length).toBeLessThan(500);
  });


  it('wraps arbitrary notices without duplicating complete triplets', () => {
    const notice = mod.withInjectionTriplet('[SEVO Notice] Action: retry stage implement.', {
      title: '[SEVO Notice] 流水线状态提醒',
      goal: '把流水线事件转成可执行下一步。',
      action: '按提醒中的 Action 处理。',
      why: '忽略提醒会导致阶段卡住。',
    });

    expectTriplet(notice);
    expect(notice).toContain('[SEVO Notice] Action: retry stage implement.');
    expect(mod.withInjectionTriplet(notice, {
      title: 'unused',
      goal: 'unused',
      action: 'unused',
      why: 'unused',
    })).toBe(notice);
  });
});
