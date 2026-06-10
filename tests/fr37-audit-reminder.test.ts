import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

  it('does not directly dispatch audit for a sevo:fix completion through the real hook in V2', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-fr37-audit-'));
    fs.mkdirSync(path.join(tempRoot, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, 'logs'), { recursive: true });
    const capturePath = path.join(tempRoot, 'logs', 'enqueue-capture.json');
    fs.writeFileSync(
      path.join(tempRoot, 'scripts', 'local-subagent-board.js'),
      `const fs = require('fs');\nfs.writeFileSync(${JSON.stringify(capturePath)}, process.argv[3]);\n`,
      'utf8',
    );

    const handlers = new Map<string, Function>();
    mod.default.register({
      config: {
        workspaceRoot: tempRoot,
        eventsPath: path.join(tempRoot, 'logs', 'sevo-pipeline-events.jsonl'),
      },
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      on: (name: string, handler: Function) => {
        if (!handlers.has(name)) handlers.set(name, handler);
      },
    });

    await handlers.get('subagent_ended')?.({
      label: 'sevo:fix kivo 修复问题',
      status: 'succeeded',
      sessionId: 'hook-fix-1',
      agentId: 'codex',
      output: 'changed projects/kivo/web/app/wiki/page.tsx; tests passed',
    });

    expect(fs.existsSync(capturePath)).toBe(false);

    const eventsPath = path.join(tempRoot, 'logs', 'sevo-pipeline-events.jsonl');
    const events = fs.existsSync(eventsPath) ? fs.readFileSync(eventsPath, 'utf8') : '';
    expect(events).not.toContain('sevo_fr37_audit_dispatched');
  });
});
