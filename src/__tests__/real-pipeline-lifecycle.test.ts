/**
 * Real Pipeline Lifecycle Integration Test
 *
 * Validates a KIVO-like project walking through the COMPLETE SDD pipeline,
 * including the smoke-test → {ux-acceptance ∥ pm-commercial-review} → regression
 * parallel fork/join that the existing lifecycle tests omit.
 *
 * Uses real PipelineEngine (no mocking of core logic). Only external I/O
 * (filesystem) is isolated via a temp directory.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { PipelineEngine } from '../pipeline/pipeline-engine.js';
import type {
  ArtifactRef,
  RoutingResult,
  StageId,
  PipelineEvent,
} from '../types/index.js';

// ─── Helpers ───

function makeArtifact(stageId: string): ArtifactRef {
  return {
    id: `${stageId}-artifact-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: 'file',
    path: `artifacts/${stageId}/output.md`,
    createdAt: new Date().toISOString(),
  };
}

function readEvents(tmpDir: string, pipelineId: string): PipelineEvent[] {
  const fp = path.join(tmpDir, 'pipelines', pipelineId, 'events.jsonl');
  return fs
    .readFileSync(fp, 'utf-8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
}

// ─── Routing Fixtures ───

/**
 * Full SDD routing — mirrors a real KIVO project with ALL 17 stages.
 * Critically includes smoke-test, ux-acceptance, pm-commercial-review
 * which form the second parallel fork/join.
 */
const KIVO_FULL_ROUTING: RoutingResult = {
  taskId: 'kivo-lifecycle-full',
  level: 'L2+',
  requiredStages: [
    'spec',
    'spec-review-gate',
    'test-case-authoring',
    'ux-acceptance-authoring',
    'commercial-acceptance-authoring',
    'contract',
    'contract-review-gate',
    'implement',
    'review',
    'smoke-test',
    'ux-acceptance',
    'pm-commercial-review',
    'regression',
    'publish-generalization-gate',
    'deploy',
    'verify',
    'ledger',
  ],
  matchedRules: ['new-module', 'cross-domain'],
      needsUxDesign: false, uxDesignReason: '', needsArchDesign: false, archDesignReason: '',
};

/** L0 routing — minimal pipeline for micro-changes. */
const L0_ROUTING: RoutingResult = {
  taskId: 'kivo-lifecycle-l0',
  level: 'L0',
  requiredStages: ['implement', 'review', 'regression', 'verify', 'ledger'],
  matchedRules: [],
      needsUxDesign: false, uxDesignReason: '', needsArchDesign: false, archDesignReason: '',
};

// ─── Test Suite ───

