import { describe, it, expect, beforeEach } from 'vitest';
import * as mod from '../index.js';

// P0-3 guard：completion 早退路径必须对主会话可见。noticeCompletionRecovery 是这些
// 早退分支（decode-failed / pipeline-not-found / engine-unavailable / advance-error）
// 统一调用的恢复入口，它必须把一条 [SEVO 恢复] notice 推入 pendingNotices，而不是只写事件。
const GLOBAL_KEY = Symbol.for('openclaw.sevo-pipeline.instance');
const { noticeCompletionRecovery } = mod as any;

function globalState(): any {
  return (globalThis as any)[GLOBAL_KEY];
}

describe('P0-3: completion early-return recovery is visible to the main session', () => {
  beforeEach(() => {
    const g = globalState();
    if (g?.pendingNotices) g.pendingNotices.length = 0;
  });

  it('pushes a visible recovery notice for the decode-failed branch', () => {
    noticeCompletionRecovery({
      reason: 'decode-failed',
      label: 'sevo:garbled',
      detail: 'no slug',
      action: '人工核对 label',
    });
    const notices = globalState().pendingNotices as string[];
    const notice = notices.find(n => n.includes('[SEVO 恢复]') && n.includes('decode-failed'));
    expect(notice).toBeTruthy();
    expect(notice).toContain('Action:');
  });

  it('pushes a visible recovery notice for the pipeline-not-found branch', () => {
    noticeCompletionRecovery({
      reason: 'pipeline-not-found',
      label: 'sevo:kivo:implement:1',
      detail: 'no active pipeline',
      action: '用 sevo:status 确认',
    });
    const notices = globalState().pendingNotices as string[];
    expect(notices.some(n => n.includes('[SEVO 恢复]') && n.includes('pipeline-not-found'))).toBe(true);
  });

  it('includes the label and action in every recovery notice', () => {
    noticeCompletionRecovery({
      reason: 'engine-unavailable',
      label: 'sevo:sevo:verify:2',
      detail: 'engine null',
      action: 'sevo:doctor',
    });
    const notices = globalState().pendingNotices as string[];
    const notice = notices.find(n => n.includes('engine-unavailable'));
    expect(notice).toContain('sevo:sevo:verify:2');
    expect(notice).toContain('sevo:doctor');
  });
});
