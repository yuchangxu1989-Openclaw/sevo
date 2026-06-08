/**
 * E2E Full Lifecycle Integration Test
 *
 * Verifies the complete SEVO pipeline lifecycle through all 6 conceptual phases:
 *   Specify → Plan → Implement → Review → Deploy → Verify/Operate
 *
 * Covers:
 *  - Pipeline creation and initial state
 *  - Artifact generation at each stage
 *  - Gate pass/fail with blocking and retry
 *  - State transitions (pending → active → passed/failed → retry → passed)
 *  - Parallel branch fork/join
 *  - Pipeline completion
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
  PipelineState,
} from '../types/index.js';

// ─── Helpers ───

let artifactSeq = 0;
function makeArtifact(stageId: string, type = 'file'): ArtifactRef {
  return {
    id: `${stageId}-art-${++artifactSeq}`,
    type,
    path: `artifacts/${stageId}/output-${artifactSeq}.md`,
    createdAt: new Date().toISOString(),
  };
}

function readEvents(tmpDir: string, pipelineId: string): PipelineEvent[] {
  const fp = path.join(tmpDir, 'pipelines', pipelineId, 'events.jsonl');
  return fs.readFileSync(fp, 'utf-8').trim().split('\n').map(l => JSON.parse(l));
}

// L1 routing — standard pipeline fixture
const L1_ROUTING: RoutingResult = {
  taskId: 'e2e-l1-full',
  level: 'L1',
  requiredStages: [
    'spec', 'spec-review-gate',
    'implement', 'review',
    'regression',
    'publish-generalization-gate',
    'deploy', 'verify', 'ledger',
  ],
  matchedRules: ['user-explicit'],
      needsUxDesign: false, uxDesignReason: '', needsArchDesign: false, archDesignReason: '',
};

// L2+ routing — full pipeline with parallel branches
const L2_FULL_ROUTING: RoutingResult = {
  taskId: 'e2e-l2-full',
  level: 'L2+',
  requiredStages: [
    'spec', 'spec-review-gate',
    'test-case-authoring', 'ux-acceptance-authoring', 'commercial-acceptance-authoring',
    'contract', 'contract-review-gate',
    'implement', 'review',
    'smoke-test', 'ux-acceptance', 'pm-commercial-review',
    'regression', 'publish-generalization-gate',
    'deploy', 'verify', 'ledger',
  ],
  matchedRules: ['new-module', 'cross-domain'],
      needsUxDesign: false, uxDesignReason: '', needsArchDesign: false, archDesignReason: '',
};

// ─── Test Suite ───

describe('E2E Full Lifecycle — L1 standard pipeline', () => {
  let tmpDir: string;
  let engine: PipelineEngine;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-e2e-l1-'));
    engine = new PipelineEngine(tmpDir);
    artifactSeq = 0;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('walks through all 6 phases with artifacts and completes', async () => {
    const state = engine.create(L1_ROUTING);
    const pid = state.pipelineId;

    // Phase 1: Specify — spec produces artifact, gate passes
    expect(state.stages['spec'].status).toBe('active');
    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [makeArtifact('spec', 'spec-document')] });
    let s = engine.load(pid);
    expect(s.stages['spec'].status).toBe('passed');
    expect(s.stages['spec'].artifacts).toHaveLength(1);
    expect(s.stages['spec-review-gate'].status).toBe('active');

    engine.advance(pid, { stageId: 'spec-review-gate', outcome: 'passed', artifacts: [makeArtifact('spec-review-gate', 'gate-verdict')] });
    s = engine.load(pid);
    expect(s.stages['spec-review-gate'].status).toBe('passed');

    // Phase 3: Implement
    expect(engine.load(pid).stages['implement'].status).toBe('active');
    engine.advance(pid, { stageId: 'implement', outcome: 'passed', artifacts: [makeArtifact('implement', 'code-diff')] });

    // Phase 4: Review
    s = engine.load(pid);
    expect(s.stages['review'].status).toBe('active');
    engine.advance(pid, { stageId: 'review', outcome: 'passed', artifacts: [makeArtifact('review', 'review-report')] });

    // Regression + publish gate
    engine.advance(pid, { stageId: 'regression', outcome: 'passed', artifacts: [makeArtifact('regression', 'test-report')] });
    engine.advance(pid, { stageId: 'publish-generalization-gate', outcome: 'passed', artifacts: [] });

    // Phase 5: Deploy
    engine.advance(pid, { stageId: 'deploy', outcome: 'passed', artifacts: [makeArtifact('deploy', 'deploy-manifest')] });

    // Phase 6: Verify + Ledger (Operate)
    engine.advance(pid, { stageId: 'verify', outcome: 'passed', artifacts: [makeArtifact('verify', 'verification-report')] });
    engine.advance(pid, { stageId: 'ledger', outcome: 'passed', artifacts: [makeArtifact('ledger', 'ledger-entry')] });

    expect(engine.isComplete(pid)).toBe(true);

    // Verify all stages passed
    s = engine.load(pid);
    for (const sid of s.requiredStages) {
      expect(s.stages[sid].status).toBe('passed');
    }

    // Verify events contain full lifecycle markers
    const events = readEvents(tmpDir, pid);
    const types = events.map(e => e.eventType);
    expect(types[0]).toBe('pipeline_created');
    expect(types).toContain('pipeline_completed');
    expect(types.filter(t => t === 'stage_completed').length).toBe(L1_ROUTING.requiredStages.length);
    expect(types.filter(t => t === 'artifact_registered').length).toBeGreaterThanOrEqual(7);
  });

  it('gate failure blocks pipeline and retry resumes', async () => {
    const state = engine.create(L1_ROUTING);
    const pid = state.pipelineId;

    // Spec passes
    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [makeArtifact('spec')] });

    // Spec-review-gate FAILS
    engine.advance(pid, {
      stageId: 'spec-review-gate', outcome: 'failed', artifacts: [],
      failureReason: 'Missing acceptance criteria in FR-03',
    });
    let s = engine.load(pid);
    expect(s.stages['spec-review-gate'].status).toBe('fix_pending');
    expect(s.stages['spec-review-gate'].failureReason).toBe('Missing acceptance criteria in FR-03');
    // In L1, implement has no prerequisites (no contract-review-gate), so it's already active
    expect(s.stages['implement'].status).toBe('active');

    // Retry gate
    engine.activate(pid, 'spec-review-gate');
    s = engine.load(pid);
    expect(s.stages['spec-review-gate'].status).toBe('active');

    // Gate passes on retry
    engine.advance(pid, { stageId: 'spec-review-gate', outcome: 'passed', artifacts: [] });
    s = engine.load(pid);
    expect(s.stages['spec-review-gate'].status).toBe('passed');
    expect(s.stages['implement'].status).toBe('active');
  });

  it('stage state transitions follow pending → active → passed/failed', async () => {
    const state = engine.create(L1_ROUTING);
    const pid = state.pipelineId;

    // In L1, stages without prerequisites (like implement) are auto-activated at creation.
    // Only stages with unmet prerequisites remain pending.
    expect(state.stages['spec-review-gate'].status).toBe('pending');
    // implement has no contract-review-gate prerequisite in L1, so it's active
    expect(state.stages['implement'].status).toBe('active');

    // First stage is auto-activated
    expect(state.stages['spec'].status).toBe('active');
    expect(state.stages['spec'].startedAt).toBeTruthy();

    // Advance spec → passed, completedAt set
    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [] });
    const s = engine.load(pid);
    expect(s.stages['spec'].status).toBe('passed');
    expect(s.stages['spec'].completedAt).toBeTruthy();
  });

  it('multiple sequential failures and retries converge to completion', async () => {
    const state = engine.create(L1_ROUTING);
    const pid = state.pipelineId;

    // Spec fails twice, passes on third attempt
    engine.advance(pid, { stageId: 'spec', outcome: 'failed', artifacts: [], failureReason: 'attempt 1' });
    engine.activate(pid, 'spec');
    engine.advance(pid, { stageId: 'spec', outcome: 'failed', artifacts: [], failureReason: 'attempt 2' });
    engine.activate(pid, 'spec');
    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [makeArtifact('spec')] });

    let s = engine.load(pid);
    expect(s.stages['spec'].status).toBe('passed');

    // Complete remaining stages
    engine.advance(pid, { stageId: 'spec-review-gate', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'implement', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'review', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'regression', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'publish-generalization-gate', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'deploy', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'verify', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'ledger', outcome: 'passed', artifacts: [] });

    expect(engine.isComplete(pid)).toBe(true);
  });
});

describe('E2E Full Lifecycle — L2+ with parallel branches and gate blocking', () => {
  let tmpDir: string;
  let engine: PipelineEngine;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-e2e-l2-'));
    engine = new PipelineEngine(tmpDir);
    artifactSeq = 0;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('full L2+ lifecycle with parallel branches completes all 17 stages', async () => {
    const state = engine.create(L2_FULL_ROUTING);
    const pid = state.pipelineId;

    // Phase 1: Specify
    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [makeArtifact('spec', 'spec-document')] });
    engine.advance(pid, { stageId: 'spec-review-gate', outcome: 'passed', artifacts: [makeArtifact('spec-gate', 'gate-verdict')] });

    // Phase 2: Plan — parallel fork
    let s = engine.load(pid);
    expect(s.stages['test-case-authoring'].status).toBe('active');
    expect(s.stages['contract'].status).toBe('active');
    expect(s.stages['ux-acceptance-authoring'].status).toBe('active');
    expect(s.stages['commercial-acceptance-authoring'].status).toBe('active');

    engine.advance(pid, { stageId: 'test-case-authoring', outcome: 'passed', artifacts: [makeArtifact('test-case', 'test-cases')] });
    engine.advance(pid, { stageId: 'ux-acceptance-authoring', outcome: 'passed', artifacts: [makeArtifact('ux-auth', 'ux-criteria')] });
    engine.advance(pid, { stageId: 'commercial-acceptance-authoring', outcome: 'passed', artifacts: [makeArtifact('comm-auth', 'commercial-criteria')] });
    engine.advance(pid, { stageId: 'contract', outcome: 'passed', artifacts: [makeArtifact('contract', 'architecture-contract')] });
    engine.advance(pid, { stageId: 'contract-review-gate', outcome: 'passed', artifacts: [] });

    // Phase 3: Implement
    s = engine.load(pid);
    expect(s.stages['implement'].status).toBe('active');
    engine.advance(pid, { stageId: 'implement', outcome: 'passed', artifacts: [makeArtifact('implement', 'code-diff')] });

    // Phase 4: Review chain
    engine.advance(pid, { stageId: 'review', outcome: 'passed', artifacts: [makeArtifact('review', 'review-report')] });
    engine.advance(pid, { stageId: 'smoke-test', outcome: 'passed', artifacts: [makeArtifact('smoke', 'smoke-report')] });

    // Parallel fork: ux-acceptance + pm-commercial-review
    s = engine.load(pid);
    expect(s.stages['ux-acceptance'].status).toBe('active');
    expect(s.stages['pm-commercial-review'].status).toBe('active');

    engine.advance(pid, { stageId: 'ux-acceptance', outcome: 'passed', artifacts: [makeArtifact('ux-acc', 'ux-report')] });
    engine.advance(pid, { stageId: 'pm-commercial-review', outcome: 'passed', artifacts: [makeArtifact('pm-review', 'pm-report')] });

    // Parallel join → regression
    engine.advance(pid, { stageId: 'regression', outcome: 'passed', artifacts: [makeArtifact('regression', 'regression-report')] });
    engine.advance(pid, { stageId: 'publish-generalization-gate', outcome: 'passed', artifacts: [] });

    // Phase 5: Deploy
    engine.advance(pid, { stageId: 'deploy', outcome: 'passed', artifacts: [makeArtifact('deploy', 'deploy-manifest')] });

    // Phase 6: Verify + Ledger
    engine.advance(pid, { stageId: 'verify', outcome: 'passed', artifacts: [makeArtifact('verify', 'verification-report')] });
    engine.advance(pid, { stageId: 'ledger', outcome: 'passed', artifacts: [makeArtifact('ledger', 'ledger-entry')] });

    expect(engine.isComplete(pid)).toBe(true);

    s = engine.load(pid);
    for (const sid of s.requiredStages) {
      expect(s.stages[sid].status).toBe('passed');
      expect(s.stages[sid].completedAt).toBeTruthy();
    }

    const events = readEvents(tmpDir, pid);
    const types = events.map(e => e.eventType);
    expect(types).toContain('pipeline_created');
    expect(types).toContain('pipeline_completed');
    expect(types.filter(t => t === 'stage_completed').length).toBe(17);
  });

  it('implement proceeds without blocking on test-case-authoring (always forward)', async () => {
    const state = engine.create(L2_FULL_ROUTING);
    const pid = state.pipelineId;

    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'spec-review-gate', outcome: 'passed', artifacts: [] });

    // Complete contract path but NOT test-case-authoring
    engine.advance(pid, { stageId: 'contract', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'contract-review-gate', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'ux-acceptance-authoring', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'commercial-acceptance-authoring', outcome: 'passed', artifacts: [] });

    let s = engine.load(pid);
    // 原则：流水线永远往前走。implement 不再被 test-case-authoring 阻断。
    expect(s.stages['implement'].status).toBe('active');
    expect(s.stages['implement'].blockReason).toBeUndefined();

    // Completing test-case-authoring leaves implement active.
    engine.advance(pid, { stageId: 'test-case-authoring', outcome: 'passed', artifacts: [makeArtifact('tc')] });
    s = engine.load(pid);
    expect(s.stages['implement'].status).toBe('active');
  });

  it('review failure mid-pipeline enters fix loop, retry completes', async () => {
    const state = engine.create(L2_FULL_ROUTING);
    const pid = state.pipelineId;

    // Rush through to review
    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'spec-review-gate', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'test-case-authoring', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'ux-acceptance-authoring', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'commercial-acceptance-authoring', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'contract', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'contract-review-gate', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'implement', outcome: 'passed', artifacts: [] });

    // Review FAILS
    engine.advance(pid, {
      stageId: 'review', outcome: 'failed', artifacts: [],
      failureReason: 'Security vulnerability in auth module',
    });
    let s = engine.load(pid);
    // 原则：流水线永远往前走。失败 → fix_pending 修复循环，而非 failed 终态。
    expect(s.stages['review'].status).toBe('fix_pending');
    expect(s.stages['smoke-test'].status).toBe('pending');
    expect(engine.isComplete(pid)).toBe(false);

    // Retry review
    engine.activate(pid, 'review');
    engine.advance(pid, { stageId: 'review', outcome: 'passed', artifacts: [makeArtifact('review-v2')] });
    s = engine.load(pid);
    expect(s.stages['review'].status).toBe('passed');
    expect(s.stages['smoke-test'].status).toBe('active');
  });

  it('events journal captures all stage transitions and artifacts', async () => {
    const state = engine.create(L2_FULL_ROUTING);
    const pid = state.pipelineId;

    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [makeArtifact('spec'), makeArtifact('spec-appendix')] });

    const events = readEvents(tmpDir, pid);
    const artifactEvents = events.filter(e => e.eventType === 'artifact_registered');
    expect(artifactEvents.length).toBe(2);
    expect(artifactEvents.every(e => e.stage === 'spec')).toBe(true);

    const activatedEvents = events.filter(e => e.eventType === 'stage_activated');
    expect(activatedEvents.length).toBeGreaterThanOrEqual(2);
  });
});
