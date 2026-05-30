/**
 * Pipeline Lifecycle Integration Tests
 *
 * End-to-end verification of the PipelineEngine across full pipeline lifecycles:
 * L0 (minimal), L1 (standard), L2+ (full with parallel branches).
 * Covers: creation, sequential advance, parallel branch activation,
 * gate blocking/unblocking, failure/retry, and pipeline completion.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { PipelineEngine } from '../pipeline-engine.js';
import type {
  ArtifactRef,
  RoutingResult,
  StageId,
  PipelineEvent,
} from '../../types/index.js';

// ─── Fixtures ───

function makeArtifact(stageId: string): ArtifactRef {
  return {
    id: `${stageId}-artifact-${Date.now()}`,
    type: 'file',
    path: `artifacts/${stageId}/output.md`,
    createdAt: new Date().toISOString(),
  };
}

const L2_FULL_ROUTING: RoutingResult = {
  taskId: 'lifecycle-l2',
  level: 'L2+',
  requiredStages: [
    'spec', 'spec-review-gate', 'test-case-authoring',
    'ux-acceptance-authoring', 'commercial-acceptance-authoring',
    'contract', 'contract-review-gate', 'implement', 'review',
    'regression', 'publish-generalization-gate', 'deploy', 'verify', 'ledger',
  ],
  skippedStages: [],
  matchedRules: ['new-module'],
      needsUxDesign: false, uxDesignReason: '', needsArchDesign: false, archDesignReason: '',
};

const L0_ROUTING: RoutingResult = {
  taskId: 'lifecycle-l0',
  level: 'L0',
  requiredStages: ['implement', 'review', 'regression', 'verify', 'ledger'],
  skippedStages: [
    { stage: 'spec', reason: 'L0' },
    { stage: 'spec-review-gate', reason: 'L0' },
    { stage: 'contract', reason: 'L0' },
    { stage: 'contract-review-gate', reason: 'L0' },
  ],
  matchedRules: [],
      needsUxDesign: false, uxDesignReason: '', needsArchDesign: false, archDesignReason: '',
};
function readEvents(tmpDir: string, pipelineId: string): PipelineEvent[] {
  const fp = path.join(tmpDir, 'pipelines', pipelineId, 'events.jsonl');
  return fs.readFileSync(fp, 'utf-8').trim().split('\n').map(l => JSON.parse(l));
}

// ─── Test Suite ───

describe('Pipeline Lifecycle — L2+ full flow', () => {
  let tmpDir: string;
  let engine: PipelineEngine;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-lifecycle-'));
    engine = new PipelineEngine(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('Test 1: creates pipeline with correct initial state', async () => {
    const state = engine.create(L2_FULL_ROUTING);

    expect(state.pipelineId).toBeTruthy();
    expect(state.taskId).toBe('lifecycle-l2');
    expect(state.level).toBe('L2+');
    expect(state.requiredStages).toHaveLength(14);
    expect(state.stages['spec'].status).toBe('active');

    for (const sid of state.requiredStages.slice(1)) {
      expect(state.stages[sid].status).toBe('pending');
    }
  });

  it('Test 2: advances through specify → spec-review-gate → parallel branches', async () => {
    const state = engine.create(L2_FULL_ROUTING);
    const pid = state.pipelineId;

    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [makeArtifact('spec')] });
    let s = engine.load(pid);
    expect(s.stages['spec'].status).toBe('passed');
    expect(s.stages['spec-review-gate'].status).toBe('active');

    engine.advance(pid, { stageId: 'spec-review-gate', outcome: 'passed', artifacts: [] });
    s = engine.load(pid);
    expect(s.stages['contract'].status).toBe('active');
    expect(s.stages['test-case-authoring'].status).toBe('active');
    expect(s.stages['ux-acceptance-authoring'].status).toBe('active');
    expect(s.stages['commercial-acceptance-authoring'].status).toBe('active');
  });

  it('Test 3: completes full L2+ lifecycle end-to-end', async () => {
    const state = engine.create(L2_FULL_ROUTING);
    const pid = state.pipelineId;

    expect(engine.isComplete(pid)).toBe(false);

    // Phase 1: spec → spec-review-gate
    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [makeArtifact('spec')] });
    engine.advance(pid, { stageId: 'spec-review-gate', outcome: 'passed', artifacts: [] });

    // Phase 2: parallel branches
    engine.advance(pid, { stageId: 'test-case-authoring', outcome: 'passed', artifacts: [makeArtifact('test-case')] });
    engine.advance(pid, { stageId: 'ux-acceptance-authoring', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'commercial-acceptance-authoring', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'contract', outcome: 'passed', artifacts: [makeArtifact('contract')] });
    engine.advance(pid, { stageId: 'contract-review-gate', outcome: 'passed', artifacts: [] });

    // Phase 3: implement → review → regression → publish gate → deploy → verify → ledger
    let s = engine.load(pid);
    expect(s.stages['implement'].status).toBe('active');

    engine.advance(pid, { stageId: 'implement', outcome: 'passed', artifacts: [makeArtifact('impl')] });
    engine.advance(pid, { stageId: 'review', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'regression', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'publish-generalization-gate', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'deploy', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'verify', outcome: 'passed', artifacts: [makeArtifact('verify')] });
    engine.advance(pid, { stageId: 'ledger', outcome: 'passed', artifacts: [] });

    expect(engine.isComplete(pid)).toBe(true);

    s = engine.load(pid);
    for (const sid of s.requiredStages) {
      expect(s.stages[sid].status).toBe('passed');
    }

    const events = readEvents(tmpDir, pid);
    const types = events.map(e => e.eventType);
    expect(types).toContain('pipeline_created');
    expect(types).toContain('pipeline_completed');
    expect(types.filter(t => t === 'stage_completed')).toHaveLength(14);
  });

  it('Test 4: gate blocking — implement blocked until test-case-authoring done', async () => {
    const state = engine.create(L2_FULL_ROUTING);
    const pid = state.pipelineId;

    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'spec-review-gate', outcome: 'passed', artifacts: [] });

    // Complete contract path but NOT test-case-authoring
    engine.advance(pid, { stageId: 'contract', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'contract-review-gate', outcome: 'passed', artifacts: [] });

    let s = engine.load(pid);
    expect(s.stages['implement'].status).toBe('blocked');

    // Now complete test-case-authoring → implement should unblock
    engine.advance(pid, { stageId: 'test-case-authoring', outcome: 'passed', artifacts: [] });
    // Also complete the other parallel branches
    engine.advance(pid, { stageId: 'ux-acceptance-authoring', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'commercial-acceptance-authoring', outcome: 'passed', artifacts: [] });

    s = engine.load(pid);
    expect(s.stages['implement'].status).toBe('active');
  });

  it('Test 5: failure and retry — stage fails then retries successfully', async () => {
    const state = engine.create(L2_FULL_ROUTING);
    const pid = state.pipelineId;

    // Fail spec
    engine.advance(pid, {
      stageId: 'spec', outcome: 'failed', artifacts: [],
      failureReason: 'Missing acceptance criteria',
    });

    let s = engine.load(pid);
    expect(s.stages['spec'].status).toBe('failed');
    expect(s.stages['spec'].failureReason).toBe('Missing acceptance criteria');
    expect(s.stages['spec-review-gate'].status).toBe('pending');

    // Retry spec
    engine.activate(pid, 'spec');
    s = engine.load(pid);
    expect(s.stages['spec'].status).toBe('active');

    // Now pass spec
    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [makeArtifact('spec-v2')] });
    s = engine.load(pid);
    expect(s.stages['spec'].status).toBe('passed');
    expect(s.stages['spec-review-gate'].status).toBe('active');
  });

  it('Test 6: cannot skip stages — advancing a pending stage throws', async () => {
    const state = engine.create(L2_FULL_ROUTING);
    const pid = state.pipelineId;

    // Try to advance contract (still pending, spec hasn't passed)
    expect(() => {
      engine.advance(pid, { stageId: 'contract', outcome: 'passed', artifacts: [] });
    }).toThrow();
  });

  it('Test 7: cannot activate a passed stage', async () => {
    const state = engine.create(L2_FULL_ROUTING);
    const pid = state.pipelineId;

    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [] });

    expect(() => {
      engine.activate(pid, 'spec');
    }).toThrow(/Cannot activate/);
  });

  it('Test 8: events journal records full lifecycle', async () => {
    const state = engine.create(L2_FULL_ROUTING);
    const pid = state.pipelineId;

    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [makeArtifact('spec')] });

    const events = readEvents(tmpDir, pid);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]!.eventType).toBe('pipeline_created');
    expect(events.every(e => e.pipelineId === pid)).toBe(true);
    expect(events.every(e => e.timestamp)).toBe(true);
  });
});

describe('Pipeline Lifecycle — L0 minimal flow', () => {
  let tmpDir: string;
  let engine: PipelineEngine;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-lifecycle-l0-'));
    engine = new PipelineEngine(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('L0 pipeline completes with minimal stages', async () => {
    const state = engine.create(L0_ROUTING);
    const pid = state.pipelineId;

    expect(state.stages['implement'].status).toBe('active');
    expect(state.stages['spec']?.status).toBe('skipped');

    engine.advance(pid, { stageId: 'implement', outcome: 'passed', artifacts: [makeArtifact('impl')] });
    engine.advance(pid, { stageId: 'review', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'regression', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'verify', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'ledger', outcome: 'passed', artifacts: [] });

    expect(engine.isComplete(pid)).toBe(true);

    const events = readEvents(tmpDir, pid);
    const types = events.map(e => e.eventType);
    expect(types).toContain('pipeline_completed');
  });

  it('L0 failure mid-pipeline does not corrupt state', async () => {
    const state = engine.create(L0_ROUTING);
    const pid = state.pipelineId;

    engine.advance(pid, { stageId: 'implement', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'review', outcome: 'failed', artifacts: [], failureReason: 'Code quality issues' });

    let s = engine.load(pid);
    expect(s.stages['review'].status).toBe('failed');
    expect(s.stages['regression'].status).toBe('pending');
    expect(engine.isComplete(pid)).toBe(false);

    // Retry and complete
    engine.activate(pid, 'review');
    engine.advance(pid, { stageId: 'review', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'regression', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'verify', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'ledger', outcome: 'passed', artifacts: [] });

    expect(engine.isComplete(pid)).toBe(true);
  });
});
