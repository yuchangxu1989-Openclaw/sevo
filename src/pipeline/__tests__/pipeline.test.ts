import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { PipelineEngine } from '../pipeline-engine.js';
import {
  BlockingLevel,
  ClarificationCoordinator,
  ClarificationType,
  ResolutionSink,
  type ClarificationHandle,
  type ClarificationPayload,
  type ClarificationResponse,
  type ClarificationTarget,
  type HostClarificationAdapter,
} from '../../clarification/index.js';
import {
  isValidTransition,
  assertTransition,
  isTerminal,
  canActivate,
} from '../stage-machine.js';
import {
  getPrerequisites,
  shouldBlockImplement,
  getActivatableStages,
} from '../parallel-branch.js';

import type {
  ArtifactRef,
  RoutingResult,
  StageResult,
  PipelineState,
  StageId,
  StageRecord,
} from '../../types/index.js';

// ─── Stage Machine unit tests ───

describe('stage-machine', () => {
  it('allows pending → active', async () => {
    expect(isValidTransition('pending', 'active')).toBe(true);
  });

  it('allows pending → skipped', async () => {
    expect(isValidTransition('pending', 'skipped')).toBe(true);
  });

  it('allows active → passed/failed/blocked', async () => {
    expect(isValidTransition('active', 'passed')).toBe(true);
    expect(isValidTransition('active', 'failed')).toBe(true);
    expect(isValidTransition('active', 'blocked')).toBe(true);
    expect(isValidTransition('active', 'clarification-blocked')).toBe(true);
  });

  it('allows blocked → active (retry)', async () => {
    expect(isValidTransition('blocked', 'active')).toBe(true);
  });

  it('allows clarification-blocked → active', async () => {
    expect(isValidTransition('clarification-blocked', 'active')).toBe(true);
  });

  it('allows failed → active (fix & retry)', async () => {
    expect(isValidTransition('failed', 'active')).toBe(true);
  });

  it('rejects invalid transitions', async () => {
    expect(isValidTransition('passed', 'active')).toBe(false);
    expect(isValidTransition('skipped', 'active')).toBe(false);
    expect(isValidTransition('pending', 'passed')).toBe(false);
  });

  it('assertTransition throws on invalid', async () => {
    expect(() => assertTransition('passed', 'active')).toThrow('Invalid stage transition');
  });

  it('isTerminal identifies passed and skipped', async () => {
    expect(isTerminal('passed')).toBe(true);
    expect(isTerminal('skipped')).toBe(true);
    expect(isTerminal('active')).toBe(false);
    expect(isTerminal('failed')).toBe(false);
    expect(isTerminal('clarification-blocked')).toBe(false);
  });

  it('canActivate identifies pending/blocked/failed', async () => {
    expect(canActivate('pending')).toBe(true);
    expect(canActivate('blocked')).toBe(true);
    expect(canActivate('clarification-blocked')).toBe(true);
    expect(canActivate('failed')).toBe(true);
    expect(canActivate('passed')).toBe(false);
    expect(canActivate('active')).toBe(false);
  });
});

// ─── Parallel Branch unit tests ───

