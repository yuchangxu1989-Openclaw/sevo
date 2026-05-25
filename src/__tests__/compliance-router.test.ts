/**
 * Tests for ComplianceRouter (arc42 §5.5).
 *
 * Uses a mock LLM provider to test semantic scope inference
 * without making real API calls.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComplianceRouter } from '../compliance/compliance-router.js';
import type { ComplianceTaskContext } from '../compliance/compliance-router.js';
import { LLMProvider } from '../llm/index.js';

// Mock the LLM provider to return deterministic responses
vi.mock('../llm/index.js', () => {
  return {
    LLMProvider: vi.fn().mockImplementation(() => ({
      chat: vi.fn(),
    })),
  };
});

/**
 * Helper: configure the mock LLM to return a specific scope JSON.
 */
function mockLLMResponse(router: ComplianceRouter, scope: Record<string, unknown>): void {
  const llm = (router as unknown as { llm: { chat: ReturnType<typeof vi.fn> } }).llm;
  llm.chat.mockResolvedValue(JSON.stringify(scope));
}

/** Default micro-change LLM response. */
const MICRO_SCOPE = {
  isNewModule: false,
  hasDataModelChange: false,
  hasGovernanceChange: false,
  hasReleaseTargetChange: false,
  isCrossDomain: false,
  affectedDomains: [],
  estimatedFiles: 1,
  estimatedLines: 10,
};

/** New module LLM response. */
const NEW_MODULE_SCOPE = {
  isNewModule: true,
  hasDataModelChange: false,
  hasGovernanceChange: false,
  hasReleaseTargetChange: false,
  isCrossDomain: false,
  affectedDomains: [],
  estimatedFiles: 15,
  estimatedLines: 800,
};

/** Large refactor LLM response. */
const LARGE_REFACTOR_SCOPE = {
  isNewModule: false,
  hasDataModelChange: false,
  hasGovernanceChange: false,
  hasReleaseTargetChange: false,
  isCrossDomain: true,
  affectedDomains: ['auth', 'user'],
  estimatedFiles: 20,
  estimatedLines: 1500,
};

/** Data model change LLM response. */
const DATA_MODEL_SCOPE = {
  isNewModule: false,
  hasDataModelChange: true,
  hasGovernanceChange: false,
  hasReleaseTargetChange: false,
  isCrossDomain: false,
  affectedDomains: [],
  estimatedFiles: 5,
  estimatedLines: 200,
};

/** Cross-domain LLM response. */
const CROSS_DOMAIN_SCOPE = {
  isNewModule: false,
  hasDataModelChange: false,
  hasGovernanceChange: false,
  hasReleaseTargetChange: false,
  isCrossDomain: true,
  affectedDomains: ['auth', 'payment'],
  estimatedFiles: 8,
  estimatedLines: 400,
};

/** Medium task (L1) LLM response. */
const MEDIUM_SCOPE = {
  isNewModule: false,
  hasDataModelChange: false,
  hasGovernanceChange: false,
  hasReleaseTargetChange: false,
  isCrossDomain: false,
  affectedDomains: [],
  estimatedFiles: 3,
  estimatedLines: 100,
};

