/**
 * Pipeline Interceptor Tests — FR-35 AC-35.1, AC-35.2, AC-35.3, AC-35.7.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deterministicCheck } from '../gates/llm-intercept/decision-engine.js';
import {
  PipelineInterceptor,
  type RegisteredProject,
  type SpawnInterceptContext,
  type PipelineInstanceStore,
  type PipelineInterceptorConfig,
} from '../governance/pipeline-interceptor.js';
import type { PipelineInstance } from '../types/index.js';

const WORKSPACE_SPEC_PATH = ['/', 'root', '.openclaw', 'workspace', 'projects', 'sevo', 'docs', 'product-requirements.md'].join('/');

// ── Mock LLM Provider ───────────────────────────────────────────

vi.mock('../llm/llm-provider.js', () => {
  return {
    LLMProvider: vi.fn().mockImplementation(() => ({
      chat: vi.fn(),
    })),
  };
});

// ── Test Fixtures ───────────────────────────────────────────────

const TEST_PROJECTS: RegisteredProject[] = [
  {
    slug: 'sevo',
    pathPrefixes: ['projects/sevo/src/', 'projects/sevo/docs/'],
    specPaths: ['projects/sevo/docs/product-requirements.md', 'projects/sevo/docs/architecture/arc42-architecture.md'],
  },
  {
    slug: 'kivo',
    pathPrefixes: ['projects/kivo/src/', 'projects/kivo/web/'],
    specPaths: ['projects/kivo/docs/product-requirements.md'],
  },
];

function createMockStore(instances: PipelineInstance[] = []): PipelineInstanceStore {
  return {
    listByProject: (slug: string) => instances.filter((i) => i.projectSlug === slug),
  };
}

function createActiveInstance(slug: string): PipelineInstance {
  return {
    instanceId: `fr-${slug}-20260516-001`,
    projectSlug: slug,
    status: 'active',
    statusHistory: [],
    routingResult: {
      taskId: 'test-task',
      level: 'L2+',
      requiredStages: ['spec', 'implement', 'review'],
      matchedRules: ['user-explicit'],
      needsUxDesign: false, uxDesignReason: '', needsArchDesign: false, archDesignReason: '',
    },
    directoryStructure: {
      projectRoot: `/workspace/projects/${slug}`,
      createdDirs: [],
      existingDirs: [],
      createdFiles: [],
      existingFiles: [],
      complete: true,
    },
    createdAt: '2026-05-16T00:00:00Z',
    updatedAt: '2026-05-16T00:00:00Z',
  };
}

function createInterceptor(
  overrides?: Partial<PipelineInterceptorConfig>,
  mockLlmResponse?: string,
): PipelineInterceptor {
  const config: PipelineInterceptorConfig = {
    projects: TEST_PROJECTS,
    store: createMockStore(),
    confidenceThreshold: 0.7,
    ...overrides,
  };

  const interceptor = new PipelineInterceptor(config);

  // Inject mock LLM response
  if (mockLlmResponse) {
    const llm = (interceptor as any).llm;
    llm.chat = vi.fn().mockResolvedValue(mockLlmResponse);
  }

  return interceptor;
}

// ── Tests ───────────────────────────────────────────────────────

describe('LLM Intercept Decision Engine: deterministic project path coverage', () => {
  it('should intercept registered project docs paths', () => {
    const result = deterministicCheck(
      `修复 ${WORKSPACE_SPEC_PATH} 的说明`,
      ['sevo'],
    );

    expect(result).toBe(true);
  });
});

describe('PipelineInterceptor: Fast-path exemptions', () => {
  it('should pass tasks with sevo: label prefix', async () => {
    const interceptor = createInterceptor();
    const context: SpawnInterceptContext = {
      label: 'sevo:sevo:implement:1',
      taskPrompt: 'Implement feature X for SEVO',
      agentId: 'dev-01',
    };

    const result = await interceptor.evaluate(context);
    expect(result.action).toBe('pass');
    expect(result.ruleId).toBe('exempt.sevo_label');
  });

  it('should pass tasks with sevo- label prefix', async () => {
    const interceptor = createInterceptor();
    const context: SpawnInterceptContext = {
      label: 'sevo-kivo-implement',
      taskPrompt: 'Implement feature X for KIVO',
      agentId: 'dev-01',
    };

    const result = await interceptor.evaluate(context);
    expect(result.action).toBe('pass');
    expect(result.ruleId).toBe('exempt.sevo_label');
  });

  it('should pass tasks with exempt: label prefix', async () => {
    const interceptor = createInterceptor();
    const context: SpawnInterceptContext = {
      label: 'exempt:urgent-deadline',
      taskPrompt: 'Fix critical bug in KIVO',
      agentId: 'dev-01',
    };

    const result = await interceptor.evaluate(context);
    expect(result.action).toBe('pass');
    expect(result.ruleId).toBe('exempt.manual');
  });
});

describe('PipelineInterceptor: LLM analysis — non-R&D activities', () => {
  it('should pass non-R&D activities', async () => {
    const llmResponse = JSON.stringify({
      isRdActivity: false,
      activityType: 'other',
      matchedProject: null,
      confidence: 0.9,
      reasoning: 'This is a research task, not modifying any project files',
    });

    const interceptor = createInterceptor(undefined, llmResponse);
    const context: SpawnInterceptContext = {
      label: 'research-competitor',
      taskPrompt: '调研竞品的技术架构方案',
      agentId: 'dev-01',
    };

    const result = await interceptor.evaluate(context);
    expect(result.action).toBe('pass');
    expect(result.ruleId).toBe('analysis.not_rd_activity');
  });

  it('should pass when confidence is below threshold', async () => {
    const llmResponse = JSON.stringify({
      isRdActivity: true,
      activityType: 'implementation',
      matchedProject: 'sevo',
      confidence: 0.5,
      reasoning: 'Might be related to SEVO but unclear',
    });

    const interceptor = createInterceptor(undefined, llmResponse);
    const context: SpawnInterceptContext = {
      label: 'some-task',
      taskPrompt: 'Do something vaguely related',
      agentId: 'dev-01',
    };

    const result = await interceptor.evaluate(context);
    expect(result.action).toBe('pass');
    expect(result.ruleId).toBe('analysis.not_rd_activity');
  });

  it('should pass when no project is matched', async () => {
    const llmResponse = JSON.stringify({
      isRdActivity: true,
      activityType: 'implementation',
      matchedProject: null,
      confidence: 0.9,
      reasoning: 'R&D activity but not for any registered project',
    });

    const interceptor = createInterceptor(undefined, llmResponse);
    const context: SpawnInterceptContext = {
      label: 'unrelated-dev',
      taskPrompt: 'Build a new standalone tool',
      agentId: 'dev-01',
    };

    const result = await interceptor.evaluate(context);
    expect(result.action).toBe('pass');
    expect(result.ruleId).toBe('analysis.no_project_match');
  });
});

describe('PipelineInterceptor: AC-35.1 — Spec modification detection', () => {
  it('should block spec modification for registered project', async () => {
    const llmResponse = JSON.stringify({
      isRdActivity: true,
      activityType: 'spec-modification',
      matchedProject: 'sevo',
      confidence: 0.95,
      reasoning: 'Task explicitly modifies product-requirements.md for SEVO project',
    });

    const interceptor = createInterceptor(undefined, llmResponse);
    const context: SpawnInterceptContext = {
      label: 'pm-update-spec',
      taskPrompt: '修改 SEVO 的 product-requirements.md，新增 FR-36',
      agentId: 'pm-01',
    };

    const result = await interceptor.evaluate(context);
    expect(result.action).toBe('block');
    expect(result.ruleId).toBe('fr35.spec_modification');
    expect(result.matchedProject).toBe('sevo');
    expect(result.suggestion).toBe('sevo:create sevo');
    expect(result.message).toContain('spec 文件修改');
  });
});

describe('PipelineInterceptor: AC-35.2 — Active pipeline validation', () => {
  it('should block implement task when no active pipeline exists', async () => {
    const llmResponse = JSON.stringify({
      isRdActivity: true,
      activityType: 'implementation',
      matchedProject: 'kivo',
      confidence: 0.92,
      reasoning: 'Task implements a new feature in KIVO source code',
    });

    // Store with no active instances for kivo
    const store = createMockStore([]);
    const interceptor = createInterceptor({ store }, llmResponse);

    const context: SpawnInterceptContext = {
      label: 'kivo-new-feature',
      taskPrompt: '实现 KIVO 的新功能模块',
      agentId: 'dev-01',
    };

    const result = await interceptor.evaluate(context);
    expect(result.action).toBe('block');
    expect(result.ruleId).toBe('fr35.no_active_pipeline');
    expect(result.matchedProject).toBe('kivo');
    expect(result.suggestion).toBe('sevo:create kivo');
  });

  it('should pass implement task when active pipeline exists', async () => {
    const llmResponse = JSON.stringify({
      isRdActivity: true,
      activityType: 'implementation',
      matchedProject: 'kivo',
      confidence: 0.92,
      reasoning: 'Task implements a new feature in KIVO source code',
    });

    // Store with an active instance for kivo
    const store = createMockStore([createActiveInstance('kivo')]);
    const interceptor = createInterceptor({ store }, llmResponse);

    const context: SpawnInterceptContext = {
      label: 'kivo-new-feature',
      taskPrompt: '实现 KIVO 的新功能模块',
      agentId: 'dev-01',
    };

    // Even with active pipeline, it still blocks because label doesn't have sevo: prefix (AC-35.3)
    const result = await interceptor.evaluate(context);
    expect(result.action).toBe('block');
    expect(result.ruleId).toBe('fr35.manual_dispatch_detected');
  });

  it('should block review task when no active pipeline exists', async () => {
    const llmResponse = JSON.stringify({
      isRdActivity: true,
      activityType: 'review',
      matchedProject: 'sevo',
      confidence: 0.88,
      reasoning: 'Task reviews SEVO code changes',
    });

    const store = createMockStore([]);
    const interceptor = createInterceptor({ store }, llmResponse);

    const context: SpawnInterceptContext = {
      label: 'review-sevo-code',
      taskPrompt: 'Review the latest SEVO implementation changes',
      agentId: 'audit-01',
    };

    const result = await interceptor.evaluate(context);
    expect(result.action).toBe('block');
    expect(result.ruleId).toBe('fr35.no_active_pipeline');
  });
});

describe('PipelineInterceptor: AC-35.3 — Manual dispatch detection', () => {
  it('should block manual dispatch for registered project R&D', async () => {
    const llmResponse = JSON.stringify({
      isRdActivity: true,
      activityType: 'refactor',
      matchedProject: 'sevo',
      confidence: 0.85,
      reasoning: 'Task refactors SEVO source code modules',
    });

    const store = createMockStore([createActiveInstance('sevo')]);
    const interceptor = createInterceptor({ store }, llmResponse);

    const context: SpawnInterceptContext = {
      label: 'refactor-sevo-modules',
      taskPrompt: '重构 SEVO 的 governance 模块，提取公共接口',
      agentId: 'dev-01',
    };

    const result = await interceptor.evaluate(context);
    expect(result.action).toBe('block');
    expect(result.ruleId).toBe('fr35.manual_dispatch_detected');
    expect(result.matchedProject).toBe('sevo');
    expect(result.message).toContain('研发活动');
    expect(result.message).toContain('SEVO 流水线');
  });
});

describe('PipelineInterceptor: AC-35.7 — LLM failure handling', () => {
  it('should pass through when LLM fails (fail-open)', async () => {
    const interceptor = createInterceptor();
    // Make LLM throw
    const llm = (interceptor as any).llm;
    llm.chat = vi.fn().mockRejectedValue(new Error('LLM service unavailable'));

    const context: SpawnInterceptContext = {
      label: 'some-task',
      taskPrompt: 'Do something for SEVO',
      agentId: 'dev-01',
    };

    const result = await interceptor.evaluate(context);
    expect(result.action).toBe('pass');
  });

  it('should pass through when LLM returns unparseable response', async () => {
    const interceptor = createInterceptor(undefined, 'this is not json at all');

    const context: SpawnInterceptContext = {
      label: 'some-task',
      taskPrompt: 'Do something for SEVO',
      agentId: 'dev-01',
    };

    const result = await interceptor.evaluate(context);
    expect(result.action).toBe('pass');
  });
});

describe('PipelineInterceptor: Audit event generation', () => {
  it('should build audit event with all fields', async () => {
    const llmResponse = JSON.stringify({
      isRdActivity: true,
      activityType: 'implementation',
      matchedProject: 'sevo',
      confidence: 0.9,
      reasoning: 'Implements SEVO feature',
    });

    const store = createMockStore([]);
    const interceptor = createInterceptor({ store }, llmResponse);

    const context: SpawnInterceptContext = {
      label: 'dev-task',
      taskPrompt: 'Implement FR-36 for SEVO',
      agentId: 'dev-01',
    };

    const result = await interceptor.evaluate(context);
    const event = interceptor.buildAuditEvent(context, result);

    expect(event.timestamp).toBeTruthy();
    expect(event.label).toBe('dev-task');
    expect(event.agentId).toBe('dev-01');
    expect(event.action).toBe('block');
    expect(event.ruleId).toBe('fr35.no_active_pipeline');
    expect(event.confidence).toBe(0.9);
    expect(event.reasoning).toBe('Implements SEVO feature');
    expect(event.matchedProject).toBe('sevo');
  });
});