describe('parallel-branch', () => {
  const fullStages: StageId[] = [
    'spec', 'spec-review-gate', 'test-case-authoring',
    'ux-acceptance-authoring', 'commercial-acceptance-authoring',
    'contract', 'contract-review-gate', 'implement', 'review', 'regression',
    'publish-generalization-gate', 'deploy', 'verify', 'ledger',
  ];

  it('contract and test-case-authoring both depend on spec-review-gate', async () => {
    expect(getPrerequisites('contract', fullStages)).toEqual(['spec-review-gate']);
    expect(getPrerequisites('test-case-authoring', fullStages)).toEqual(['spec-review-gate']);
  });

  it('contract-review-gate depends only on contract', async () => {
    expect(getPrerequisites('contract-review-gate', fullStages)).toEqual(['contract']);
  });

  it('implement depends on contract-review-gate (test-case-authoring handled via blocking)', async () => {
    const deps = getPrerequisites('implement', fullStages);
    expect(deps).toContain('contract-review-gate');
    // test-case-authoring is NOT a prerequisite — it's handled via blocking logic
    expect(deps).not.toContain('test-case-authoring');
  });

  it('shouldBlockImplement returns true when test-case-authoring not passed', async () => {
    const state = makeMockState(fullStages);
    state.stages['test-case-authoring'].status = 'active';
    expect(shouldBlockImplement(state)).toBe(true);
  });

  it('shouldBlockImplement returns false when test-case-authoring passed', async () => {
    const state = makeMockState(fullStages);
    state.stages['test-case-authoring'].status = 'passed';
    expect(shouldBlockImplement(state)).toBe(false);
  });

  it('shouldBlockImplement returns false when test-case-authoring not in pipeline', async () => {
    const stages: StageId[] = ['spec', 'implement', 'review'];
    const state = makeMockState(stages);
    expect(shouldBlockImplement(state)).toBe(false);
  });

  it('ux-acceptance and pm-commercial-review both depend on smoke-test', async () => {
    const stagesWithSmoke: StageId[] = [
      'spec', 'spec-review-gate', 'contract', 'contract-review-gate',
      'implement', 'review', 'smoke-test', 'ux-acceptance',
      'pm-commercial-review', 'regression', 'publish-generalization-gate',
      'deploy', 'verify', 'ledger',
    ];
    expect(getPrerequisites('ux-acceptance', stagesWithSmoke)).toEqual(['smoke-test']);
    expect(getPrerequisites('pm-commercial-review', stagesWithSmoke)).toEqual(['smoke-test']);
  });

  it('regression requires both ux-acceptance and pm-commercial-review (parallel join)', async () => {
    const stagesWithBoth: StageId[] = [
      'spec', 'spec-review-gate', 'contract', 'contract-review-gate',
      'implement', 'review', 'smoke-test', 'ux-acceptance',
      'pm-commercial-review', 'regression', 'publish-generalization-gate',
      'deploy', 'verify', 'ledger',
    ];
    const deps = getPrerequisites('regression', stagesWithBoth);
    expect(deps).toContain('ux-acceptance');
    expect(deps).toContain('pm-commercial-review');
    expect(deps).toHaveLength(2);
  });

  it('regression with only ux-acceptance in pipeline depends on ux-acceptance alone', async () => {
    const stagesPartial: StageId[] = [
      'spec', 'implement', 'review', 'smoke-test',
      'ux-acceptance', 'regression', 'deploy', 'ledger',
    ];
    expect(getPrerequisites('regression', stagesPartial)).toEqual(['ux-acceptance']);
  });
});

// ─── Pipeline Engine integration tests ───

