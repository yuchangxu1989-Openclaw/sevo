/**
 * PluginAdapter unit tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PluginAdapter,
  parseSevoTag,
  createSevoTag,
} from '../plugin-adapter.js';
import type { HostBridge, HookHandler, HookName, HookContext } from '../plugin-adapter.js';
import type { StageId, ArtifactRef } from '../../types/index.js';

function createMockBridge(overrides: Partial<HostBridge> = {}): HostBridge {
  const handlers = new Map<HookName, HookHandler[]>();

  return {
    registerHook: vi.fn((hookName: HookName, handler: HookHandler) => {
      if (!handlers.has(hookName)) handlers.set(hookName, []);
      handlers.get(hookName)!.push(handler);
      return () => {
        const arr = handlers.get(hookName);
        if (arr) {
          const idx = arr.indexOf(handler);
          if (idx >= 0) arr.splice(idx, 1);
        }
      };
    }),
    getActivePipelines: vi.fn().mockReturnValue([]),
    handleStageComplete: vi.fn(),
    getCurrentStage: vi.fn().mockReturnValue(null),
    getStageInputArtifacts: vi.fn().mockReturnValue([]),
    ...overrides,
  };
}

describe('SEVO Tag Protocol', () => {
  describe('parseSevoTag()', () => {
    it('parses valid tag', async () => {
      const tag = parseSevoTag('sevo:pipeline-abc:spec:1');
      expect(tag).toEqual({
        pipelineId: 'pipeline-abc',
        stageId: 'spec',
        attempt: 1,
      });
    });

    it('returns null for invalid format', async () => {
      expect(parseSevoTag('not-a-sevo-tag')).toBeNull();
      expect(parseSevoTag('sevo:only-two-parts')).toBeNull();
      expect(parseSevoTag('')).toBeNull();
    });

    it('handles multi-digit attempt', async () => {
      const tag = parseSevoTag('sevo:p1:review:12');
      expect(tag?.attempt).toBe(12);
    });
  });

  describe('createSevoTag()', () => {
    it('creates correctly formatted tag', async () => {
      expect(createSevoTag('p1', 'implement', 3)).toBe('sevo:p1:implement:3');
    });
  });
});

describe('PluginAdapter', () => {
  describe('CLI-only mode', () => {
    it('defaults to CLI-only when no bridge provided', async () => {
      const adapter = new PluginAdapter();
      expect(adapter.isCliOnly()).toBe(true);
      expect(adapter.isRegistered()).toBe(false);
    });

    it('register() is no-op in CLI-only mode', async () => {
      const adapter = new PluginAdapter();
      adapter.register();
      expect(adapter.isRegistered()).toBe(false);
    });

    it('injectPrinciples() works in CLI-only mode', async () => {
      const adapter = new PluginAdapter();
      const principles = adapter.injectPrinciples('spec');
      expect(typeof principles).toBe('string');
    });

    it('createTag() and parseTag() work in CLI-only mode', async () => {
      const adapter = new PluginAdapter();
      const tag = adapter.createTag('p1', 'spec', 2);
      expect(tag).toBe('sevo:p1:spec:2');
      expect(adapter.parseTag(tag)).toEqual({ pipelineId: 'p1', stageId: 'spec', attempt: 2 });
    });
  });

  describe('Hosted mode (with bridge)', () => {
    let bridge: HostBridge;
    let adapter: PluginAdapter;

    beforeEach(() => {
      bridge = createMockBridge();
      adapter = new PluginAdapter({ bridge });
    });

    it('is not CLI-only when bridge is provided', async () => {
      expect(adapter.isCliOnly()).toBe(false);
    });

    it('register() registers four hooks', async () => {
      adapter.register();
      expect(adapter.isRegistered()).toBe(true);
      expect(bridge.registerHook).toHaveBeenCalledTimes(4);
      expect(bridge.registerHook).toHaveBeenCalledWith('before_prompt_build', expect.any(Function));
      expect(bridge.registerHook).toHaveBeenCalledWith('before_tool_call', expect.any(Function));
      expect(bridge.registerHook).toHaveBeenCalledWith('subagent_ended', expect.any(Function));
      expect(bridge.registerHook).toHaveBeenCalledWith('task:spawn', expect.any(Function));
    });

    it('register() is idempotent', async () => {
      adapter.register();
      adapter.register();
      expect(bridge.registerHook).toHaveBeenCalledTimes(4);
    });

    it('dispose() unregisters hooks', async () => {
      adapter.register();
      expect(adapter.isRegistered()).toBe(true);
      adapter.dispose();
      expect(adapter.isRegistered()).toBe(false);
    });
  });

  describe('before_prompt_build hook', () => {
    it('returns no injection when no active pipelines', async () => {
      const bridge = createMockBridge({ getActivePipelines: vi.fn().mockReturnValue([]) });
      const adapter = new PluginAdapter({ bridge });

      const result = adapter.handleBeforePromptBuild({ hookName: 'before_prompt_build' });
      expect(result.proceed).toBe(true);
      expect(result.promptInjection).toBeUndefined();
    });

    it('injects principles and auto-advance for active pipeline', async () => {
      const bridge = createMockBridge({
        getActivePipelines: vi.fn().mockReturnValue(['p1']),
        getCurrentStage: vi.fn().mockReturnValue('spec' as StageId),
      });
      const adapter = new PluginAdapter({ bridge });

      const result = adapter.handleBeforePromptBuild({ hookName: 'before_prompt_build' });
      expect(result.proceed).toBe(true);
      expect(result.promptInjection).toContain('[SEVO Auto-Advance]');
      expect(result.promptInjection).toContain('p1');
      expect(result.promptInjection).toContain('spec');
    });
  });

  describe('before_tool_call hook', () => {
    it('proceeds for non-sessions_spawn tools', async () => {
      const bridge = createMockBridge();
      const adapter = new PluginAdapter({ bridge });

      const result = await adapter.handleBeforeToolCall({
        hookName: 'before_tool_call',
        toolName: 'read',
        toolArgs: { path: '/tmp/file.txt' },
      });
      expect(result.proceed).toBe(true);
    });

    it('proceeds without advisory for already-tagged spawn', async () => {
      const bridge = createMockBridge();
      const adapter = new PluginAdapter({ bridge });

      const result = await adapter.handleBeforeToolCall({
        hookName: 'before_tool_call',
        toolName: 'sessions_spawn',
        toolArgs: { label: 'sevo:p1:spec:1' },
      });
      expect(result.proceed).toBe(true);
      expect(result.advisory).toBeUndefined();
    });
  });

  describe('subagent_ended hook', () => {
    it('ignores non-SEVO labels', async () => {
      const bridge = createMockBridge();
      const adapter = new PluginAdapter({ bridge });

      const result = await adapter.handleSubagentEnded({
        hookName: 'subagent_ended',
        label: 'some-random-task',
      });
      expect(result.proceed).toBe(true);
      expect(bridge.handleStageComplete).not.toHaveBeenCalled();
    });

    it('signals stage completion for SEVO-tagged labels', async () => {
      const bridge = createMockBridge();
      const adapter = new PluginAdapter({ bridge });

      const result = await adapter.handleSubagentEnded({
        hookName: 'subagent_ended',
        label: 'sevo:pipeline-1:review:2',
        output: 'Review completed successfully',
      });

      expect(result.proceed).toBe(true);
      expect(bridge.handleStageComplete).toHaveBeenCalledWith(
        'pipeline-1',
        'review',
        expect.objectContaining({ outcome: 'passed' }),
      );
      expect(result.advisory).toContain('review');
    });

    it('does nothing without bridge', async () => {
      const adapter = new PluginAdapter(); // CLI-only

      const result = await adapter.handleSubagentEnded({
        hookName: 'subagent_ended',
        label: 'sevo:p1:spec:1',
      });
      expect(result.proceed).toBe(true);
    });
  });

  describe('evaluateCompliance()', () => {
    it('returns null when no compliance router configured', async () => {
      const adapter = new PluginAdapter();
      const result = await adapter.evaluateCompliance({ description: 'test' });
      expect(result).toBeNull();
    });
  });
});
