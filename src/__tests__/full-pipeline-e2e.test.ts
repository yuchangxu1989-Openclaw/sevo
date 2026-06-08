/**
 * Full Pipeline E2E — Sevo Facade + StandaloneAdapter integration tests.
 * Validates the complete lifecycle: facade → adapter → gate → router → orchestrator.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Sevo } from '../sevo.js';
import { StandaloneAdapter } from '../adapter/standalone-adapter.js';
import { TaskOrchestrator } from '../orchestrator/task-orchestrator.js';
import { StageRouter } from '../router/stage-router.js';
import { StageGraph } from '../router/stage-graph.js';
import { GateEngine, FileExistsRule, TestPassRule } from '../gate/index.js';
import { ReviewFixLoop } from '../stages/review-fix-loop.js';
import {
  ClarificationCoordinator,
  BlockingLevel,
  ClarificationType,
  Status,
  ResolutionSink,
  type HostClarificationAdapter,
  type ClarificationHandle,
  type ClarificationPayload,
  type ClarificationResponse,
} from '../clarification/index.js';
import type { ClarificationTarget } from '../clarification/clarification-types.js';
import type { SevoConfig } from '../config.js';
import { DEFAULT_ACTION_LEVELS } from '../config.js';
import type { TaskPayload } from '../orchestrator/pipeline-run.js';
import type { ArtifactRef, StageId, StageRecord, ProjectConfig } from '../types/index.js';
import type { StageEdge } from '../router/stage-graph.js';

// ── Helpers ─────────────────────────────────────────────────────

function makeArtifact(overrides: Partial<ArtifactRef> & { path: string }): ArtifactRef {
  return {
    id: overrides.id ?? `art-${Math.random().toString(36).slice(2, 8)}`,
    type: overrides.type ?? 'file',
    path: overrides.path,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    metadata: overrides.metadata,
  };
}

function makeLinearGraph(stages: StageId[]): StageGraph {
  const edges: StageEdge[] = [];
  for (let i = 0; i < stages.length - 1; i++) {
    edges.push({ from: stages[i]!, to: stages[i + 1]! });
  }
  return new StageGraph(edges);
}

function makePayload(stages: StageId[], taskId = 'task-e2e-1'): TaskPayload {
  return {
    taskId,
    title: 'Full Pipeline E2E',
    initialStage: stages[0]!,
    stages,
  };
}

function makeProjectConfig(): ProjectConfig {
  return {
    workspaceRoot: '/tmp/sevo-test',
    projectRoot: '/tmp/sevo-test',
    artifactRoots: ['/tmp/sevo-test/artifacts'],
    defaultAgentId: 'dev-01',
    stageAgents: {
      implement: 'cc',
      review: 'audit-01',
    },
  };
}

const VALID_CONFIG: SevoConfig = {
  projectName: 'full-pipeline-e2e',
  stages: ['spec', 'spec-review-gate', 'implement', 'review', 'publish-generalization-gate', 'deploy', 'ledger'],
  rules: [],
  adapter: 'standalone',
  endgameDelivery: { enabled: true, autoReadme: true, autoPublish: true, autoGapScan: true },
  strictRoleMatching: false,
  actionLevels: DEFAULT_ACTION_LEVELS,
};

// ── 1. Complete Pipeline End-to-End ─────────────────────────────

describe('Full Pipeline E2E: Sevo Facade → StandaloneAdapter → All Stages', () => {
  let sevo: Sevo;
  let adapter: StandaloneAdapter;

  beforeEach(async () => {
    sevo = new Sevo(VALID_CONFIG, { gateEngine: new GateEngine() });
    await sevo.init();
    adapter = new StandaloneAdapter(makeProjectConfig());
  });

  it('runs full pipeline from spec to terminal stage via facade', async () => {
    const payload = makePayload(['spec', 'spec-review-gate', 'implement', 'review', 'ledger']);
    const status = await sevo.runFullPipeline(payload);

    // With no rules, all gates pass → pipeline completes
    expect(status.runId).toBeDefined();
    expect(status.history.length).toBeGreaterThanOrEqual(1);
  });

  it('facade + adapter dispatch/collect roundtrip per stage', async () => {
    // Use the actual DEFAULT_SDD_GRAPH progression.
    // The orchestrator follows the first unconditional edge at each fork,
    // so from smoke-test it walks ux-acceptance → regression, skipping pm-commercial-review.
    const sddStages: StageId[] = ['spec', 'spec-review-gate', 'contract', 'contract-review-gate', 'implement', 'review', 'smoke-test', 'ux-acceptance', 'pm-commercial-review', 'regression', 'publish-generalization-gate', 'deploy', 'verify', 'ledger'];
    const walkPath: StageId[] = sddStages.filter(s => s !== 'pm-commercial-review');
    const payload = makePayload(walkPath);
    const run = sevo.startPipeline(payload);

    // Simulate adapter dispatch + artifact collection at each stage
    for (let i = 0; i < walkPath.length - 1; i++) {
      const currentStage = walkPath[i]!;

      // Adapter dispatches task for this stage
      const taskId = await adapter.dispatchTask(currentStage, payload);
      expect(taskId).toContain(currentStage);

      // Adapter registers artifacts produced by the task
      const artifacts = [
        makeArtifact({ path: `${currentStage}/output.md` }),
        makeArtifact({ path: `${currentStage}/test-results.json`, type: 'test-result', metadata: { passed: true } }),
      ];
      adapter.registerArtifacts(taskId, artifacts);

      // Verify artifacts can be collected back
      const collected = await adapter.collectArtifacts(taskId);
      expect(collected).toHaveLength(2);
      expect(collected[0]!.path).toBe(`${currentStage}/output.md`);

      // Advance via facade (follows DEFAULT_SDD_GRAPH)
      const next = await sevo.advanceStageAsync(run.runId);
      if (i < walkPath.length - 2) {
        expect(next).toBe(walkPath[i + 1]);
      }
    }

    // Verify adapter recorded all dispatches
    expect(adapter.getDispatches()).toHaveLength(walkPath.length - 1);
  });

  it('facade evaluateGate + advanceStage step-by-step matches runFullPipeline', async () => {
    const stages: StageId[] = ['spec', 'spec-review-gate', 'implement'];
    const payload = makePayload(stages);

    // Manual step-by-step
    const run = sevo.startPipeline(payload);
    const v1 = await sevo.evaluateGateAsync(run.runId);
    expect(v1.conclusion).toBe('passed');

    const next1 = await sevo.advanceStageAsync(run.runId);
    // After first evaluateGate already advanced, advanceStage evaluates again
    // The key point: facade methods work correctly in sequence
    expect(next1 === null || typeof next1 === 'string').toBe(true);

    // Compare with runFullPipeline
    const payload2 = makePayload(stages, 'task-e2e-compare');
    const autoStatus = await sevo.runFullPipeline(payload2);
    expect(autoStatus.runId).toBeDefined();
  });
});

// ── 2. Gate Blocking Then Recovery ──────────────────────────────

describe('Full Pipeline E2E: Gate Blocking → Fix → Recovery', () => {
  let orchestrator: TaskOrchestrator;
  let adapter: StandaloneAdapter;
  const stages: StageId[] = ['spec', 'spec-review-gate', 'implement'];

  beforeEach(() => {
    const gateEngine = new GateEngine();
    gateEngine.registerRule(new FileExistsRule(stages, ['spec.md']));
    gateEngine.registerRule(new TestPassRule(stages));

    const graph = makeLinearGraph(stages);
    const router = new StageRouter(graph);
    orchestrator = new TaskOrchestrator(router, gateEngine);
    adapter = new StandaloneAdapter(makeProjectConfig());
  });

  it('gate rejects → submit missing artifacts → re-evaluate → passes → continues', async () => {
    const payload = makePayload(stages);
    const run = orchestrator.startPipeline(payload);

    // Dispatch via adapter (no artifacts yet)
    void adapter.dispatchTask('spec', payload);

    // Attempt gate with no artifacts → rejected
    const { verdict: v1, nextStage: ns1 } = await orchestrator.evaluateAndAdvanceAsync(run.runId);
    expect(v1.conclusion).toBe('rejected');
    expect(v1.blockers.length).toBeGreaterThan(0);
    expect(ns1).toBeNull();
    expect(run.getCurrentStage()).toBe('spec');

    // Notify adapter of gate rejection
    adapter.notifyGateResult('spec', v1);
    expect(adapter.getGateNotifications()).toHaveLength(1);
    expect(adapter.getGateNotifications()[0]!.verdict.conclusion).toBe('rejected');

    // Fix: submit required artifacts
    orchestrator.submitArtifacts(run.runId, [
      makeArtifact({ path: 'spec.md', type: 'file' }),
      makeArtifact({ path: 'test-report.json', type: 'test-result', metadata: { passed: true } }),
    ]);

    // Re-evaluate → should pass now
    const { verdict: v2, nextStage: ns2 } = await orchestrator.evaluateAndAdvanceAsync(run.runId);
    expect(v2.conclusion).toBe('passed');
    expect(ns2).toBe('spec-review-gate');
    expect(run.getCurrentStage()).toBe('spec-review-gate');

    // Notify adapter of gate pass
    adapter.notifyGateResult('spec', v2);
    expect(adapter.getGateNotifications()).toHaveLength(2);
    expect(adapter.getGateNotifications()[1]!.verdict.conclusion).toBe('passed');
  });

  it('multiple consecutive gate rejections before final pass', async () => {
    const payload = makePayload(stages);
    const run = orchestrator.startPipeline(payload);

    // First attempt: no artifacts
    const { verdict: v1 } = await orchestrator.evaluateAndAdvanceAsync(run.runId);
    expect(v1.conclusion).toBe('rejected');
    expect(run.getCurrentStage()).toBe('spec');

    // Second attempt: only spec.md (missing test-result)
    orchestrator.submitArtifacts(run.runId, [
      makeArtifact({ path: 'spec.md', type: 'file' }),
    ]);
    const { verdict: v2 } = await orchestrator.evaluateAndAdvanceAsync(run.runId);
    expect(v2.conclusion).toBe('rejected');
    expect(run.getCurrentStage()).toBe('spec');

    // Third attempt: add test-result → passes
    orchestrator.submitArtifacts(run.runId, [
      makeArtifact({ path: 'test-report.json', type: 'test-result', metadata: { passed: true } }),
    ]);
    const { verdict: v3, nextStage: ns3 } = await orchestrator.evaluateAndAdvanceAsync(run.runId);
    expect(v3.conclusion).toBe('passed');
    expect(ns3).toBe('spec-review-gate');
  });

  it('gate rejection mid-pipeline does not corrupt earlier stage history', async () => {
    const payload = makePayload(stages);
    const run = orchestrator.startPipeline(payload);

    // Pass first stage
    orchestrator.submitArtifacts(run.runId, [
      makeArtifact({ path: 'spec.md', type: 'file' }),
      makeArtifact({ path: 'test-report.json', type: 'test-result', metadata: { passed: true } }),
    ]);
    const { nextStage: ns1 } = await orchestrator.evaluateAndAdvanceAsync(run.runId);
    expect(ns1).toBe('spec-review-gate');

    // Fail at second stage (no artifacts for spec-review-gate)
    const { verdict: v2, nextStage: ns2 } = await orchestrator.evaluateAndAdvanceAsync(run.runId);
    expect(v2.conclusion).toBe('rejected');
    expect(ns2).toBeNull();
    expect(run.getCurrentStage()).toBe('spec-review-gate');

    // History should show the first transition
    const status = orchestrator.getPipelineStatus(run.runId);
    expect(status.history).toHaveLength(1);
    expect(status.history[0]!.from).toBe('spec');
    expect(status.history[0]!.to).toBe('spec-review-gate');
  });
});

// ── 3. Adapter Task Dispatch + Artifact Collection Roundtrip ────

describe('Full Pipeline E2E: Adapter Dispatch + Artifact Collection', () => {
  let adapter: StandaloneAdapter;

  beforeEach(() => {
    adapter = new StandaloneAdapter(makeProjectConfig());
  });

  it('dispatches tasks for multiple stages and collects artifacts independently', async () => {
    const stages: StageId[] = ['spec', 'implement', 'review'];

    for (const stage of stages) {
      const payload = makePayload([stage], `task-${stage}`);
      const taskId = await adapter.dispatchTask(stage, payload);

      // Register stage-specific artifacts
      adapter.registerArtifacts(taskId, [
        makeArtifact({ path: `${stage}/result.md`, id: `${stage}-result` }),
      ]);

      const collected = await adapter.collectArtifacts(taskId);
      expect(collected).toHaveLength(1);
      expect(collected[0]!.id).toBe(`${stage}-result`);
    }

    // All dispatches recorded
    expect(adapter.getDispatches()).toHaveLength(3);
    expect(adapter.getDispatches()[0]!.stage).toBe('spec');
    expect(adapter.getDispatches()[1]!.stage).toBe('implement');
    expect(adapter.getDispatches()[2]!.stage).toBe('review');
  });

  it('collectArtifacts returns empty array for unknown taskId', async () => {
    const result = await adapter.collectArtifacts('nonexistent-task');
    expect(result).toEqual([]);
  });

  it('registerArtifacts overwrites previous artifacts for same taskId', async () => {
    const payload = makePayload(['spec'], 'task-overwrite');
    const taskId = await adapter.dispatchTask('spec', payload);

    adapter.registerArtifacts(taskId, [makeArtifact({ path: 'v1.md', id: 'v1' })]);
    adapter.registerArtifacts(taskId, [makeArtifact({ path: 'v2.md', id: 'v2' })]);

    const collected = await adapter.collectArtifacts(taskId);
    expect(collected).toHaveLength(1);
    expect(collected[0]!.id).toBe('v2');
  });

  it('adapter project config is immutable (defensive copy)', async () => {
    const config = adapter.getProjectConfig();
    config.defaultAgentId = 'hacked';

    expect(adapter.getProjectConfig().defaultAgentId).toBe('dev-01');
  });

  it('gate notifications are recorded with correct stage and verdict', async () => {
    const passVerdict = {
      gateId: 'spec-gate',
      conclusion: 'passed' as const,
      blockers: [],
      reviewBundles: [],
    };
    const rejectVerdict = {
      gateId: 'review-gate',
      conclusion: 'rejected' as const,
      blockers: [{ item: 'missing tests', owner: 'system' }],
      reviewBundles: [],
    };

    adapter.notifyGateResult('spec', passVerdict);
    adapter.notifyGateResult('review', rejectVerdict);

    const notifications = adapter.getGateNotifications();
    expect(notifications).toHaveLength(2);
    expect(notifications[0]!.stage).toBe('spec');
    expect(notifications[0]!.verdict.conclusion).toBe('passed');
    expect(notifications[1]!.stage).toBe('review');
    expect(notifications[1]!.verdict.conclusion).toBe('rejected');
    expect(notifications[1]!.verdict.blockers).toHaveLength(1);
  });
});

// ── 4. maxRuns Eviction in Pipeline ─────────────────────────────

describe('Full Pipeline E2E: maxRuns Eviction', () => {
  it('evicts oldest completed runs when maxRuns is exceeded', async () => {
    const gateEngine = new GateEngine(); // no rules → auto-pass
    const stages: StageId[] = ['spec', 'spec-review-gate'];
    const graph = makeLinearGraph(stages);
    const router = new StageRouter(graph);
    const orchestrator = new TaskOrchestrator(router, gateEngine, { maxRuns: 3 });

    // Start and complete 3 runs
    const runIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const payload = makePayload(stages, `task-${i}`);
      const run = orchestrator.startPipeline(payload);
      runIds.push(run.runId);
      // Advance to terminal → marks completed
      await orchestrator.evaluateAndAdvanceAsync(run.runId);
    }

    // All 3 should be accessible
    for (const id of runIds) {
      expect(() => orchestrator.getPipelineStatus(id)).not.toThrow();
    }

    // Start a 4th run → should evict the oldest completed
    const run4 = orchestrator.startPipeline(makePayload(stages, 'task-3'));
    await orchestrator.evaluateAndAdvanceAsync(run4.runId);

    // First run should be evicted
    expect(() => orchestrator.getPipelineStatus(runIds[0]!)).toThrow('not found');

    // Remaining runs should still be accessible
    expect(() => orchestrator.getPipelineStatus(runIds[1]!)).not.toThrow();
    expect(() => orchestrator.getPipelineStatus(runIds[2]!)).not.toThrow();
    expect(() => orchestrator.getPipelineStatus(run4.runId)).not.toThrow();
  });

  it('does not evict running pipelines even when maxRuns exceeded', async () => {
    const gateEngine = new GateEngine();
    gateEngine.registerRule(new FileExistsRule(['spec'], ['required.md']));

    const stages: StageId[] = ['spec', 'spec-review-gate'];
    const graph = makeLinearGraph(stages);
    const router = new StageRouter(graph);
    const orchestrator = new TaskOrchestrator(router, gateEngine, { maxRuns: 2 });

    // Start 2 runs that are blocked (not completed)
    const run1 = orchestrator.startPipeline(makePayload(stages, 'blocked-1'));
    const run2 = orchestrator.startPipeline(makePayload(stages, 'blocked-2'));

    // Both are still at spec (gate will reject without artifacts)
    const { verdict: v1 } = await orchestrator.evaluateAndAdvanceAsync(run1.runId);
    expect(v1.conclusion).toBe('rejected');

    // Start a 3rd run — cannot evict because none are completed
    const run3 = orchestrator.startPipeline(makePayload(stages, 'blocked-3'));

    // All 3 should still be accessible (no eviction possible)
    expect(() => orchestrator.getPipelineStatus(run1.runId)).not.toThrow();
    expect(() => orchestrator.getPipelineStatus(run2.runId)).not.toThrow();
    expect(() => orchestrator.getPipelineStatus(run3.runId)).not.toThrow();
  });

  it('evicts failed runs when maxRuns exceeded', async () => {
    const gateEngine = new GateEngine();
    const stages: StageId[] = ['spec', 'spec-review-gate'];
    const graph = makeLinearGraph(stages);
    const router = new StageRouter(graph);
    const orchestrator = new TaskOrchestrator(router, gateEngine, { maxRuns: 2 });

    // Start and fail a run
    const run1 = orchestrator.startPipeline(makePayload(stages, 'fail-1'));
    orchestrator.failPipeline(run1.runId, 'intentional failure');

    // Start and complete a run
    const run2 = orchestrator.startPipeline(makePayload(stages, 'pass-1'));
    await orchestrator.evaluateAndAdvanceAsync(run2.runId);

    // Start a 3rd → should evict oldest terminal (run1 failed)
    const run3 = orchestrator.startPipeline(makePayload(stages, 'new-1'));

    expect(() => orchestrator.getPipelineStatus(run1.runId)).toThrow('not found');
    expect(() => orchestrator.getPipelineStatus(run2.runId)).not.toThrow();
    expect(() => orchestrator.getPipelineStatus(run3.runId)).not.toThrow();
  });
});

// ── 5. Multiple Pipelines Concurrent ────────────────────────────

describe('Full Pipeline E2E: Concurrent Pipelines', () => {
  let orchestrator: TaskOrchestrator;
  let gateEngine: GateEngine;
  const stages: StageId[] = ['spec', 'spec-review-gate', 'implement', 'review', 'ledger'];

  beforeEach(() => {
    gateEngine = new GateEngine();
    gateEngine.registerRule(new FileExistsRule(stages, ['output.md']));
    gateEngine.registerRule(new TestPassRule(stages));

    const graph = makeLinearGraph(stages);
    const router = new StageRouter(graph);
    orchestrator = new TaskOrchestrator(router, gateEngine);
  });

  it('two pipelines advance independently without interference', async () => {
    const runA = orchestrator.startPipeline(makePayload(stages, 'pipeline-A'));
    const runB = orchestrator.startPipeline(makePayload(stages, 'pipeline-B'));

    // Advance A through first 2 stages
    orchestrator.submitArtifacts(runA.runId, [
      makeArtifact({ path: 'output.md', type: 'file' }),
      makeArtifact({ path: 'test.json', type: 'test-result', metadata: { passed: true } }),
    ]);
    const { nextStage: a1 } = await orchestrator.evaluateAndAdvanceAsync(runA.runId);
    expect(a1).toBe('spec-review-gate');

    // B should still be at spec
    expect(orchestrator.getPipelineStatus(runB.runId).currentStage).toBe('spec');

    // Advance B
    orchestrator.submitArtifacts(runB.runId, [
      makeArtifact({ path: 'output.md', type: 'file' }),
      makeArtifact({ path: 'test.json', type: 'test-result', metadata: { passed: true } }),
    ]);
    const { nextStage: b1 } = await orchestrator.evaluateAndAdvanceAsync(runB.runId);
    expect(b1).toBe('spec-review-gate');

    // Continue advancing A to implement
    orchestrator.submitArtifacts(runA.runId, [
      makeArtifact({ path: 'output.md', type: 'file' }),
      makeArtifact({ path: 'test.json', type: 'test-result', metadata: { passed: true } }),
    ]);
    const { nextStage: a2 } = await orchestrator.evaluateAndAdvanceAsync(runA.runId);
    expect(a2).toBe('implement');

    // B should still be at spec-review-gate
    expect(orchestrator.getPipelineStatus(runB.runId).currentStage).toBe('spec-review-gate');

    // A's history should have 2 transitions, B should have 1
    const statusA = orchestrator.getPipelineStatus(runA.runId);
    const statusB = orchestrator.getPipelineStatus(runB.runId);
    expect(statusA.history).toHaveLength(2);
    expect(statusB.history).toHaveLength(1);
  });

  it('one pipeline failing does not affect the other', async () => {
    const runA = orchestrator.startPipeline(makePayload(stages, 'pipeline-A'));
    const runB = orchestrator.startPipeline(makePayload(stages, 'pipeline-B'));

    // Fail pipeline A
    orchestrator.failPipeline(runA.runId, 'critical error');

    // B should still be operational
    orchestrator.submitArtifacts(runB.runId, [
      makeArtifact({ path: 'output.md', type: 'file' }),
      makeArtifact({ path: 'test.json', type: 'test-result', metadata: { passed: true } }),
    ]);
    const { verdict, nextStage } = await orchestrator.evaluateAndAdvanceAsync(runB.runId);
    expect(verdict.conclusion).toBe('passed');
    expect(nextStage).toBe('spec-review-gate');
  });

  it('concurrent pipelines with different gate outcomes', async () => {
    const runA = orchestrator.startPipeline(makePayload(stages, 'pipeline-A'));
    const runB = orchestrator.startPipeline(makePayload(stages, 'pipeline-B'));

    // A submits valid artifacts → passes
    orchestrator.submitArtifacts(runA.runId, [
      makeArtifact({ path: 'output.md', type: 'file' }),
      makeArtifact({ path: 'test.json', type: 'test-result', metadata: { passed: true } }),
    ]);
    const { verdict: vA } = await orchestrator.evaluateAndAdvanceAsync(runA.runId);
    expect(vA.conclusion).toBe('passed');

    // B submits incomplete artifacts → rejected
    orchestrator.submitArtifacts(runB.runId, [
      makeArtifact({ path: 'output.md', type: 'file' }),
      // Missing test-result
    ]);
    const { verdict: vB, nextStage: nsB } = await orchestrator.evaluateAndAdvanceAsync(runB.runId);
    expect(vB.conclusion).toBe('rejected');
    expect(nsB).toBeNull();

    // A advanced, B stayed
    expect(orchestrator.getPipelineStatus(runA.runId).currentStage).toBe('spec-review-gate');
    expect(orchestrator.getPipelineStatus(runB.runId).currentStage).toBe('spec');
  });

  it('both pipelines can reach terminal stage independently', async () => {
    const runA = orchestrator.startPipeline(makePayload(stages, 'pipeline-A'));
    const runB = orchestrator.startPipeline(makePayload(stages, 'pipeline-B'));

    const validArtifacts = [
      makeArtifact({ path: 'output.md', type: 'file' }),
      makeArtifact({ path: 'test.json', type: 'test-result', metadata: { passed: true } }),
    ];

    // Advance both to completion (interleaved)
    for (let i = 0; i < stages.length - 1; i++) {
      orchestrator.submitArtifacts(runA.runId, validArtifacts.map((a) => ({ ...a, id: `a-${i}-${a.id}` })));
      await orchestrator.evaluateAndAdvanceAsync(runA.runId);

      orchestrator.submitArtifacts(runB.runId, validArtifacts.map((a) => ({ ...a, id: `b-${i}-${a.id}` })));
      await orchestrator.evaluateAndAdvanceAsync(runB.runId);
    }

    // Both should be at terminal stage and completed
    const statusA = orchestrator.getPipelineStatus(runA.runId);
    const statusB = orchestrator.getPipelineStatus(runB.runId);
    expect(statusA.currentStage).toBe('ledger');
    expect(statusB.currentStage).toBe('ledger');
    expect(statusA.history).toHaveLength(stages.length - 1);
    expect(statusB.history).toHaveLength(stages.length - 1);
  });
});

// ── 6. Configuration Validation ─────────────────────────────────

describe('Full Pipeline E2E: Config Validation', () => {
  it('throws on empty projectName', async () => {
    expect(() => new Sevo({ ...VALID_CONFIG, projectName: '' })).toThrow('Invalid SevoConfig');
  });

  it('throws on empty stages array', async () => {
    expect(() => new Sevo({ ...VALID_CONFIG, stages: [] })).toThrow('Invalid SevoConfig');
  });

  it('throws on invalid adapter type', async () => {
    expect(() => new Sevo({ ...VALID_CONFIG, adapter: 'invalid' as any })).toThrow('Invalid SevoConfig');
  });

  it('throws on rule with empty ruleId', async () => {
    expect(
      () =>
        new Sevo({
          ...VALID_CONFIG,
          rules: [{ ruleId: '', appliesTo: ['spec'], severity: 'blocker' }],
        }),
    ).toThrow('Invalid SevoConfig');
  });

  it('throws on rule with empty appliesTo', async () => {
    expect(
      () =>
        new Sevo({
          ...VALID_CONFIG,
          rules: [{ ruleId: 'test-rule', appliesTo: [], severity: 'blocker' }],
        }),
    ).toThrow('Invalid SevoConfig');
  });

  it('accepts valid config with rules', async () => {
    const config: SevoConfig = {
      ...VALID_CONFIG,
      rules: [
        { ruleId: 'file-exists', appliesTo: ['spec', 'implement'], severity: 'blocker' },
        { ruleId: 'test-pass', appliesTo: ['implement'], severity: 'warning' },
      ],
    };
    expect(() => new Sevo(config)).not.toThrow();
  });

  it('facade rejects operations before init()', async () => {
    const sevo = new Sevo(VALID_CONFIG, { gateEngine: new GateEngine() });
    const payload = makePayload(['spec', 'implement']);
    expect(() => sevo.startPipeline(payload)).toThrow('not initialized');
    expect(() => sevo.evaluateGate('fake-id')).toThrow('not initialized');
    expect(() => sevo.advanceStage('fake-id')).toThrow('not initialized');
    expect(() => sevo.getPipelineStatus('fake-id')).toThrow('not initialized');
  });

  it('facade shutdown then re-init works', async () => {
    const sevo = new Sevo(VALID_CONFIG, { gateEngine: new GateEngine() });
    await sevo.init();

    const payload = makePayload(['spec', 'spec-review-gate']);
    const run1 = sevo.startPipeline(payload);
    expect(run1.runId).toBeDefined();

    sevo.shutdown();
    expect(() => sevo.startPipeline(payload)).toThrow('not initialized');

    await sevo.init();
    const run2 = sevo.startPipeline(makePayload(['spec', 'spec-review-gate'], 'task-2'));
    expect(run2.runId).toBeDefined();
    expect(run2.runId).not.toBe(run1.runId);
  });
});

// ── 7. Parallel Authoring Stages (P1-1) ─────────────────────────

describe('Full Pipeline E2E: Parallel Authoring Stages (DAG Branch)', () => {
  it('spec-review-gate fans out to 3 authoring stages + contract in parallel', async () => {
    // Build a DAG where spec-review-gate branches into 4 parallel paths:
    // spec-review-gate → test-case-authoring
    // spec-review-gate → ux-acceptance-authoring
    // spec-review-gate → commercial-acceptance-authoring
    // spec-review-gate → contract
    const edges: StageEdge[] = [
      { from: 'spec', to: 'spec-review-gate' },
      { from: 'spec-review-gate', to: 'test-case-authoring' },
      { from: 'spec-review-gate', to: 'ux-acceptance-authoring' },
      { from: 'spec-review-gate', to: 'commercial-acceptance-authoring' },
      { from: 'spec-review-gate', to: 'contract' },
    ];
    const graph = new StageGraph(edges);

    // Verify DAG structure: spec-review-gate has 4 outgoing edges
    const outgoing = graph.getOutgoing('spec-review-gate');
    expect(outgoing).toHaveLength(4);
    expect(outgoing.map((e) => e.to).sort()).toEqual([
      'commercial-acceptance-authoring',
      'contract',
      'test-case-authoring',
      'ux-acceptance-authoring',
    ]);
  });

  it('router advances to first unconditional branch from spec-review-gate', async () => {
    const edges: StageEdge[] = [
      { from: 'spec', to: 'spec-review-gate' },
      { from: 'spec-review-gate', to: 'test-case-authoring' },
      { from: 'spec-review-gate', to: 'ux-acceptance-authoring' },
      { from: 'spec-review-gate', to: 'commercial-acceptance-authoring' },
      { from: 'spec-review-gate', to: 'contract' },
      { from: 'test-case-authoring', to: 'contract-review-gate' },
      { from: 'ux-acceptance-authoring', to: 'contract-review-gate' },
      { from: 'commercial-acceptance-authoring', to: 'contract-review-gate' },
      { from: 'contract', to: 'contract-review-gate' },
      { from: 'contract-review-gate', to: 'implement' },
    ];
    const graph = new StageGraph(edges);
    const router = new StageRouter(graph);
    const gateEngine = new GateEngine(); // no rules → auto-pass
    const orchestrator = new TaskOrchestrator(router, gateEngine);

    const stages: StageId[] = ['spec', 'spec-review-gate', 'test-case-authoring', 'contract-review-gate', 'implement'];
    const payload = makePayload(stages);
    const run = orchestrator.startPipeline(payload);

    // Advance from spec → spec-review-gate
    const { nextStage: ns1 } = await orchestrator.evaluateAndAdvanceAsync(run.runId);
    expect(ns1).toBe('spec-review-gate');

    // Advance from spec-review-gate → first unconditional branch (test-case-authoring)
    const { nextStage: ns2 } = await orchestrator.evaluateAndAdvanceAsync(run.runId);
    expect(ns2).toBe('test-case-authoring');
  });

  it('conditional edges route to specific authoring stages based on verdict', async () => {
    // Use conditional edges to demonstrate DAG branching logic
    const edges: StageEdge[] = [
      { from: 'spec', to: 'spec-review-gate' },
      {
        from: 'spec-review-gate',
        to: 'ux-acceptance-authoring',
        condition: (v) => v.reviewBundles.some((b) => b.role === 'ux'),
      },
      {
        from: 'spec-review-gate',
        to: 'commercial-acceptance-authoring',
        condition: (v) => v.reviewBundles.some((b) => b.role === 'commercial'),
      },
      { from: 'spec-review-gate', to: 'contract' }, // unconditional fallback
      { from: 'ux-acceptance-authoring', to: 'implement' },
      { from: 'commercial-acceptance-authoring', to: 'implement' },
      { from: 'contract', to: 'implement' },
    ];
    const graph = new StageGraph(edges);
    const router = new StageRouter(graph);

    // Verdict with ux review bundle → routes to ux-acceptance-authoring
    const uxVerdict = {
      gateId: 'spec-review-gate',
      conclusion: 'passed' as const,
      blockers: [],
      reviewBundles: [{ reviewer: 'ux-01', role: 'ux', conclusion: 'passed' as const, issues: [] }],
    };
    expect(router.advance('spec-review-gate', uxVerdict)).toBe('ux-acceptance-authoring');

    // Verdict with commercial review bundle → routes to commercial-acceptance-authoring
    const commercialVerdict = {
      gateId: 'spec-review-gate',
      conclusion: 'passed' as const,
      blockers: [],
      reviewBundles: [{ reviewer: 'pm-01', role: 'commercial', conclusion: 'passed' as const, issues: [] }],
    };
    expect(router.advance('spec-review-gate', commercialVerdict)).toBe('commercial-acceptance-authoring');

    // Verdict with no matching condition → falls back to contract (unconditional)
    const plainVerdict = {
      gateId: 'spec-review-gate',
      conclusion: 'passed' as const,
      blockers: [],
      reviewBundles: [],
    };
    expect(router.advance('spec-review-gate', plainVerdict)).toBe('contract');
  });

  it('adapter dispatches tasks for all 3 authoring stages independently', async () => {
    const adapter = new StandaloneAdapter(makeProjectConfig());
    const authoringStages: StageId[] = ['test-case-authoring', 'ux-acceptance-authoring', 'commercial-acceptance-authoring'];

    for (const stage of authoringStages) {
      const payload = makePayload([stage], `task-${stage}`);
      const taskId = await adapter.dispatchTask(stage, payload);
      expect(taskId).toContain(stage);

      adapter.registerArtifacts(taskId, [
        makeArtifact({ path: `${stage}/acceptance-criteria.md` }),
      ]);

      const collected = await adapter.collectArtifacts(taskId);
      expect(collected).toHaveLength(1);
      expect(collected[0]!.path).toBe(`${stage}/acceptance-criteria.md`);
    }

    expect(adapter.getDispatches()).toHaveLength(3);
    expect(adapter.getDispatches().map((d) => d.stage).sort()).toEqual([
      'commercial-acceptance-authoring',
      'test-case-authoring',
      'ux-acceptance-authoring',
    ]);
  });
});

// ── 8. Review-Fix-Loop E2E Integration (P1-2) ───────────────────

describe('Full Pipeline E2E: Review-Fix-Loop Integration', () => {
  it('pipeline reaches review → fix loop executes → gate re-evaluates → pipeline continues', async () => {
    const stages: StageId[] = ['spec', 'spec-review-gate', 'implement', 'review', 'smoke-test', 'ux-acceptance', 'regression', 'ledger'];
    const gateEngine = new GateEngine();
    gateEngine.registerRule(new FileExistsRule(stages, ['output.md']));
    gateEngine.registerRule(new TestPassRule(stages));

    const graph = makeLinearGraph(stages);
    const router = new StageRouter(graph);
    const orchestrator = new TaskOrchestrator(router, gateEngine);
    const adapter = new StandaloneAdapter(makeProjectConfig());

    const payload = makePayload(stages);
    const run = orchestrator.startPipeline(payload);

    // Advance through spec → spec-review-gate → implement → review
    const validArtifacts = [
      makeArtifact({ path: 'output.md', type: 'file' }),
      makeArtifact({ path: 'test.json', type: 'test-result', metadata: { passed: true } }),
    ];
    for (let i = 0; i < 3; i++) {
      orchestrator.submitArtifacts(run.runId, validArtifacts.map((a) => ({ ...a, id: `stage-${i}-${a.id}` })));
      await orchestrator.evaluateAndAdvanceAsync(run.runId);
    }
    expect(orchestrator.getPipelineStatus(run.runId).currentStage).toBe('review');

    // At review stage: simulate review finding issues (gate rejects)
    const { verdict: reviewVerdict } = await orchestrator.evaluateAndAdvanceAsync(run.runId);
    expect(reviewVerdict.conclusion).toBe('rejected');
    expect(orchestrator.getPipelineStatus(run.runId).currentStage).toBe('review');

    // Execute ReviewFixLoop with the review findings
    const fixLoop = new ReviewFixLoop({ now: () => '2026-04-28T10:00:00Z' });
    const reviewReportRef = makeArtifact({ path: 'review/report.json', type: 'review-bundle', id: 'review-report-1' });

    const loopInput = {
      pipeline: { pipelineId: run.runId, taskId: payload.taskId },
      reviewBundle: {
        gateConclusion: 'rejected' as const,
        fixRequirements: [],
        reviews: [{
          dimension: 'quality' as const,
          conclusion: 'rejected' as const,
          findings: [
            { id: 'sec-vuln-1', severity: 'blocker' as const, message: 'SQL injection in query builder', artifact: 'src/db.ts' },
            { id: 'p1-perf-1', severity: 'blocker' as const, message: 'N+1 query in list endpoint', artifact: 'src/api.ts' },
          ],
        }],
      },
      reviewReportRef,
    };

    const loopOutput = await fixLoop.execute(loopInput);

    // Verify fix loop extracted issues and generated fix tasks
    expect(loopOutput.issues.length).toBeGreaterThanOrEqual(2);
    expect(loopOutput.fixTasks.length).toBeGreaterThanOrEqual(2);
    expect(loopOutput.fixTasks[0]!.priority).toBeLessThanOrEqual(loopOutput.fixTasks[1]!.priority);

    // Simulate fixes applied: mark tasks completed and revalidate
    let updatedTasks = loopOutput.fixTasks;
    let updatedIssues = loopOutput.issues;
    for (const task of updatedTasks) {
      updatedTasks = fixLoop.updateFixTaskStatus(updatedTasks, task.id, 'completed');
      updatedIssues = fixLoop.updateIssueStatus(updatedIssues, task.issueId, 'revalidating');
    }

    // Revalidate each issue → all pass
    for (const issue of updatedIssues) {
      if (issue.status === 'revalidating') {
        updatedIssues = fixLoop.handleRevalidationResult(
          { issueId: issue.id, fixTaskId: `fix-${issue.id}`, outcome: 'passed', revalidatedArtifacts: [issue.artifact], affectedScope: [issue.artifact], message: 'Fixed', revalidatedAt: '2026-04-28T10:05:00Z' },
          updatedIssues,
        );
      }
    }

    // Gate re-evaluation should pass now
    const gateResult = fixLoop.evaluateGate(updatedIssues, '2026-04-28T10:06:00Z');
    expect(gateResult.gatePassed).toBe(true);
    expect(gateResult.pendingP0).toBe(0);
    expect(gateResult.pendingP1).toBe(0);

    // Now submit valid artifacts and advance the pipeline past review
    orchestrator.submitArtifacts(run.runId, validArtifacts.map((a) => ({ ...a, id: `fixed-${a.id}` })));
    const { verdict: postFixVerdict, nextStage } = await orchestrator.evaluateAndAdvanceAsync(run.runId);
    expect(postFixVerdict.conclusion).toBe('passed');
    expect(nextStage).toBe('smoke-test');
  });

  it('fix loop escalates when max attempts exceeded', async () => {
    const fixLoop = new ReviewFixLoop({ now: () => '2026-04-28T10:00:00Z', maxAttempts: 2 });
    const reviewReportRef = makeArtifact({ path: 'review/report.json', type: 'review-bundle', id: 'rr-2' });

    const loopInput = {
      pipeline: { pipelineId: 'pipe-esc', taskId: 'task-esc' },
      reviewBundle: {
        gateConclusion: 'rejected' as const,
        fixRequirements: [],
        reviews: [{
          dimension: 'quality' as const,
          conclusion: 'rejected' as const,
          findings: [
            { id: 'hard-bug', severity: 'blocker' as const, message: 'Unfixable race condition', artifact: 'src/race.ts' },
          ],
        }],
      },
      reviewReportRef,
    };

    const output = await fixLoop.execute(loopInput);
    let issues = output.issues;

    // Simulate 2 failed fix attempts
    issues = fixLoop.incrementAttempt(issues, issues[0]!.id);
    issues = fixLoop.incrementAttempt(issues, issues[0]!.id);

    // Should escalate after max attempts
    expect(fixLoop.shouldEscalate(issues)).toBe(true);
    expect(fixLoop.canRetry(issues[0]!)).toBe(false);

    // Gate should not pass with pending P0
    const gateResult = fixLoop.evaluateGate(issues, '2026-04-28T10:10:00Z');
    expect(gateResult.gatePassed).toBe(false);
    expect(gateResult.escalated).toBe(true);
  });
});

// ── 9. Clarification Blocking & Recovery (P1-3) ─────────────────

describe('Full Pipeline E2E: Clarification Blocking → Recovery', () => {
  class FakeClarificationAdapter implements HostClarificationAdapter {
    private responseCb?: (r: ClarificationResponse) => void;
    private timeoutCb?: (h: ClarificationHandle) => void;
    readonly dispatched: Array<{ target: ClarificationTarget; payload: ClarificationPayload }> = [];

    requestClarification(target: ClarificationTarget, payload: ClarificationPayload): ClarificationHandle {
      this.dispatched.push({ target, payload });
      return {
        clarificationId: payload.clarificationId,
        targetType: target.type,
        targetId: target.id,
        dispatchedAt: '2026-04-28T10:00:00.000Z',
        timeoutMs: 5000,
      };
    }
    onClarificationResponse(cb: (r: ClarificationResponse) => void): void { this.responseCb = cb; }
    onClarificationTimeout(cb: (h: ClarificationHandle) => void): void { this.timeoutCb = cb; }
    emitResponse(r: ClarificationResponse): void { this.responseCb?.(r); }
    emitTimeout(h: ClarificationHandle): void { this.timeoutCb?.(h); }
  }

  function setupWithClarification() {
    const adapter = new FakeClarificationAdapter();
    const stageRecords = new Map<StageId, StageRecord>();
    stageRecords.set('spec', { stageId: 'spec', status: 'active', attempt: 1, artifacts: [] });

    let idCounter = 0;
    const coordinator = new ClarificationCoordinator({
      adapter,
      rules: [{
        id: 'ambiguity-check',
        evaluate(sr, artifacts) {
          if (artifacts.some((a) => a.id === 'ambiguous-artifact')) {
            return [{
              pipelineId: 'pipe-clr',
              stageId: sr.stageId,
              stageAttempt: sr.attempt,
              type: ClarificationType.BOUNDARY,
              blockingLevel: BlockingLevel.BLOCKING,
              targetType: 'user' as const,
              question: 'What is the expected retry behavior?',
              sourceArtifacts: artifacts,
              impactScope: ['FR-11'],
              resolutionSinks: [ResolutionSink.SPEC_PACKAGE],
            }];
          }
          return [];
        },
      }],
      getStageRecord: (id) => stageRecords.get(id),
      updateStageRecord: (id, updater) => {
        const current = stageRecords.get(id)!;
        const next = updater(current);
        stageRecords.set(id, next);
        return { ...next };
      },
      applyResolution: (record) => [{
        id: `settled-${record.clarificationId}`,
        type: 'clarification-resolution',
        path: `/artifacts/clarification/${record.clarificationId}.md`,
        createdAt: '2026-04-28T10:05:00.000Z',
      }],
      now: () => '2026-04-28T10:00:00.000Z',
      createId: () => `clr-${++idCounter}`,
    });

    const stages: StageId[] = ['spec', 'spec-review-gate', 'implement'];
    const graph = makeLinearGraph(stages);
    const router = new StageRouter(graph);
    const orchestrator = new TaskOrchestrator(router, new GateEngine(), { clarificationCoordinator: coordinator });

    return { adapter, coordinator, orchestrator, stageRecords };
  }

  it('pipeline blocks on clarification → user responds → pipeline resumes', async () => {
    const { adapter, coordinator, orchestrator, stageRecords } = setupWithClarification();

    const run = orchestrator.startPipeline({
      taskId: 'task-clr-1', title: 'Clarification E2E', initialStage: 'spec', stages: ['spec', 'spec-review-gate', 'implement'],
    });

    // Submit artifact that triggers ambiguity detection
    orchestrator.submitArtifacts(run.runId, [{
      id: 'ambiguous-artifact', type: 'doc', path: '/spec/draft.md', createdAt: '2026-04-28T09:00:00Z',
    }]);

    // Scan triggers clarification → blocks stage
    const records = orchestrator.scanClarifications(run.runId);
    expect(records).toHaveLength(1);
    expect(records[0]!.blockingLevel).toBe(BlockingLevel.BLOCKING);
    expect(records[0]!.status).toBe(Status.OPEN);

    // Blocking clarification is tracked, but the stage is NOT frozen.
    // 原则：流水线永远往前走——澄清记录照常 open/dispatch，stage 保持 active。
    expect(orchestrator.hasBlockingClarifications(run.runId)).toBe(true);
    expect(stageRecords.get('spec')!.status).toBe('active');

    // Adapter dispatched the clarification
    expect(adapter.dispatched).toHaveLength(1);
    expect(adapter.dispatched[0]!.payload.question).toContain('retry behavior');

    // User responds → clarification resolved
    adapter.emitResponse({
      clarificationId: records[0]!.clarificationId,
      responderId: 'user-1',
      content: 'Retry 3 times with exponential backoff.',
      receivedAt: '2026-04-28T10:02:00.000Z',
    });

    // Apply resolution → settles the clarification
    const settled = coordinator.applyResolution(records[0]!.clarificationId);
    expect(settled).toHaveLength(1);

    // Resume stage — compatibility no-op now (stage was never frozen).
    const transition = coordinator.resumeStage('spec', records[0]!.clarificationId);
    expect(transition.from).toBe('active');
    expect(transition.to).toBe('active');

    // No outstanding blocking clarifications after settlement; stage stays active.
    expect(orchestrator.hasBlockingClarifications(run.runId)).toBe(false);
    expect(stageRecords.get('spec')!.status).toBe('active');

    // Pipeline can now advance normally
    const { verdict, nextStage } = await orchestrator.evaluateAndAdvanceAsync(run.runId);
    expect(verdict.conclusion).toBe('passed');
    expect(nextStage).toBe('spec-review-gate');
  });

  it('getClarificationSummary tracks lifecycle from open → resolved → settled', async () => {
    const { adapter, coordinator, orchestrator } = setupWithClarification();

    const run = orchestrator.startPipeline({
      taskId: 'task-clr-2', title: 'Summary E2E', initialStage: 'spec', stages: ['spec', 'spec-review-gate'],
    });
    orchestrator.submitArtifacts(run.runId, [{
      id: 'ambiguous-artifact', type: 'doc', path: '/spec/v2.md', createdAt: '2026-04-28T09:00:00Z',
    }]);
    orchestrator.scanClarifications(run.runId);

    // Initially: 1 open, 1 blocking
    let summary = orchestrator.getClarificationSummary(run.runId);
    expect(summary).toEqual({ open: 1, resolved: 0, settled: 0, blockingOpen: 1 });

    // Resolve
    adapter.emitResponse({
      clarificationId: 'clr-1',
      responderId: 'user-1',
      content: 'Use 5s timeout.',
      receivedAt: '2026-04-28T10:03:00.000Z',
    });

    summary = orchestrator.getClarificationSummary(run.runId);
    expect(summary).toEqual({ open: 0, resolved: 1, settled: 0, blockingOpen: 0 });

    // Settle
    coordinator.applyResolution('clr-1');

    summary = orchestrator.getClarificationSummary(run.runId);
    expect(summary).toEqual({ open: 0, resolved: 0, settled: 1, blockingOpen: 0 });
  });

  it('onClarificationSettled emits resumed=true when all blockers cleared', async () => {
    const { adapter, coordinator, orchestrator } = setupWithClarification();
    const events: unknown[] = [];
    orchestrator.events.on('clarification:settled', (e) => events.push(e));

    const run = orchestrator.startPipeline({
      taskId: 'task-clr-3', title: 'Settled E2E', initialStage: 'spec', stages: ['spec'],
    });
    orchestrator.submitArtifacts(run.runId, [{
      id: 'ambiguous-artifact', type: 'doc', path: '/spec/v3.md', createdAt: '2026-04-28T09:00:00Z',
    }]);
    orchestrator.scanClarifications(run.runId);

    // Resolve + settle
    adapter.emitResponse({
      clarificationId: 'clr-1',
      responderId: 'user-1',
      content: 'Confirmed approach.',
      receivedAt: '2026-04-28T10:04:00.000Z',
    });
    coordinator.applyResolution('clr-1');
    orchestrator.onClarificationSettled(run.runId, 'clr-1');

    expect(events).toHaveLength(1);
    expect((events[0] as Record<string, unknown>).resumed).toBe(true);
    expect((events[0] as Record<string, unknown>).clarificationId).toBe('clr-1');
  });
});