describe('Real Pipeline Lifecycle — KIVO full SDD', () => {
  let tmpDir: string;
  let engine: PipelineEngine;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-real-lifecycle-'));
    engine = new PipelineEngine(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── 1. Pipeline Creation ──

  it('creates pipeline with all 17 stages and correct initial state', async () => {
    const state = engine.create(KIVO_FULL_ROUTING);

    expect(state.pipelineId).toBeTruthy();
    expect(state.taskId).toBe('kivo-lifecycle-full');
    expect(state.level).toBe('L2+');
    expect(state.requiredStages).toHaveLength(17);

    // First stage auto-activated
    expect(state.stages['spec'].status).toBe('active');
    expect(state.stages['spec'].startedAt).toBeTruthy();

    // All others pending
    for (const sid of state.requiredStages.slice(1)) {
      expect(state.stages[sid].status).toBe('pending');
    }

    // Timestamps set
    expect(state.createdAt).toBeTruthy();
    expect(state.updatedAt).toBeTruthy();
  });

  // ── 2. Full Stage Chain — specify through ledger ──

  it('completes the entire 17-stage lifecycle end-to-end', async () => {
    const state = engine.create(KIVO_FULL_ROUTING);
    const pid = state.pipelineId;

    expect(engine.isComplete(pid)).toBe(false);

    // Phase 1: spec → spec-review-gate
    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [makeArtifact('spec')] });
    let s = engine.load(pid);
    expect(s.stages['spec'].status).toBe('passed');
    expect(s.stages['spec'].completedAt).toBeTruthy();
    expect(s.stages['spec-review-gate'].status).toBe('active');

    engine.advance(pid, { stageId: 'spec-review-gate', outcome: 'passed', artifacts: [] });

    // Phase 2: parallel fork after spec-review-gate
    s = engine.load(pid);
    expect(s.stages['test-case-authoring'].status).toBe('active');
    expect(s.stages['ux-acceptance-authoring'].status).toBe('active');
    expect(s.stages['commercial-acceptance-authoring'].status).toBe('active');
    expect(s.stages['contract'].status).toBe('active');

    // Complete all 4 parallel branches
    engine.advance(pid, { stageId: 'test-case-authoring', outcome: 'passed', artifacts: [makeArtifact('test-case')] });
    engine.advance(pid, { stageId: 'ux-acceptance-authoring', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'commercial-acceptance-authoring', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'contract', outcome: 'passed', artifacts: [makeArtifact('contract')] });

    // contract-review-gate activates after contract passes
    s = engine.load(pid);
    expect(s.stages['contract-review-gate'].status).toBe('active');

    engine.advance(pid, { stageId: 'contract-review-gate', outcome: 'passed', artifacts: [] });

    // Phase 3: implement (should be active since test-case-authoring already passed)
    s = engine.load(pid);
    expect(s.stages['implement'].status).toBe('active');

    engine.advance(pid, { stageId: 'implement', outcome: 'passed', artifacts: [makeArtifact('impl')] });

    // review
    s = engine.load(pid);
    expect(s.stages['review'].status).toBe('active');
    engine.advance(pid, { stageId: 'review', outcome: 'passed', artifacts: [] });

    // smoke-test
    s = engine.load(pid);
    expect(s.stages['smoke-test'].status).toBe('active');
    engine.advance(pid, { stageId: 'smoke-test', outcome: 'passed', artifacts: [makeArtifact('smoke')] });

    // Phase 4: parallel fork after smoke-test — BOTH should activate
    s = engine.load(pid);
    expect(s.stages['ux-acceptance'].status).toBe('active');
    expect(s.stages['pm-commercial-review'].status).toBe('active');
    // regression must still be pending (waiting for both)
    expect(s.stages['regression'].status).toBe('pending');

    // Complete both parallel branches
    engine.advance(pid, { stageId: 'ux-acceptance', outcome: 'passed', artifacts: [makeArtifact('ux')] });
    engine.advance(pid, { stageId: 'pm-commercial-review', outcome: 'passed', artifacts: [makeArtifact('pm')] });

    // Phase 5: regression → publish-generalization-gate → deploy → verify → ledger
    s = engine.load(pid);
    expect(s.stages['regression'].status).toBe('active');

    engine.advance(pid, { stageId: 'regression', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'publish-generalization-gate', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'deploy', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'verify', outcome: 'passed', artifacts: [makeArtifact('verify')] });
    engine.advance(pid, { stageId: 'ledger', outcome: 'passed', artifacts: [] });

    // Pipeline complete
    expect(engine.isComplete(pid)).toBe(true);

    // All required stages passed with timestamps
    s = engine.load(pid);
    for (const sid of s.requiredStages) {
      const rec = s.stages[sid];
      expect(rec.status).toBe('passed');
      expect(rec.startedAt).toBeTruthy();
      expect(rec.completedAt).toBeTruthy();
      expect(new Date(rec.completedAt!).getTime()).toBeGreaterThanOrEqual(
        new Date(rec.startedAt!).getTime(),
      );
    }

    // Events journal has pipeline_created and pipeline_completed
    const events = readEvents(tmpDir, pid);
    const types = events.map((e) => e.eventType);
    expect(types).toContain('pipeline_created');
    expect(types).toContain('pipeline_completed');
    expect(types.filter((t) => t === 'stage_completed')).toHaveLength(17);
    expect(types.filter((t) => t === 'stage_activated')).toHaveLength(17);
  });

  // ── 3. Parallel Fork/Join: smoke-test → {ux-acceptance ∥ pm-commercial-review} → regression ──

  it('activates both parallel branches after smoke-test and blocks regression until both complete', async () => {
    const state = engine.create(KIVO_FULL_ROUTING);
    const pid = state.pipelineId;

    // Fast-forward to smoke-test
    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'spec-review-gate', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'test-case-authoring', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'ux-acceptance-authoring', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'commercial-acceptance-authoring', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'contract', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'contract-review-gate', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'implement', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'review', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'smoke-test', outcome: 'passed', artifacts: [] });

    let s = engine.load(pid);
    // Both parallel branches active
    expect(s.stages['ux-acceptance'].status).toBe('active');
    expect(s.stages['pm-commercial-review'].status).toBe('active');
    // Regression blocked
    expect(s.stages['regression'].status).toBe('pending');

    // Complete only ux-acceptance — regression still pending
    engine.advance(pid, { stageId: 'ux-acceptance', outcome: 'passed', artifacts: [] });
    s = engine.load(pid);
    expect(s.stages['regression'].status).toBe('pending');
    expect(s.stages['pm-commercial-review'].status).toBe('active');

    // Complete pm-commercial-review — regression should now activate
    engine.advance(pid, { stageId: 'pm-commercial-review', outcome: 'passed', artifacts: [] });
    s = engine.load(pid);
    expect(s.stages['regression'].status).toBe('active');
  });

  it('parallel join works regardless of completion order (pm first, then ux)', async () => {
    const state = engine.create(KIVO_FULL_ROUTING);
    const pid = state.pipelineId;

    // Fast-forward to smoke-test
    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'spec-review-gate', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'test-case-authoring', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'ux-acceptance-authoring', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'commercial-acceptance-authoring', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'contract', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'contract-review-gate', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'implement', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'review', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'smoke-test', outcome: 'passed', artifacts: [] });

    // Complete pm-commercial-review FIRST
    engine.advance(pid, { stageId: 'pm-commercial-review', outcome: 'passed', artifacts: [] });
    let s = engine.load(pid);
    expect(s.stages['regression'].status).toBe('pending');

    // Then ux-acceptance
    engine.advance(pid, { stageId: 'ux-acceptance', outcome: 'passed', artifacts: [] });
    s = engine.load(pid);
    expect(s.stages['regression'].status).toBe('active');
  });

  // ── 4. L0 Skip Verification ──

  it('L0 pipeline skips stages correctly and completes with minimal path', async () => {
    const state = engine.create(L0_ROUTING);
    const pid = state.pipelineId;

    // Required stages: implement → review → regression → verify → ledger
    expect(state.stages['implement'].status).toBe('active');

    engine.advance(pid, { stageId: 'implement', outcome: 'passed', artifacts: [makeArtifact('impl')] });
    engine.advance(pid, { stageId: 'review', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'regression', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'verify', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'ledger', outcome: 'passed', artifacts: [] });

    expect(engine.isComplete(pid)).toBe(true);

    const s = engine.load(pid);
    for (const sid of L0_ROUTING.requiredStages) {
      expect(s.stages[sid].status).toBe('passed');
      expect(s.stages[sid].completedAt).toBeTruthy();
    }

    const events = readEvents(tmpDir, pid);
    const types = events.map((e) => e.eventType);
    expect(types).toContain('pipeline_completed');
  });

  // ── 5. Failure & Retry ──

  it('stage failure does not corrupt state and retry completes successfully', async () => {
    const state = engine.create(KIVO_FULL_ROUTING);
    const pid = state.pipelineId;

    // Fail spec
    engine.advance(pid, {
      stageId: 'spec',
      outcome: 'failed',
      artifacts: [],
      failureReason: 'Missing acceptance criteria',
    });

    let s = engine.load(pid);
    // 原则：流水线永远往前走。失败 → fix_pending 修复循环，而非 failed 终态。
    expect(s.stages['spec'].status).toBe('fix_pending');
    expect(s.stages['spec'].failureReason).toBe('Missing acceptance criteria');
    expect(s.stages['spec-review-gate'].status).toBe('pending');
    expect(engine.isComplete(pid)).toBe(false);

    // Retry
    engine.activate(pid, 'spec');
    s = engine.load(pid);
    expect(s.stages['spec'].status).toBe('active');

    // Pass on retry
    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [makeArtifact('spec-v2')] });
    s = engine.load(pid);
    expect(s.stages['spec'].status).toBe('passed');
    expect(s.stages['spec-review-gate'].status).toBe('active');
  });

  it('failure in a parallel branch does not affect sibling branches', async () => {
    const state = engine.create(KIVO_FULL_ROUTING);
    const pid = state.pipelineId;

    // Fast-forward to smoke-test parallel fork
    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'spec-review-gate', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'test-case-authoring', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'ux-acceptance-authoring', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'commercial-acceptance-authoring', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'contract', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'contract-review-gate', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'implement', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'review', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'smoke-test', outcome: 'passed', artifacts: [] });

    // Fail ux-acceptance
    engine.advance(pid, {
      stageId: 'ux-acceptance',
      outcome: 'failed',
      artifacts: [],
      failureReason: 'Visual regression detected',
    });

    let s = engine.load(pid);
    // 原则：流水线永远往前走。失败 → fix_pending 修复循环，而非 failed 终态。
    expect(s.stages['ux-acceptance'].status).toBe('fix_pending');
    // Sibling unaffected
    expect(s.stages['pm-commercial-review'].status).toBe('active');
    // Regression still pending
    expect(s.stages['regression'].status).toBe('pending');

    // Retry ux-acceptance and pass
    engine.activate(pid, 'ux-acceptance');
    engine.advance(pid, { stageId: 'ux-acceptance', outcome: 'passed', artifacts: [] });

    // Complete pm-commercial-review
    engine.advance(pid, { stageId: 'pm-commercial-review', outcome: 'passed', artifacts: [] });

    // Now regression should activate
    s = engine.load(pid);
    expect(s.stages['regression'].status).toBe('active');
  });

  // ── 6. Implement Proceeds Regardless of Test-Case-Authoring (always forward) ──

  it('implement is not blocked when test-case-authoring is not yet passed', async () => {
    const state = engine.create(KIVO_FULL_ROUTING);
    const pid = state.pipelineId;

    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'spec-review-gate', outcome: 'passed', artifacts: [] });

    // Complete contract path but NOT test-case-authoring
    engine.advance(pid, { stageId: 'ux-acceptance-authoring', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'commercial-acceptance-authoring', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'contract', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'contract-review-gate', outcome: 'passed', artifacts: [] });

    let s = engine.load(pid);
    // 原则：流水线永远往前走。implement 不再被 test-case-authoring 阻断。
    expect(s.stages['implement'].status).toBe('active');
    expect(s.stages['implement'].blockReason).toBeUndefined();

    // Completing test-case-authoring leaves implement active.
    engine.advance(pid, { stageId: 'test-case-authoring', outcome: 'passed', artifacts: [] });
    s = engine.load(pid);
    expect(s.stages['implement'].status).toBe('active');
  });

  // ── 7. Stage Ordering Matches DAG ──

  it('stage activation timestamps follow DAG ordering', async () => {
    const state = engine.create(KIVO_FULL_ROUTING);
    const pid = state.pipelineId;

    // Walk the entire pipeline
    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'spec-review-gate', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'test-case-authoring', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'ux-acceptance-authoring', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'commercial-acceptance-authoring', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'contract', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'contract-review-gate', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'implement', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'review', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'smoke-test', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'ux-acceptance', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'pm-commercial-review', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'regression', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'publish-generalization-gate', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'deploy', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'verify', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'ledger', outcome: 'passed', artifacts: [] });

    const s = engine.load(pid);

    // DAG ordering constraints: each stage's startedAt must be >= its prerequisite's completedAt
    const dagEdges: [StageId, StageId][] = [
      ['spec', 'spec-review-gate'],
      ['spec-review-gate', 'test-case-authoring'],
      ['spec-review-gate', 'ux-acceptance-authoring'],
      ['spec-review-gate', 'commercial-acceptance-authoring'],
      ['spec-review-gate', 'contract'],
      ['contract', 'contract-review-gate'],
      ['contract-review-gate', 'implement'],
      ['implement', 'review'],
      ['review', 'smoke-test'],
      ['smoke-test', 'ux-acceptance'],
      ['smoke-test', 'pm-commercial-review'],
      ['ux-acceptance', 'regression'],
      ['pm-commercial-review', 'regression'],
      ['regression', 'publish-generalization-gate'],
      ['publish-generalization-gate', 'deploy'],
      ['deploy', 'verify'],
      ['verify', 'ledger'],
    ];

    for (const [from, to] of dagEdges) {
      const fromRec = s.stages[from];
      const toRec = s.stages[to];
      expect(
        new Date(toRec.startedAt!).getTime(),
        `${to}.startedAt should be >= ${from}.completedAt`,
      ).toBeGreaterThanOrEqual(new Date(fromRec.completedAt!).getTime());
    }
  });

  // ── 8. Cannot Advance Pending Stage ──

  it('throws when trying to advance a stage that is still pending', async () => {
    const state = engine.create(KIVO_FULL_ROUTING);
    const pid = state.pipelineId;

    expect(() => {
      engine.advance(pid, { stageId: 'contract', outcome: 'passed', artifacts: [] });
    }).toThrow();
  });

  // ── 9. Cannot Activate a Passed Stage ──

  it('throws when trying to activate a stage that already passed', async () => {
    const state = engine.create(KIVO_FULL_ROUTING);
    const pid = state.pipelineId;

    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [] });

    expect(() => {
      engine.activate(pid, 'spec');
    }).toThrow(/Cannot activate/);
  });

  // ── 10. Events Journal Integrity ──

  it('events journal records all stage transitions in correct order', async () => {
    const state = engine.create(KIVO_FULL_ROUTING);
    const pid = state.pipelineId;

    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [makeArtifact('spec')] });
    engine.advance(pid, { stageId: 'spec-review-gate', outcome: 'passed', artifacts: [] });

    const events = readEvents(tmpDir, pid);

    // First event should be pipeline_created
    expect(events[0]!.eventType).toBe('pipeline_created');

    // Should have stage_activated and stage_completed events
    const activated = events.filter((e) => e.eventType === 'stage_activated');
    const completed = events.filter((e) => e.eventType === 'stage_completed');

    // spec activated (auto) + spec-review-gate activated + 4 parallel branches activated
    expect(activated.length).toBeGreaterThanOrEqual(2);
    // spec completed + spec-review-gate completed
    expect(completed.length).toBe(2);

    // All events have timestamps and pipelineId
    for (const event of events) {
      expect(event.timestamp).toBeTruthy();
      expect(event.pipelineId).toBe(pid);
    }
  });

  // ── 11. Persistence — state survives reload ──

  it('pipeline state persists across engine reloads', async () => {
    const state = engine.create(KIVO_FULL_ROUTING);
    const pid = state.pipelineId;

    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [makeArtifact('spec')] });

    // Create a new engine instance pointing to the same directory
    const engine2 = new PipelineEngine(tmpDir);
    const reloaded = engine2.load(pid);

    expect(reloaded.stages['spec']!.status).toBe('passed');
    expect(reloaded.stages['spec-review-gate']!.status).toBe('active');

    // Continue advancing with the new engine
    engine2.advance(pid, { stageId: 'spec-review-gate', outcome: 'passed', artifacts: [] });
    const s = engine2.load(pid);
    expect(s.stages['contract'].status).toBe('active');
  });

  // ── 12. Artifact Registration ──

  it('artifacts are registered on stage records', async () => {
    const state = engine.create(KIVO_FULL_ROUTING);
    const pid = state.pipelineId;

    const art = makeArtifact('spec');
    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [art] });

    const s = engine.load(pid);
    expect(s.stages['spec']!.artifacts).toHaveLength(1);
    expect(s.stages['spec']!.artifacts[0]!.id).toBe(art.id);
    expect(s.stages['spec']!.artifacts[0]!.path).toBe(art.path);
  });
});