describe('PipelineEngine', () => {
  let tmpDir: string;
  let engine: PipelineEngine;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-test-'));
    engine = new PipelineEngine(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const l2Routing: RoutingResult = {
    taskId: 'task-001',
    level: 'L2+',
    requiredStages: [
      'spec', 'spec-review-gate', 'test-case-authoring',
      'ux-acceptance-authoring', 'commercial-acceptance-authoring',
      'contract', 'contract-review-gate', 'implement', 'review', 'regression',
      'publish-generalization-gate', 'deploy', 'verify', 'ledger',
    ],
    matchedRules: ['new-module'],
      needsUxDesign: false, uxDesignReason: '', needsArchDesign: false, archDesignReason: '',
  };

  it('creates a pipeline and activates the first stage', async () => {
    const state = engine.create(l2Routing);
    expect(state.pipelineId).toBeTruthy();
    expect(state.taskId).toBe('task-001');
    expect(state.stages['spec'].status).toBe('active');
    // All others should be pending
    expect(state.stages['contract'].status).toBe('pending');
  });

  it('persists state.json and events.jsonl', async () => {
    const state = engine.create(l2Routing);
    const stateFile = path.join(tmpDir, 'pipelines', state.pipelineId, 'state.json');
    const eventsFile = path.join(tmpDir, 'pipelines', state.pipelineId, 'events.jsonl');
    expect(fs.existsSync(stateFile)).toBe(true);
    expect(fs.existsSync(eventsFile)).toBe(true);
  });

  it('advances through spec → spec-review-gate', async () => {
    const state = engine.create(l2Routing);
    const pid = state.pipelineId;

    // Complete spec
    const t1 = engine.advance(pid, {
      stageId: 'spec',
      outcome: 'passed',
      artifacts: [{ id: 'spec-pkg-1', type: 'spec-package', path: 'artifacts/spec/', createdAt: new Date().toISOString() }],
    });

    expect(t1.fromStage).toBe('spec');
    // spec-review-gate should now be active
    const reloaded = engine.load(pid);
    expect(reloaded.stages['spec'].status).toBe('passed');
    expect(reloaded.stages['spec-review-gate'].status).toBe('active');
  });

  it('activates parallel branches after spec-review-gate passes', async () => {
    const state = engine.create(l2Routing);
    const pid = state.pipelineId;

    // Pass spec
    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [] });
    // Pass spec-review-gate
    engine.advance(pid, { stageId: 'spec-review-gate', outcome: 'passed', artifacts: [] });

    const reloaded = engine.load(pid);
    // contract, test-case-authoring, ux-acceptance-authoring, commercial-acceptance-authoring should be active (parallel)
    expect(reloaded.stages['contract'].status).toBe('active');
    expect(reloaded.stages['test-case-authoring'].status).toBe('active');
    expect(reloaded.stages['ux-acceptance-authoring'].status).toBe('active');
    expect(reloaded.stages['commercial-acceptance-authoring'].status).toBe('active');
  });

  it('does not block implement even when test-case-authoring not done (pipeline always moves forward)', async () => {
    const state = engine.create(l2Routing);
    const pid = state.pipelineId;

    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'spec-review-gate', outcome: 'passed', artifacts: [] });
    // Complete contract but NOT test-case-authoring
    engine.advance(pid, { stageId: 'contract', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'contract-review-gate', outcome: 'passed', artifacts: [] });

    const reloaded = engine.load(pid);
    // 原则：流水线永远往前走。implement 不再因 test-case-authoring 未完成而冻结，
    // 直接激活推进（仅发 advisory 事件）。
    expect(reloaded.stages['implement'].status).toBe('active');
    expect(reloaded.stages['implement'].blockReason).toBeUndefined();
  });

  it('activates implement directly regardless of test-case-authoring status', async () => {
    const state = engine.create(l2Routing);
    const pid = state.pipelineId;

    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'spec-review-gate', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'contract', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'contract-review-gate', outcome: 'passed', artifacts: [] });

    // implement is active (not blocked) under the always-forward principle
    let reloaded = engine.load(pid);
    expect(reloaded.stages['implement'].status).toBe('active');

    // Completing test-case-authoring leaves implement active (no unblock needed)
    engine.advance(pid, { stageId: 'test-case-authoring', outcome: 'passed', artifacts: [] });

    reloaded = engine.load(pid);
    expect(reloaded.stages['implement'].status).toBe('active');
  });

  it('regression waits for both ux-acceptance and pm-commercial-review (parallel join)', async () => {
    const fullRouting: RoutingResult = {
      taskId: 'task-parallel-join',
      level: 'L2+',
      requiredStages: [
        'spec', 'spec-review-gate', 'test-case-authoring',
        'ux-acceptance-authoring', 'commercial-acceptance-authoring',
        'contract', 'contract-review-gate', 'implement', 'review',
        'smoke-test', 'ux-acceptance', 'pm-commercial-review',
        'regression', 'publish-generalization-gate', 'deploy', 'verify', 'ledger',
      ],
      matchedRules: ['new-module'],
      needsUxDesign: false, uxDesignReason: '', needsArchDesign: false, archDesignReason: '',
    };
    const state = engine.create(fullRouting);
    const pid = state.pipelineId;

    // Advance through to smoke-test
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

    // After smoke-test, both ux-acceptance and pm-commercial-review should be active
    let s = engine.load(pid);
    expect(s.stages['ux-acceptance'].status).toBe('active');
    expect(s.stages['pm-commercial-review'].status).toBe('active');
    expect(s.stages['regression'].status).toBe('pending');

    // Complete only ux-acceptance — regression should still be pending
    engine.advance(pid, { stageId: 'ux-acceptance', outcome: 'passed', artifacts: [] });
    s = engine.load(pid);
    expect(s.stages['regression'].status).toBe('pending');

    // Complete pm-commercial-review — now regression should activate
    engine.advance(pid, { stageId: 'pm-commercial-review', outcome: 'passed', artifacts: [] });
    s = engine.load(pid);
    expect(s.stages['regression'].status).toBe('active');
  });

  it('handles stage failure and retry', async () => {
    const state = engine.create(l2Routing);
    const pid = state.pipelineId;

    // Fail spec
    engine.advance(pid, {
      stageId: 'spec',
      outcome: 'failed',
      artifacts: [],
      failureReason: 'Incomplete requirements',
    });

    let reloaded = engine.load(pid);
    // 原则：流水线永远往前走。stage 失败 → fix_pending 修复循环，而非 failed 终态。
    expect(reloaded.stages['spec'].status).toBe('fix_pending');
    expect(reloaded.stages['spec'].failureReason).toBe('Incomplete requirements');

    // Retry spec
    engine.activate(pid, 'spec');
    reloaded = engine.load(pid);
    expect(reloaded.stages['spec'].status).toBe('active');
  });

  it('L0 pipeline starts from its required stage chain', async () => {
    const l0Routing: RoutingResult = {
      taskId: 'task-l0',
      level: 'L0',
      requiredStages: ['implement', 'review', 'regression', 'ledger'],
      matchedRules: [],
      needsUxDesign: false, uxDesignReason: '', needsArchDesign: false, archDesignReason: '',
    };

    const state = engine.create(l0Routing);
    expect(state.stages['implement'].status).toBe('active');
    expect(state.stages['spec']).toBeUndefined();
  });

  it('isComplete returns true when all stages terminal', async () => {
    const simpleRouting: RoutingResult = {
      taskId: 'task-simple',
      level: 'L0',
      requiredStages: ['implement', 'review'],
      matchedRules: [],
      needsUxDesign: false, uxDesignReason: '', needsArchDesign: false, archDesignReason: '',
    };

    const state = engine.create(simpleRouting);
    const pid = state.pipelineId;

    expect(engine.isComplete(pid)).toBe(false);

    engine.advance(pid, { stageId: 'implement', outcome: 'passed', artifacts: [] });
    engine.advance(pid, { stageId: 'review', outcome: 'passed', artifacts: [] });

    expect(engine.isComplete(pid)).toBe(true);
  });

  it('events.jsonl contains expected events', async () => {
    const state = engine.create(l2Routing);
    const pid = state.pipelineId;
    engine.advance(pid, { stageId: 'spec', outcome: 'passed', artifacts: [] });

    const eventsFile = path.join(tmpDir, 'pipelines', pid, 'events.jsonl');
    const lines = fs.readFileSync(eventsFile, 'utf-8').trim().split('\n');
    const events = lines.map((l) => JSON.parse(l));

    const types = events.map((e: Record<string, unknown>) => e.eventType);
    expect(types).toContain('pipeline_created');
    expect(types).toContain('stage_activated');
    expect(types).toContain('stage_completed');
  });

  it('opens blocking clarifications and pauses the stage until resolution', async () => {
    const adapter = new FakeAdapter();
    const coordinator = makeClarificationCoordinator(adapter);
    const engineWithClarification = new PipelineEngine(tmpDir, {
      clarificationCoordinator: coordinator,
    });
    const state = engineWithClarification.create({
      taskId: 'task-clr-1',
      level: 'L1',
      requiredStages: ['spec', 'spec-review-gate'],
      matchedRules: ['user-explicit'],
      needsUxDesign: false, uxDesignReason: '', needsArchDesign: false, archDesignReason: '',
    });

    const transition = engineWithClarification.advance(state.pipelineId, {
      stageId: 'spec',
      outcome: 'passed',
      artifacts: [makeArtifact('ambiguous-spec')],
    });

    const reloaded = engineWithClarification.load(state.pipelineId);
    expect(transition.status).toBe('clarification-blocked');
    expect(transition.toStage).toBe('spec');
    expect(reloaded.stages['spec'].status).toBe('clarification-blocked');
    expect(reloaded.stages['spec-review-gate'].status).toBe('pending');
    expect(reloaded.stages['spec'].clarificationSummary).toEqual({
      open: 1,
      resolved: 0,
      settled: 0,
      blockingOpen: 1,
    });
    expect(reloaded.stages['spec'].clarificationRefs?.map((ref) => ref.id)).toContain('clr-1');
    expect(adapter.dispatched).toHaveLength(1);
  });

  it('resolves blocking clarifications and resumes the stage', async () => {
    const adapter = new FakeAdapter();
    const coordinator = makeClarificationCoordinator(adapter);
    const engineWithClarification = new PipelineEngine(tmpDir, {
      clarificationCoordinator: coordinator,
    });
    const state = engineWithClarification.create({
      taskId: 'task-clr-2',
      level: 'L1',
      requiredStages: ['spec', 'spec-review-gate'],
      matchedRules: ['user-explicit'],
      needsUxDesign: false, uxDesignReason: '', needsArchDesign: false, archDesignReason: '',
    });

    engineWithClarification.advance(state.pipelineId, {
      stageId: 'spec',
      outcome: 'passed',
      artifacts: [makeArtifact('ambiguous-spec')],
    });

    adapter.emitResponse({
      clarificationId: 'clr-1',
      responderId: 'user-1',
      content: '补上验收标准。',
      receivedAt: '2026-04-20T10:01:00.000Z',
    });

    const resume = engineWithClarification.resolveClarification(state.pipelineId, 'clr-1');
    const reloaded = engineWithClarification.load(state.pipelineId);
    const eventsFile = path.join(tmpDir, 'pipelines', state.pipelineId, 'events.jsonl');
    const eventTypes = fs.readFileSync(eventsFile, 'utf-8').trim().split('\n').map((line) => JSON.parse(line).eventType);

    expect(resume.status).toBe('active');
    expect(resume.toStage).toBe('spec');
    expect(reloaded.stages['spec'].status).toBe('active');
    expect(eventTypes).toContain('clarification_resolved');
    expect(eventTypes).toContain('clarification_settled');
    expect(reloaded.stages['spec'].clarificationSummary).toEqual({
      open: 0,
      resolved: 0,
      settled: 1,
      blockingOpen: 0,
    });
    expect(reloaded.stages['spec'].clarificationRefs?.map((ref) => ref.id)).toEqual(
      expect.arrayContaining(['clr-1', 'settled-clr-1']),
    );
  });
});

