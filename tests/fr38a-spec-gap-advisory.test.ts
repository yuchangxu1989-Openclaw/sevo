import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as mod from '../index.js';

const GLOBAL_KEY = Symbol.for('openclaw.sevo-pipeline.instance');

// Read the JSONL audit log and return parsed events of the FR-38a type.
function readSpecGapEvents(eventsPath: string): any[] {
  if (!fs.existsSync(eventsPath)) return [];
  return fs.readFileSync(eventsPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter((e) => e && e.type === 'sevo_spec_gap_advisory_38a');
}

// FR-38a 语义级 Spec-Gap Advisory. At task trigger SEVO runs a SECOND, semantic
// layer (after the FR-coverage check): an LLM compares the task description with
// the spec's FR/AC and flags spec-undefined concepts, producing a NON-blocking
// advisory. These tests pin the deterministic parts: schema normalization, the
// advisory framing, and the sync timeout/skip + async-retry behavior. The model
// call is exercised via a stubbed global fetch so no real provider is needed.

// Build a fake OpenAI-style chat-completion response carrying `content`.
function fakeChatResponse(content: string, { ok = true, status = 200, id = 'chatcmpl-test' } = {}) {
  return {
    ok,
    status,
    json: async () => ({ id, choices: [{ message: { content } }] }),
    text: async () => content,
  };
}

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

// ── normalizeSpecGapAdvisory (schema, AC-38a.5) ──────────────────────────────

describe('FR-38a normalizeSpecGapAdvisory (AC-38a.5 schema)', () => {
  const meta = { projectSlug: 'sevo', taskId: 'task-sevo-1', model: 'gpt-5.5', requestId: 'req-1', inputSummary: 'desc' };

  it('produces every required advisory field', () => {
    const rec = mod.normalizeSpecGapAdvisory(JSON.stringify({
      status: 'advisory',
      introducedConcepts: ['specify prefix', 'design prefix'],
      matchedFrAc: ['FR-39'],
      gapSummary: 'four new prefixes undefined',
      recommendedSpecPatch: 'add FR for the 8-prefix table',
      severity: 'high',
      confidence: 0.9,
      reason: 'spec defines only 4 prefixes',
    }), meta);

    for (const field of ['projectSlug', 'taskId', 'introducedConcepts', 'matchedFrAc', 'gapSummary', 'recommendedSpecPatch', 'severity', 'confidence', 'reason', 'createdAt']) {
      expect(rec).toHaveProperty(field);
    }
    expect(rec.projectSlug).toBe('sevo');
    expect(rec.taskId).toBe('task-sevo-1');
    expect(rec.introducedConcepts).toEqual(['specify prefix', 'design prefix']);
    expect(rec.status).toBe('advisory');
    expect(rec.confidence).toBe(0.9);
    expect(rec.severity).toBe('high');
    expect(typeof rec.createdAt).toBe('string');
  });

  it('clamps confidence into [0,1] and defaults invalid severity', () => {
    const rec = mod.normalizeSpecGapAdvisory(JSON.stringify({
      status: 'advisory', introducedConcepts: ['x'], confidence: 5, severity: 'apocalyptic',
    }), meta);
    expect(rec.confidence).toBeLessThanOrEqual(1);
    expect(rec.confidence).toBeGreaterThanOrEqual(0);
    expect(['low', 'medium', 'high']).toContain(rec.severity);
  });

  it('forces status=advisory whenever the model lists introduced concepts (AC-38a.1)', () => {
    // Even if the model mislabels the status, a non-empty concept list is a gap.
    const rec = mod.normalizeSpecGapAdvisory(JSON.stringify({
      status: 'covered', introducedConcepts: ['ux prefix'],
    }), meta);
    expect(rec.status).toBe('advisory');
  });

  it('parses JSON wrapped in markdown code fences', () => {
    const rec = mod.normalizeSpecGapAdvisory(
      '```json\n{"status":"covered","matchedFrAc":["FR-1"],"reason":"ok"}\n```',
      meta,
    );
    expect(rec.status).toBe('covered');
    expect(rec.matchedFrAc).toEqual(['FR-1']);
  });

  it('keeps introducedConcepts empty for a pure-bug-fix verdict (AC-38a.2)', () => {
    const rec = mod.normalizeSpecGapAdvisory(JSON.stringify({
      status: 'skipped-pure-bugfix', isPureBugFix: true, matchedFrAc: ['FR-7', 'AC-7.1'],
      reason: 'fixes FR-7 display defect',
    }), meta);
    expect(rec.status).toBe('skipped-pure-bugfix');
    expect(rec.isPureBugFix).toBe(true);
    expect(rec.introducedConcepts).toEqual([]);
    expect(rec.matchedFrAc).toEqual(['FR-7', 'AC-7.1']);
  });
});

// ── buildSpecGapAdvisory38aNotice (framing, AC-38a.6) ─────────────────────────

describe('FR-38a buildSpecGapAdvisory38aNotice (AC-38a.6 advisory framing)', () => {
  const record = {
    projectSlug: 'sevo', taskId: 't1', status: 'advisory', isPureBugFix: false,
    introducedConcepts: ['specify prefix', 'review prefix'],
    matchedFrAc: ['FR-39'], gapSummary: 'new prefixes undefined',
    recommendedSpecPatch: 'add the 8-prefix FR', severity: 'high', confidence: 0.9,
    reason: 'only 4 defined', createdAt: new Date().toISOString(),
  };

  it('frames as a suggestion, not a block', () => {
    const text = mod.buildSpecGapAdvisory38aNotice(record);
    expect(text).toContain('建议先补 spec');
    expect(text).not.toContain('已暂停');
    expect(text).toContain('由主 Agent 决定');
  });

  it('lists every introduced concept and the recommended patch', () => {
    const text = mod.buildSpecGapAdvisory38aNotice(record);
    expect(text).toContain('specify prefix');
    expect(text).toContain('review prefix');
    expect(text).toContain('add the 8-prefix FR');
  });

  it('surfaces matched FR/AC as already-covered context for a mixed task (AC-38a.3)', () => {
    const text = mod.buildSpecGapAdvisory38aNotice(record);
    expect(text).toContain('FR-39');
  });
});

// ── runSpecGapAdvisoryCheck via stubbed fetch (AC-38a.1/.2/.3/.4/.7) ──────────

describe('FR-38a runSpecGapAdvisoryCheck (semantic detection)', () => {
  const base = { projectSlug: 'sevo', taskId: 't-1', projectRoot: '.', taskDescription: 'expand prefix table to 8' };

  it('AC-38a.1: returns an advisory when the model reports introduced concepts', async () => {
    globalThis.fetch = vi.fn(async () => fakeChatResponse(JSON.stringify({
      status: 'advisory',
      introducedConcepts: ['specify', 'design', 'review', 'ux'],
      matchedFrAc: ['FR-39'], gapSummary: 'four new prefixes', recommendedSpecPatch: 'add 8-prefix FR',
      severity: 'high', confidence: 0.92, reason: 'spec defines 4 prefixes only',
    })) as any);

    const rec = await mod.runSpecGapAdvisoryCheck(base);
    expect(rec.status).toBe('advisory');
    expect(rec.introducedConcepts).toContain('specify');
    expect(rec.recommendedSpecPatch).not.toBe('');
    // AC-38a.4: the decision came from an LLM call, recorded with detection method.
    expect(rec.detectionMethod).toBe('llm-semantic');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('AC-38a.2: returns skipped-pure-bugfix for a pure bug fix', async () => {
    globalThis.fetch = vi.fn(async () => fakeChatResponse(JSON.stringify({
      status: 'skipped-pure-bugfix', isPureBugFix: true, matchedFrAc: ['FR-7', 'AC-7.1'],
      introducedConcepts: [], reason: 'fixes FR-7 defect', confidence: 0.8,
    })) as any);

    const rec = await mod.runSpecGapAdvisoryCheck(base);
    expect(rec.status).toBe('skipped-pure-bugfix');
    expect(rec.introducedConcepts).toEqual([]);
    expect(rec.matchedFrAc).toEqual(['FR-7', 'AC-7.1']);
  });

  it('AC-38a.3: a mixed task yields advisory with both new concepts and covered FR/AC', async () => {
    globalThis.fetch = vi.fn(async () => fakeChatResponse(JSON.stringify({
      status: 'advisory', introducedConcepts: ['review prefix', 'ux prefix'],
      matchedFrAc: ['FR-39'], gapSummary: 'fix covered, new prefixes not', recommendedSpecPatch: 'add review/ux',
      severity: 'medium', confidence: 0.85, reason: 'mixed',
    })) as any);

    const rec = await mod.runSpecGapAdvisoryCheck(base);
    expect(rec.status).toBe('advisory');
    expect(rec.introducedConcepts.length).toBeGreaterThan(0);
    expect(rec.matchedFrAc).toContain('FR-39');
  });

  it('AC-50.3: records status=degraded reason=llm-unavailable when the model errors', async () => {
    globalThis.fetch = vi.fn(async () => fakeChatResponse('', { ok: false, status: 500 }) as any);
    const rec = await mod.runSpecGapAdvisoryCheck(base);
    expect(rec.status).toBe('degraded');
    expect(rec.reason).toBe('llm-unavailable');
  });

  it('AC-50.3: a slow model is bounded by the sync timeout and recorded as degraded', async () => {
    globalThis.fetch = vi.fn((_url: any, opts: any) => new Promise((resolve, reject) => {
      // Resolve far later than the budget; honor the AbortController so the race
      // resolves to a timeout sentinel quickly.
      const t = setTimeout(() => resolve(fakeChatResponse('{}') as any), 5000);
      opts?.signal?.addEventListener?.('abort', () => {
        clearTimeout(t);
        const e: any = new Error('aborted'); e.name = 'AbortError'; reject(e);
      });
    }) as any);

    const start = Date.now();
    const rec = await mod.runSpecGapAdvisoryCheck({ ...base, timeoutMs: 200 });
    const elapsed = Date.now() - start;
    expect(rec.status).toBe('degraded');
    expect(rec.reason).toBe('llm-timeout');
    expect(elapsed).toBeLessThan(2000);
  });

  it('returns degraded when the spec file is unavailable', async () => {
    globalThis.fetch = vi.fn(async () => fakeChatResponse('{}') as any);
    const rec = await mod.runSpecGapAdvisoryCheck({ ...base, projectSlug: 'no-such-project-xyz', projectRoot: 'projects/no-such-project-xyz' });
    expect(rec.status).toBe('degraded');
    expect(rec.reason).toMatch(/spec-unavailable/);
  });
});

// ── applySpecGapAdvisory38a non-blocking + audit (AC-38a.6/.8) ────────────────

describe('FR-38a applySpecGapAdvisory38a (non-blocking entry hook)', () => {
  const base = { pipelineId: 'pl-fr38a-test', projectSlug: 'sevo', taskId: 't-apply', projectRoot: '.', taskDescription: 'add new ux prefix' };

  it('emits an advisory record on a detected gap and never throws (AC-38a.6)', async () => {
    globalThis.fetch = vi.fn(async () => fakeChatResponse(JSON.stringify({
      status: 'advisory', introducedConcepts: ['ux prefix'], matchedFrAc: [],
      gapSummary: 'ux prefix undefined', recommendedSpecPatch: 'add ux FR',
      severity: 'medium', confidence: 0.9, reason: 'undefined',
    })) as any);

    let rec: any;
    await expect((async () => { rec = await mod.applySpecGapAdvisory38a(base); })()).resolves.not.toThrow();
    expect(rec.status).toBe('advisory');
    expect(rec.introducedConcepts).toContain('ux prefix');
  });

  it('schedules an async retry when the sync check is degraded (AC-50.3)', async () => {
    globalThis.fetch = vi.fn(async () => fakeChatResponse('', { ok: false, status: 503 }) as any);
    const rec = await mod.applySpecGapAdvisory38a(base);
    expect(rec.status).toBe('degraded');
    expect(rec.asyncRetryScheduled).toBe(true);
  });
});

// ── async retry re-emits only high-confidence gaps (AC-38a.8) ─────────────────

describe('FR-38a scheduleSpecGapAdvisoryAsyncRetry (AC-38a.8)', () => {
  const base = { pipelineId: 'pl-fr38a-async', projectSlug: 'sevo', taskId: 't-async', projectRoot: '.', taskDescription: 'add new stage' };

  it('re-runs the check on the async path and writes a record without throwing', async () => {
    globalThis.fetch = vi.fn(async () => fakeChatResponse(JSON.stringify({
      status: 'advisory', introducedConcepts: ['new stage'], matchedFrAc: [],
      gapSummary: 'stage undefined', recommendedSpecPatch: 'add stage FR',
      severity: 'high', confidence: 0.95, reason: 'undefined',
    })) as any);

    // The factory returns the retry thenable so the test can await it directly.
    const retry = mod.scheduleSpecGapAdvisoryAsyncRetry(base);
    await expect(retry()).resolves.not.toThrow();
    expect(typeof retry).toBe('function');
  });

  it('re-emits a pending notice and records the same taskId for a high-confidence async gap', async () => {
    const g = (globalThis as any)[GLOBAL_KEY];
    g.pendingNotices.length = 0;
    const taskId = 't-async-highconf';
    globalThis.fetch = vi.fn(async () => fakeChatResponse(JSON.stringify({
      status: 'advisory', introducedConcepts: ['gateway routing'], matchedFrAc: [],
      gapSummary: 'routing undefined', recommendedSpecPatch: 'add routing FR',
      severity: 'high', confidence: 0.95, reason: 'undefined',
    })) as any);

    const retry = mod.scheduleSpecGapAdvisoryAsyncRetry({ ...base, taskId });
    await retry();

    // Notice re-emitted because confidence >= SPEC_GAP_ADVISORY_HIGH_CONFIDENCE.
    const notice = g.pendingNotices.find((n: string) => n.includes('建议先补 spec'));
    expect(notice).toBeTruthy();
    // The record is written to the spec-integrity ledger under the same taskId.
    const records = g.specGapAdvisory38aRecords as any[];
    expect(records.some((r) => r.taskId === taskId && r.asyncRetry === true)).toBe(true);
  });

  it('does NOT re-emit a notice for a low-confidence async gap', async () => {
    const g = (globalThis as any)[GLOBAL_KEY];
    g.pendingNotices.length = 0;
    globalThis.fetch = vi.fn(async () => fakeChatResponse(JSON.stringify({
      status: 'advisory', introducedConcepts: ['weak signal'], matchedFrAc: [],
      gapSummary: 'maybe undefined', recommendedSpecPatch: 'maybe add FR',
      severity: 'low', confidence: 0.3, reason: 'uncertain',
    })) as any);

    const retry = mod.scheduleSpecGapAdvisoryAsyncRetry({ ...base, taskId: 't-async-lowconf' });
    await retry();

    const notice = g.pendingNotices.find((n: string) => n.includes('建议先补 spec'));
    expect(notice).toBeFalsy();
  });
});

// ── AC-38a.4: detection event log carries the full LLM conclusion ─────────────
// The audit blocked on the event log not, on its own, proving model call ID,
// input summary, output conclusion and confidence. These tests point appendEvent
// at a temp JSONL file and assert every required field lands in the log.

describe('FR-38a detection event log completeness (AC-38a.4)', () => {
  let tempRoot: string;
  let eventsPath: string;
  let originalRuntimeConfig: unknown;

  function setRuntime() {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-fr38a-evt-'));
    eventsPath = path.join(tempRoot, 'logs', 'events.jsonl');
    fs.mkdirSync(path.dirname(eventsPath), { recursive: true });
    const g = (globalThis as any)[GLOBAL_KEY];
    originalRuntimeConfig = g?.runtimeConfig ?? null;
    if (g) g.runtimeConfig = { ...(g.runtimeConfig || {}), eventsPath };
  }

  afterEach(() => {
    const g = (globalThis as any)[GLOBAL_KEY];
    if (g) g.runtimeConfig = originalRuntimeConfig;
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('writes model call ID, input summary, output conclusion and confidence to the event log', async () => {
    setRuntime();
    globalThis.fetch = vi.fn(async () => fakeChatResponse(JSON.stringify({
      status: 'advisory', introducedConcepts: ['stage-prefix routing'], matchedFrAc: ['FR-39'],
      gapSummary: 'prefix routing undefined', recommendedSpecPatch: 'add a routing FR',
      severity: 'high', confidence: 0.91, reason: 'spec has no routing concept',
    }), { id: 'chatcmpl-evt-1' }) as any);

    const rec = await mod.applySpecGapAdvisory38a({
      pipelineId: 'pl-evt-1', projectSlug: 'sevo', taskId: 't-evt-1',
      projectRoot: '.', taskDescription: 'route by stage prefix',
    });
    expect(rec.status).toBe('advisory');

    const events = readSpecGapEvents(eventsPath);
    expect(events.length).toBeGreaterThan(0);
    const ev = events[events.length - 1];
    // model call ID
    expect(ev.model).toBeTruthy();
    expect(ev.requestId).toBe('chatcmpl-evt-1');
    // input summary
    expect(ev.inputSummary).toContain('stage prefix');
    // output conclusion
    expect(ev.status).toBe('advisory');
    expect(ev.introducedConcepts).toContain('stage-prefix routing');
    expect(ev.matchedFrAc).toContain('FR-39');
    expect(ev.gapSummary).toBe('prefix routing undefined');
    expect(ev.recommendedSpecPatch).toBe('add a routing FR');
    expect(ev.reason).toBe('spec has no routing concept');
    expect(ev.detectionMethod).toBe('llm-semantic');
    // confidence
    expect(ev.confidence).toBe(0.91);
    expect(ev.severity).toBe('high');
  });
});

// ── AC-38a.7: the sync race never exceeds the stated budget (no 50ms grace) ───

describe('FR-38a sync timeout is exactly the budget (AC-38a.7)', () => {
  const base = { projectSlug: 'sevo', taskId: 't-budget', projectRoot: '.', taskDescription: 'slow task' };

  it('a hung fetch resolves to degraded within the budget, with no grace overrun', async () => {
    globalThis.fetch = vi.fn((_url: any, opts: any) => new Promise((resolve, reject) => {
      // Never resolves on its own and ignores the abort signal, forcing the
      // outer wall-clock race (not the AbortController) to be the bound.
      opts?.signal?.addEventListener?.('abort', () => {});
    }) as any);

    const timeoutMs = 150;
    const start = Date.now();
    const rec = await mod.runSpecGapAdvisoryCheck({ ...base, timeoutMs });
    const elapsed = Date.now() - start;
    expect(rec.status).toBe('degraded');
    expect(rec.reason).toBe('llm-timeout');
    // No +50ms grace: the race fires at exactly timeoutMs. Allow a small
    // scheduler tolerance but assert it is well under the old timeoutMs+50 path.
    expect(elapsed).toBeLessThan(timeoutMs + 40);
  });
});
