import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { LedgerEngine } from '../ledger-engine.js';
import {
  collectArtifacts,
  collectStageRecords,
  allRequiredStagesPassed,
} from '../artifact-collector.js';

import type {
  PipelineState,
  StageId,
  StageRecord,
  ArtifactRef,
} from '../../types/index.js';

// ─── Fixtures ───

function makeArtifact(id: string): ArtifactRef {
  return { id, type: 'document', path: `/artifacts/${id}`, createdAt: new Date().toISOString() };
}

function makeStageRecord(stageId: StageId, status: StageRecord['status'], artifacts: ArtifactRef[] = []): StageRecord {
  return {
    stageId,
    status,
    artifacts,
    ...(status !== 'pending' ? { startedAt: new Date().toISOString() } : {}),
    ...(['passed', 'failed', 'skipped'].includes(status) ? { completedAt: new Date().toISOString() } : {}),
  };
}

function makePipelineState(overrides: Partial<PipelineState> = {}): PipelineState {
  const requiredStages: StageId[] = ['spec', 'spec-review-gate', 'implement', 'review', 'ledger'];
  const stages = {} as Record<StageId, StageRecord>;
  for (const sid of requiredStages) {
    stages[sid] = makeStageRecord(sid, 'passed', [makeArtifact(`${sid}-art-1`)]);
  }

  return {
    pipelineId: 'pipe-001',
    taskId: 'task-001',
    level: 'L2+',
    requiredStages,
    stages,
    currentStage: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T01:00:00.000Z',
    ...overrides,
  };
}

function writePipelineState(basePath: string, state: PipelineState): void {
  const dir = path.join(basePath, 'pipelines', state.pipelineId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(state, null, 2), 'utf-8');
}

// ─── Tests ───

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-ledger-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── artifact-collector ──

describe('artifact-collector', () => {
  it('collectArtifacts deduplicates by id', () => {
    const shared = makeArtifact('shared-1');
    const state = makePipelineState();
    state.stages['spec'].artifacts = [shared, makeArtifact('spec-only')];
    state.stages['implement'].artifacts = [shared]; // duplicate

    const result = collectArtifacts(state);
    const ids = result.map((a) => a.id);
    expect(ids.filter((id) => id === 'shared-1')).toHaveLength(1);
    expect(ids).toContain('spec-only');
  });

  it('collectStageRecords returns records in pipeline order', () => {
    const state = makePipelineState();
    const records = collectStageRecords(state);
    expect(records.map((r) => r.stageId)).toEqual(state.requiredStages);
  });

  it('allRequiredStagesPassed returns true when all passed/skipped', () => {
    const state = makePipelineState();
    expect(allRequiredStagesPassed(state)).toBe(true);
  });

  it('allRequiredStagesPassed returns true with skipped stages', () => {
    const state = makePipelineState();
    state.stages['review'].status = 'skipped';
    expect(allRequiredStagesPassed(state)).toBe(true);
  });

  it('allRequiredStagesPassed returns false when a stage failed', () => {
    const state = makePipelineState();
    state.stages['implement'].status = 'failed';
    expect(allRequiredStagesPassed(state)).toBe(false);
  });
});

// ── LedgerEngine ──

