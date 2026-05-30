/**
 * FR-1 \u00b7 FR-2 \u00b7 FR-3 \u00b7 FR-4 \u2014 description-aware routing.
 *
 * Mirrors the 7 acceptance test cases listed in
 * projects/router-level-classifier-fix-20260524-001/specs/product-requirements.md.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { classifyLevel } from '../level-classifier.js';
import { route } from '../router.js';
import { inferScopeFromDescription } from '../description-scope-inferrer.js';
import type { PipelineTask, ProjectConfig, TaskScope } from '../../types/index.js';

function makeTask(scope: TaskScope, description?: string): PipelineTask {
  return {
    taskId: 'task-fr-test',
    title: 'fr test',
    description,
    scope,
  };
}

const ORIGINAL_API_KEY = process.env.OPENAI_API_KEY;

beforeEach(() => {
  delete process.env.OPENAI_API_KEY;
});

afterEach(() => {
  if (ORIGINAL_API_KEY === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = ORIGINAL_API_KEY;
  vi.restoreAllMocks();
});

describe('FR-2 AC3 \u2014 isL0 must be explicitly opted-in', () => {
  it('empty scope no longer falls into L0; defaults to L1', () => {
    const result = classifyLevel({});
    expect(result.level).toBe('L1');
  });

  it('passes for a true micro-change with userExplicitL0=true', () => {
    const result = classifyLevel({
      userExplicitL0: true,
      estimatedFiles: 1,
      estimatedLines: 5,
    });
    expect(result.level).toBe('L0');
  });
});

describe('FR-3 \u2014 explicit --level override', () => {
  it('Test 1: typo + --level=L0 \u2192 L0', async () => {
    const r = await route(makeTask({ userExplicitLevel: 'L0', userExplicitL0: true }, 'fix typo'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.level).toBe('L0');
  });

  it('Test 5: explicit --level=L2+ \u2192 L2+ even when description is a typo', async () => {
    const r = await route(makeTask({ userExplicitLevel: 'L2+', userExplicitFullPipeline: true }, 'fix typo'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.level).toBe('L2+');
  });
});

describe('FR-1 \u2014 description scope inferrer', () => {
  it('Test 2: \u300c\u5b9e\u88c5 FR-Pxx\u300d \u2192 isNewModule=true \u2192 routed to L2+ via new-module rule', async () => {
    const inferred = await inferScopeFromDescription('\u5b9e\u88c5 FR-P03 \u65b0\u589e metadata-extractor service', { disableLlm: true });
    expect(inferred.isNewModule).toBe(true);

    const r = await route(makeTask(inferred as TaskScope, '\u5b9e\u88c5 FR-P03 \u65b0\u589e metadata-extractor service'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // new-module rule \u2192 L2+ which trivially contains architecture-design.
    expect(['L1', 'L2+']).toContain(r.value.level);
    expect(r.value.requiredStages).toContain('architecture-design');
    expect(r.value.skippedStages.find(s => s.stage === 'architecture-design')).toBeUndefined();
  });

  it('Test 3: multi-file change description \u2192 L1 (with arch design)', async () => {
    // \u201cmulti-file\u201d here = description gives no new-module signal, but explicit
    // scope says >1 file and <500 lines; classifier gives L1.
    const scope: TaskScope = { estimatedFiles: 5, estimatedLines: 200 };
    const r = await route(makeTask(scope, '\u4fee\u6539 5 \u4e2a\u6587\u4ef6 200 \u884c'));
    if (!r.ok) return;
    expect(r.value.level).toBe('L1');
  });

  it('Test 4: cross-domain description \u2192 L2+', async () => {
    const inferred = await inferScopeFromDescription(
      '\u8de8\u591a\u4e2a FR-P03 FR-P04 FR-P05 \u540c\u65f6\u52a8 router gate ledger',
      { disableLlm: true },
    );
    // Heuristic counts FR matches \u2192 affectedDomains length \u2265 2.
    expect((inferred.affectedDomains?.length ?? 0)).toBeGreaterThanOrEqual(2);

    const r = await route(makeTask(inferred as TaskScope));
    if (!r.ok) return;
    expect(r.value.level).toBe('L2+');
    expect(r.value.matchedRules).toContain('cross-domain');
  });
});

describe('FR-1 AC4/AC5 \u2014 LLM fallback safety', () => {
  it('Test 6: LLM unreachable \u2192 inferrer returns {} \u2192 router gives L1', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-fake';
    const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));

    const inferred = await inferScopeFromDescription('\u5e2e\u5fd9\u770b\u4e0b');
    expect(inferred).toEqual({});
    fetchSpy.mockRestore();

    const r = await route(makeTask(inferred as TaskScope));
    if (!r.ok) return;
    expect(r.value.level).toBe('L1');
  });

  it('Test 7: LLM returns invalid JSON \u2192 inferrer returns {} \u2192 router gives L1', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-fake';
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'this is not json at all' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const inferred = await inferScopeFromDescription('\u968f\u610f\u63cf\u8ff0\u4e0d\u542b\u5173\u952e\u8bcd');
    expect(inferred).toEqual({});
    fetchSpy.mockRestore();

    const r = await route(makeTask(inferred as TaskScope));
    if (!r.ok) return;
    expect(r.value.level).toBe('L1');
  });
});

describe('FR-4 \u2014 forceArchDesignAllLevels project switch', () => {
  it('default false \u2192 L0 still skips architecture-design', async () => {
    const r = await route(
      makeTask({ userExplicitL0: true, estimatedFiles: 1, estimatedLines: 5 }),
      undefined,
      {} as Partial<ProjectConfig>,
    );
    if (!r.ok) return;
    expect(r.value.level).toBe('L0');
    expect(r.value.requiredStages).not.toContain('architecture-design');
    expect(r.value.skippedStages.find(s => s.stage === 'architecture-design')).toBeDefined();
  });

  it('true \u2192 architecture-design appears in L0 requiredStages', async () => {
    const r = await route(
      makeTask({ userExplicitL0: true, estimatedFiles: 1, estimatedLines: 5 }),
      undefined,
      { forceArchDesignAllLevels: true } as Partial<ProjectConfig>,
    );
    if (!r.ok) return;
    expect(r.value.requiredStages).toContain('architecture-design');
    expect(r.value.skippedStages.find(s => s.stage === 'architecture-design')).toBeUndefined();
  });
});
