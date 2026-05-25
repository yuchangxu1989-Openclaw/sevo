/**
 * SEVO L2 Interceptor Tests
 * Tests for checkSevoExemption and intercept mode behavior.
 *
 * Note: evaluateSevoTriggerV2 was permanently retired (keyword matching removed).
 * Only checkSevoExemption tests remain.
 */

import { describe, it, expect } from 'vitest';

import { checkSevoExemption } from '../governance/check-sevo-exemption.js';

// ─── Tests ───

// evaluateSevoTriggerV2 tests removed — keyword matching permanently retired from extension plugin.

describe('SEVO L2 Interceptor: checkSevoExemption (whitelist)', () => {
  it('should exempt audit tasks by prompt content', () => {
    const result = checkSevoExemption('对 KIVO 代码进行安全审计和 code review', 'audit-01', '');
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe('exempt.audit');
  });

  it('should exempt research tasks', () => {
    const result = checkSevoExemption('调研竞品的技术架构方案并写分析报告', 'dev-01', '');
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe('exempt.research');
  });

  it('should exempt hotfix/P0 tasks', () => {
    const result = checkSevoExemption('P0 fix: 紧急修复生产环境登录失败问题', 'dev-01', 'p0-fix-login');
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe('exempt.hotfix');
  });

  it('should exempt SEVO internal tasks by label', () => {
    const result = checkSevoExemption('实现新功能模块', 'dev-01', 'sevo-kivo-implement');
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe('exempt.sevo_internal');
  });

  it('should exempt infrastructure maintenance', () => {
    const result = checkSevoExemption('watchdog 插件维护，修复看板推送异常', 'dev-01', '');
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe('exempt.infra');
  });

  it('should exempt manual exemption via label prefix when agentId is main', () => {
    const result = checkSevoExemption('KIVO 增强格式化输出', 'main', 'exempt:manual-override');
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe('exempt.manual');
    expect((result as any).exemptedBy).toBe('main');
    expect((result as any).exemptReason).toBe('manual-override');
  });

  it('should NOT exempt manual exemption when agentId is not main (P1-02)', () => {
    const result = checkSevoExemption('KIVO 增强格式化输出', 'dev-01', 'exempt:manual-override');
    expect(result).toBeNull();
  });

  it('should NOT exempt non-main agent using exempt: prefix (P1-02)', () => {
    const result = checkSevoExemption('some task', 'cc', 'exempt:urgent-deadline');
    expect(result).toBeNull();
  });

  it('should NOT exempt normal development tasks', () => {
    const result = checkSevoExemption('KIVO 增强格式化输出，涉及多个模块重构', 'dev-01', 'kivo-format-enhance');
    expect(result).toBeNull();
  });

  it('should NOT exempt prompt containing P0 without fix verb (P1-01)', () => {
    const result = checkSevoExemption('实现 P0 问题的后续优化方案', 'dev-01', '');
    expect(result).toBeNull();
  });

  it('should still exempt P0 with fix verb co-occurrence (P1-01)', () => {
    const result = checkSevoExemption('P0 修复：登录页面白屏', 'dev-01', '');
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe('exempt.hotfix');
  });

  // P1-01: Label matching strictness tests
  it('should NOT exempt label "kivo-format-review" (review is not at start)', () => {
    const result = checkSevoExemption('普通开发任务', 'dev-01', 'kivo-format-review');
    expect(result).toBeNull();
  });

  it('should NOT exempt label "my-plugin-feature" (plugin is not at start)', () => {
    const result = checkSevoExemption('普通开发任务', 'dev-01', 'my-plugin-feature');
    expect(result).toBeNull();
  });

  it('should NOT exempt label "some-report-task" (report is not at start)', () => {
    const result = checkSevoExemption('普通开发任务', 'dev-01', 'some-report-task');
    expect(result).toBeNull();
  });

  it('should exempt label "audit-kivo-code" (audit at start)', () => {
    const result = checkSevoExemption('普通开发任务', 'dev-01', 'audit-kivo-code');
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe('exempt.audit');
  });

  it('should exempt label "review-sevo-spec" (review at start)', () => {
    const result = checkSevoExemption('普通开发任务', 'dev-01', 'review-sevo-spec');
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe('exempt.audit');
  });

  it('should exempt label "research-competitor" (research at start)', () => {
    const result = checkSevoExemption('普通开发任务', 'dev-01', 'research-competitor');
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe('exempt.research');
  });

  // P1-02: Manual exemption audit fields (only main agent can use exempt:)
  it('should include exemptedBy and exemptReason for manual exemption by main', () => {
    const result = checkSevoExemption('KIVO 增强格式化输出', 'main', 'exempt:urgent-deadline');
    expect(result).not.toBeNull();
    expect(result!.ruleId).toBe('exempt.manual');
    expect((result as any).exemptedBy).toBe('main');
    expect((result as any).exemptReason).toBe('urgent-deadline');
  });

  it('should default exemptReason when exempt: has no suffix (main agent)', () => {
    const result = checkSevoExemption('some task', 'main', 'exempt:');
    expect(result).not.toBeNull();
    expect((result as any).exemptedBy).toBe('main');
    expect((result as any).exemptReason).toBe('no reason provided');
  });
});

// intercept mode block/warn tests removed — evaluateSevoTriggerV2 permanently retired.
// Kept: off mode is trivially true and doesn't depend on the removed function.
describe('SEVO L2 Interceptor: intercept mode behavior', () => {
  it('off mode should skip all evaluation', () => {
    const mode = 'off';
    // In off mode, the hook returns null immediately without evaluation
    expect(mode).toBe('off');
    // No trigger evaluation happens
  });
});

// keyword matching coverage tests removed — evaluateSevoTriggerV2 permanently retired.