describe('LedgerEngine', () => {
  describe('record()', () => {
    it('creates a delivered entry when all stages passed', () => {
      const state = makePipelineState();
      writePipelineState(tmpDir, state);

      const engine = new LedgerEngine(tmpDir);
      const entry = engine.record('pipe-001');

      expect(entry.pipelineId).toBe('pipe-001');
      expect(entry.conclusion).toBe('delivered');
      expect(entry.scope).toBe('L2+');
      expect(entry.stages).toHaveLength(5);
      expect(entry.evidence.length).toBeGreaterThan(0);
      expect(entry.version).toMatch(/^[a-z0-9]+-[a-f0-9]{8}$/);
      expect(entry.createdAt).toBeTruthy();
    });

    it('creates an aborted entry when a stage failed', () => {
      const state = makePipelineState();
      state.stages['implement'].status = 'failed';
      state.stages['implement'].failureReason = 'Tests did not pass';
      writePipelineState(tmpDir, state);

      const engine = new LedgerEngine(tmpDir);
      const entry = engine.record('pipe-001');

      expect(entry.conclusion).toBe('aborted');
    });

    it('appends to ledger.jsonl', () => {
      const state = makePipelineState();
      writePipelineState(tmpDir, state);

      const engine = new LedgerEngine(tmpDir);
      engine.record('pipe-001');
      engine.record('pipe-001');

      const content = fs.readFileSync(path.join(tmpDir, 'ledger.jsonl'), 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      expect(lines).toHaveLength(2);
    });

    it('throws when pipeline state does not exist', () => {
      const engine = new LedgerEngine(tmpDir);
      expect(() => engine.record('nonexistent')).toThrow();
    });
  });

  describe('query()', () => {
    function seedEntries(engine: LedgerEngine): void {
      // Seed two pipelines with different states
      const stateA = makePipelineState({ pipelineId: 'pipe-A', level: 'L2+' });
      writePipelineState(tmpDir, stateA);

      const stateB = makePipelineState({ pipelineId: 'pipe-B', level: 'L1' });
      stateB.stages['implement'].status = 'failed';
      writePipelineState(tmpDir, stateB);

      engine.record('pipe-A');
      engine.record('pipe-B');
    }

    it('returns all entries with empty filter', () => {
      const engine = new LedgerEngine(tmpDir);
      seedEntries(engine);

      const results = engine.query({});
      expect(results).toHaveLength(2);
    });

    it('filters by pipelineId', () => {
      const engine = new LedgerEngine(tmpDir);
      seedEntries(engine);

      const results = engine.query({ pipelineId: 'pipe-A' });
      expect(results).toHaveLength(1);
      expect(results[0]?.pipelineId).toBe('pipe-A');
    });

    it('filters by conclusion', () => {
      const engine = new LedgerEngine(tmpDir);
      seedEntries(engine);

      const delivered = engine.query({ conclusion: 'delivered' });
      expect(delivered).toHaveLength(1);
      expect(delivered[0]?.conclusion).toBe('delivered');

      const aborted = engine.query({ conclusion: 'aborted' });
      expect(aborted).toHaveLength(1);
      expect(aborted[0]?.conclusion).toBe('aborted');
    });

    it('filters by scope', () => {
      const engine = new LedgerEngine(tmpDir);
      seedEntries(engine);

      const results = engine.query({ scope: 'L1' });
      expect(results).toHaveLength(1);
      expect(results[0]?.scope).toBe('L1');
    });

    it('filters by time range (since/until)', () => {
      const engine = new LedgerEngine(tmpDir);
      seedEntries(engine);

      // All entries created "now", so a future since should return nothing
      const results = engine.query({ since: '2099-01-01T00:00:00.000Z' });
      expect(results).toHaveLength(0);

      // A past until should also return nothing
      const results2 = engine.query({ until: '2000-01-01T00:00:00.000Z' });
      expect(results2).toHaveLength(0);

      // A wide range should return all
      const results3 = engine.query({ since: '2000-01-01T00:00:00.000Z', until: '2099-12-31T23:59:59.999Z' });
      expect(results3).toHaveLength(2);
    });

    it('returns empty array when ledger file does not exist', () => {
      const engine = new LedgerEngine(tmpDir);
      const results = engine.query({});
      expect(results).toHaveLength(0);
    });

    it('combines multiple filters', () => {
      const engine = new LedgerEngine(tmpDir);
      seedEntries(engine);

      const results = engine.query({ scope: 'L2+', conclusion: 'delivered' });
      expect(results).toHaveLength(1);
      expect(results[0]?.pipelineId).toBe('pipe-A');

      const results2 = engine.query({ scope: 'L2+', conclusion: 'aborted' });
      expect(results2).toHaveLength(0);
    });
  });
});
