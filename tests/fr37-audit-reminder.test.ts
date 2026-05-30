import { describe, it, expect, beforeEach } from 'vitest';
import * as mod from '../index.js';

const GLOBAL_KEY = Symbol.for('openclaw.sevo-pipeline.instance');

describe('sevo FR-37 audit reminder helpers', () => {
  beforeEach(() => {
    mod.resetFr37AuditReminderStateForTests();
    mod.consumeFr37AuditRemindersForTests();
    const globalState = (globalThis as any)[GLOBAL_KEY];
    if (globalState) {
      globalState.pendingNotices = [];
    }
  });

  it('queues a reminder for succeeded implement completion', () => {
    const queued = mod.queueFr37AuditReminder({
      label: 'sevo:demo:implement:1',
      status: 'succeeded',
      sessionId: 'session-1',
    });

    expect(queued).toBe(true);
    expect(mod.isFr37DevelopmentCompletion({
      label: 'sevo:demo:implement:1',
      status: 'succeeded',
    })).toBe(true);

    const [reminder] = mod.consumeFr37AuditRemindersForTests();
    expect(reminder).toContain('[SEVO-FR37] 开发任务完成，请立即派发审计：');
    expect(reminder).toContain('- 被审计任务：sevo:demo:implement:1');
    expect(reminder).toContain('- 建议审计 agent：audit-01（若 busy 则 audit-02）');
    expect(reminder).toContain('- 审计范围：检查改动文件的 node --check、spec 符合度、逻辑正确性');
  });

  it('queues reminders for free-form development labels and deduplicates by session', () => {
    const event = {
      label: 'sevo:fix kivo 修复卡住问题',
      status: 'succeeded',
      sessionId: 'session-fix-1',
    };

    expect(mod.queueFr37AuditReminder(event)).toBe(true);
    expect(mod.queueFr37AuditReminder(event)).toBe(false);
    expect(mod.queueFr37AuditReminder({
      label: 'sevo:fix kivo 修复 review 按钮卡住',
      status: 'succeeded',
      sessionId: 'session-fix-review',
    })).toBe(true);
    expect(mod.queueFr37AuditReminder({
      label: 'sevo:implement kivo 修复 audit 页面卡住',
      status: 'succeeded',
      sessionId: 'session-implement-audit',
    })).toBe(true);
    expect(mod.consumeFr37AuditRemindersForTests()).toHaveLength(3);
  });

  it('skips failed completions and actual audit or review tasks', () => {
    expect(mod.queueFr37AuditReminder({
      label: 'sevo:demo:implement:1',
      status: 'failed',
      sessionId: 'failed-1',
    })).toBe(false);

    expect(mod.queueFr37AuditReminder({
      label: 'sevo:demo:review:1',
      status: 'succeeded',
      sessionId: 'review-1',
    })).toBe(false);

    expect(mod.queueFr37AuditReminder({
      label: 'sevo:demo:implement-audit-fix:1',
      status: 'succeeded',
      sessionId: 'audit-1',
    })).toBe(false);

    expect(mod.queueFr37AuditReminder({
      label: 'sevo:implement-review foo',
      status: 'succeeded',
      sessionId: 'review-word-1',
    })).toBe(false);

    expect(mod.queueFr37AuditReminder({
      label: 'sevo:review foo',
      status: 'succeeded',
      sessionId: 'review-prefix-1',
    })).toBe(false);

    expect(mod.consumeFr37AuditRemindersForTests()).toHaveLength(0);
  });

  it('injects a sevo:fix completion through the real hook into the next main prompt', async () => {
    const handlers = new Map<string, Function>();
    mod.default.register({
      config: {},
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      on: (name: string, handler: Function) => {
        if (!handlers.has(name)) handlers.set(name, handler);
      },
    });

    await handlers.get('subagent_ended')?.({
      label: 'sevo:fix kivo 修复问题',
      status: 'succeeded',
      sessionId: 'hook-fix-1',
    });

    const promptResult = await handlers.get('before_prompt_build')?.({}, { sessionKey: 'agent:main:test' });
    expect(promptResult?.prependContext).toContain('[SEVO-FR37] 开发任务完成，请立即派发审计：');
    expect(promptResult?.prependContext).toContain('- 被审计任务：sevo:fix kivo 修复问题');
  });
});