class FakeAdapter implements HostClarificationAdapter {
  private responseCb?: (response: ClarificationResponse) => void;
  readonly dispatched: Array<{ target: ClarificationTarget; payload: ClarificationPayload }> = [];

  requestClarification(target: ClarificationTarget, payload: ClarificationPayload): ClarificationHandle {
    this.dispatched.push({ target, payload });
    return {
      clarificationId: payload.clarificationId,
      targetType: target.type,
      targetId: target.id,
      dispatchedAt: '2026-04-20T10:00:00.000Z',
      timeoutMs: 5000,
    };
  }

  onClarificationResponse(callback: (response: ClarificationResponse) => void): void {
    this.responseCb = callback;
  }

  onClarificationTimeout(_callback: (handle: ClarificationHandle) => void): void {
    // not used in this test suite
  }

  emitResponse(response: ClarificationResponse): void {
    this.responseCb?.(response);
  }
}

function makeArtifact(id: string): ArtifactRef {
  return {
    id,
    type: 'doc',
    path: `/artifacts/${id}.md`,
    createdAt: '2026-04-20T10:00:00.000Z',
  };
}

function makeClarificationCoordinator(adapter: FakeAdapter): ClarificationCoordinator {
  return new ClarificationCoordinator({
    adapter,
    rules: [{
      id: 'ambiguous-spec',
      evaluate(stageRecord, artifacts) {
        if (stageRecord.stageId !== 'spec') return [];
        if (!artifacts.some((artifact) => artifact.id === 'ambiguous-spec')) return [];
        return [{
          pipelineId: 'placeholder',
          stageId: 'spec',
          stageAttempt: stageRecord.attempt,
          type: ClarificationType.BOUNDARY,
          blockingLevel: BlockingLevel.BLOCKING,
          targetType: 'user' as const,
          question: '缺少验收标准。',
          sourceArtifacts: artifacts,
          impactScope: ['FR-11'],
          resolutionSinks: [ResolutionSink.SPEC_PACKAGE],
        }];
      },
    }],
    getStageRecord: () => ({
      stageId: 'spec',
      status: 'active',
      attempt: 1,
      artifacts: [],
    }),
    applyResolution: (record) => [makeArtifact(`settled-${record.clarificationId}`)],
    now: () => '2026-04-20T10:00:00.000Z',
    createId: () => 'clr-1',
  });
}

// ─── Helpers ───

function makeMockState(requiredStages: StageId[]): PipelineState {
  const stages = {} as Record<StageId, StageRecord>;
  for (const sid of requiredStages) {
    stages[sid] = {
      stageId: sid,
      status: 'pending',
      artifacts: [],
    };
  }
  return {
    pipelineId: 'mock-pipeline',
    taskId: 'mock-task',
    level: 'L2+',
    requiredStages,
    stages,
    currentStage: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