describe('ComplianceRouter', () => {
  describe('off mode', () => {
    let router: ComplianceRouter;

    beforeEach(() => {
      router = new ComplianceRouter({ mode: 'off' });
    });

    it('always returns pass regardless of task', async () => {
      const result = await router.evaluate({
        description: 'Build entire new system from scratch',
      });
      expect(result.action).toBe('pass');
      expect(result.reason).toContain('off');
    });

    it('does not classify level in off mode', async () => {
      const result = await router.evaluate({ description: 'anything' });
      expect(result.level).toBeUndefined();
    });
  });

  describe('guide mode (default)', () => {
    let router: ComplianceRouter;

    beforeEach(() => {
      router = new ComplianceRouter(); // default is guide
    });

    it('defaults to guide mode', () => {
      expect(router.getMode()).toBe('guide');
    });

    it('passes tasks that already have SEVO tag', async () => {
      const result = await router.evaluate({
        description: 'Implement feature X',
        hasSevoTag: true,
      });
      expect(result.action).toBe('pass');
      expect(result.reason).toContain('SEVO tag');
    });

    it('passes L0 micro-changes without guidance', async () => {
      mockLLMResponse(router, MICRO_SCOPE);
      const result = await router.evaluate({
        description: 'Fix typo in README',
      });
      expect(result.action).toBe('pass');
      expect(result.level).toBe('L0');
    });

    it('returns guide for L1 tasks', async () => {
      mockLLMResponse(router, MEDIUM_SCOPE);
      const result = await router.evaluate({
        description: 'Add pagination to the users API endpoint',
      });
      expect(result.action).toBe('guide');
      expect(result.level).toBe('L1');
      expect(result.reason).toContain('L1');
    });

    it('returns guide for L2+ tasks', async () => {
      mockLLMResponse(router, NEW_MODULE_SCOPE);
      const result = await router.evaluate({
        description: '新建用户管理模块 from scratch',
      });
      expect(result.action).toBe('guide');
      expect(result.level).toBe('L2+');
    });
  });

  describe('auto-route mode', () => {
    let router: ComplianceRouter;

    beforeEach(() => {
      router = new ComplianceRouter({ mode: 'auto-route' });
    });

    it('passes tasks with SEVO tag', async () => {
      const result = await router.evaluate({
        description: 'Implement feature',
        hasSevoTag: true,
      });
      expect(result.action).toBe('pass');
    });

    it('returns create for L0 tasks', async () => {
      mockLLMResponse(router, MICRO_SCOPE);
      const result = await router.evaluate({
        description: 'Fix typo',
      });
      // auto-route creates pipeline even for L0
      expect(result.action).toBe('create');
      expect(result.level).toBe('L0');
    });

    it('returns create for L1 tasks', async () => {
      mockLLMResponse(router, MEDIUM_SCOPE);
      const result = await router.evaluate({
        description: 'Add new API endpoint for user profiles',
      });
      expect(result.action).toBe('create');
      expect(result.level).toBe('L1');
    });

    it('returns create for L2+ tasks with reason', async () => {
      const result = await router.evaluate({
        description: '重构整个认证系统 refactor',
        codeStats: {
          estimatedFiles: 20,
          estimatedLines: 1500,
          affectedDomains: ['auth', 'user', 'session'],
          isNewModule: false,
        },
      });
      expect(result.action).toBe('create');
      expect(result.level).toBe('L2+');
      expect(result.reason).toContain('Auto-routing');
    });
  });

  describe('classifyLevel', () => {
    let router: ComplianceRouter;

    beforeEach(() => {
      router = new ComplianceRouter();
    });

    it('classifies micro-changes as L0', async () => {
      mockLLMResponse(router, MICRO_SCOPE);
      expect(await router.classifyLevel('Fix typo in docs')).toBe('L0');

      mockLLMResponse(router, MICRO_SCOPE);
      expect(await router.classifyLevel('minor fix for button color')).toBe('L0');
    });

    it('classifies new modules as L2+', async () => {
      mockLLMResponse(router, NEW_MODULE_SCOPE);
      expect(await router.classifyLevel('新建支付模块')).toBe('L2+');

      mockLLMResponse(router, NEW_MODULE_SCOPE);
      expect(await router.classifyLevel('Create new module for analytics')).toBe('L2+');
    });

    it('classifies large refactors as L2+', async () => {
      mockLLMResponse(router, LARGE_REFACTOR_SCOPE);
      expect(await router.classifyLevel('大规模重构用户系统')).toBe('L2+');
    });

    it('classifies data model changes as L2+', async () => {
      mockLLMResponse(router, DATA_MODEL_SCOPE);
      expect(await router.classifyLevel('Add data model migration for orders')).toBe('L2+');
    });

    it('classifies cross-domain changes as L2+', async () => {
      mockLLMResponse(router, CROSS_DOMAIN_SCOPE);
      expect(await router.classifyLevel('跨域改动涉及认证和支付')).toBe('L2+');
    });

    it('uses provided codeStats over LLM inference', async () => {
      // Description says "fix typo" but stats say large change — LLM should NOT be called
      const level = await router.classifyLevel('Fix typo', {
        estimatedFiles: 20,
        estimatedLines: 1000,
      });
      expect(level).toBe('L2+');
    });

    it('classifies medium tasks as L1', async () => {
      mockLLMResponse(router, MEDIUM_SCOPE);
      expect(await router.classifyLevel('Implement user authentication')).toBe('L1');
    });
  });

  describe('mode management', () => {
    it('can change mode at runtime', async () => {
      const router = new ComplianceRouter({ mode: 'off' });
      expect(router.getMode()).toBe('off');

      router.setMode('auto-route');
      expect(router.getMode()).toBe('auto-route');

      // Verify behavior changed
      mockLLMResponse(router, MEDIUM_SCOPE);
      const result = await router.evaluate({ description: 'Add feature' });
      expect(result.action).toBe('create');
    });
  });

  describe('edge cases', () => {
    let router: ComplianceRouter;

    beforeEach(() => {
      router = new ComplianceRouter({ mode: 'auto-route' });
    });

    it('handles empty description', async () => {
      mockLLMResponse(router, MEDIUM_SCOPE);
      const result = await router.evaluate({ description: '' });
      // Empty description → LLM still returns a scope
      expect(result.action).toBe('create');
      expect(result.level).toBeDefined();
    });

    it('handles description with only whitespace', async () => {
      mockLLMResponse(router, MEDIUM_SCOPE);
      const result = await router.evaluate({ description: '   ' });
      expect(result.action).toBe('create');
    });

    it('handles mixed language descriptions', async () => {
      mockLLMResponse(router, {
        ...NEW_MODULE_SCOPE,
        hasDataModelChange: true,
      });
      const result = await router.evaluate({
        description: '新建 authentication module from scratch with 数据模型变更',
      });
      expect(result.action).toBe('create');
      expect(result.level).toBe('L2+');
    });
  });
});
