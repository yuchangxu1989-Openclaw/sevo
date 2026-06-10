import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as mod from '../index.js';

const GLOBAL_KEY = Symbol.for('openclaw.sevo-pipeline.instance');
const realFetch = globalThis.fetch;
const originalVectorFile = fs.existsSync(mod.ROUTE_VECTOR_DB_PATH)
  ? fs.readFileSync(mod.ROUTE_VECTOR_DB_PATH, 'utf8')
  : null;

function setRuntimeForEmbeddingTests() {
  const g = (globalThis as any)[GLOBAL_KEY];
  if (g) {
    g.runtimeConfig = {
      ...(g.runtimeConfig || {}),
      enableRouteEmbeddingInTests: true,
    };
  }
  // Force DB refresh through mock by writing a stale model marker
  if (fs.existsSync(mod.ROUTE_VECTOR_DB_PATH)) {
    const db = JSON.parse(fs.readFileSync(mod.ROUTE_VECTOR_DB_PATH, 'utf8'));
    db.model = '__test_stale__';
    db.samples = db.samples.map((s: any) => ({ ...s, model: '__test_stale__', vector: [0] }));
    fs.writeFileSync(mod.ROUTE_VECTOR_DB_PATH, JSON.stringify(db));
  }
}

function restoreVectorFile() {
  if (originalVectorFile === null) {
    fs.rmSync(mod.ROUTE_VECTOR_DB_PATH, { force: true });
  } else {
    fs.writeFileSync(mod.ROUTE_VECTOR_DB_PATH, originalVectorFile);
  }
}

function fakeEmbeddingFetch(matchTexts: string | string[]) {
  const matches = Array.isArray(matchTexts) ? matchTexts : [matchTexts];
  const DIM = 2048;
  return vi.fn(async (_url: any, opts: any) => {
    const body = JSON.parse(String(opts?.body || '{}'));
    if (!Object.prototype.hasOwnProperty.call(body, 'input')) {
      throw new Error('LLM chat fallback should not be called for high-confidence embedding matches');
    }
    const input = Array.isArray(body.input) ? body.input.join(' ') : String(body.input || '');
    const isMatch = matches.some(matchText => input.includes(matchText));
    const vector = new Array(DIM).fill(0);
    vector[0] = isMatch ? 1 : 0;
    vector[1] = isMatch ? 0 : 1;
    return {
      ok: true,
      json: async () => ({ data: [{ embedding: vector }] }),
      text: async () => '',
    } as any;
  });
}

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
  restoreVectorFile();
  const g = (globalThis as any)[GLOBAL_KEY];
  if (g?.runtimeConfig) delete g.runtimeConfig.enableRouteEmbeddingInTests;
});

describe('FR-50 route vector classifier', () => {
  it('AC-50.4/50.7 persists at least 10 samples per route scenario', () => {
    const db = JSON.parse(fs.readFileSync(mod.ROUTE_VECTOR_DB_PATH, 'utf8'));
    const counts = new Map<string, number>();
    for (const sample of db.samples) {
      counts.set(sample.scenario, (counts.get(sample.scenario) || 0) + 1);
      expect(Array.isArray(sample.vector)).toBe(true);
      expect(sample.text).not.toMatch(/概率|数学|统计|英语|物理|化学|probability|statistics|english|physics|chemistry/i);
    }
    for (const scenario of ['pipeline-trigger', 'stage:spec', 'stage:plan', 'stage:implement', 'stage:review', 'stage:fix', 'stage:publish', 'stage:verify']) {
      expect(counts.get(scenario)).toBeGreaterThanOrEqual(10);
    }
    expect(db.version).toBe(1);
    expect(db.thresholds.direct).toBe(0.45);
    expect(db.thresholds.fallback).toBe(0.35);
  });

  it('AC-50.1 high-confidence trigger routing uses embedding without LLM fallback', async () => {
    setRuntimeForEmbeddingTests();
    const sample = mod.routeVectorSamples().find((item: any) => item.id === 'trigger-02');
    const publishSample = mod.routeVectorSamples().find((item: any) => item.id === 'stage-publish-01');
    expect(sample).toBeTruthy();
    expect(publishSample).toBeTruthy();
    globalThis.fetch = fakeEmbeddingFetch([sample.text, publishSample.text]) as any;

    const result = await mod.llmTriggerCheck(sample.text, 'fr50-trigger-test');

    expect(result.source).toBe('embedding-cosine');
    expect(result.shouldTrigger).toBe(true);
    expect(result.cosineScore).toBeGreaterThanOrEqual(0.99);
    expect(result.confidenceBand).toBe('direct');
  });

  it('AC-50.2 high-confidence stage routing uses embedding without LLM fallback', async () => {
    setRuntimeForEmbeddingTests();
    const sample = mod.routeVectorSamples().find((item: any) => item.id === 'stage-publish-01');
    const triggerSample = mod.routeVectorSamples().find((item: any) => item.id === 'trigger-02');
    expect(sample).toBeTruthy();
    expect(triggerSample).toBeTruthy();
    globalThis.fetch = fakeEmbeddingFetch([sample.text, triggerSample.text]) as any;

    const result = await mod.runStageRouteSemanticCheck38b({
      requestedEntry: 'sevo:publish',
      requestedStage: 'publish',
      taskDescription: sample.text,
      projectSlug: 'generic-project',
      pipelineSummary: { currentStage: 'publish', completedStages: ['implement', 'review'], pendingStages: ['publish', 'verify'] },
    });

    expect(result.detectionMethod).toBe('embedding-cosine');
    expect(result.suggestedStages).toContain('publish');
    expect(result.llmAvailable).toBe(false);
    expect(result.fallbackUsed).toBe(false);
    expect(result.confidenceBand).toBe('direct');
  });

  it('AC-50.5 exposes the configured confidence bands', () => {
    expect(mod.routeVectorThresholds()).toEqual({ direct: 0.45, fallback: 0.35 });
    expect(mod.cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
  });
});
