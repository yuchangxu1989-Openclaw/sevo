/**
 * End-to-end integration tests — Gate + Router + Orchestrator.
 * Validates the full pipeline lifecycle across all three modules.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { ArtifactRef, StageId, GateVerdict } from '../types/index.js';
import { GateEngine, FileExistsRule, TestPassRule, MinCoverageRule } from '../gate/index.js';
import { StageRouter, StageGraph } from '../router/index.js';
import type { StageEdge } from '../router/index.js';
import { TaskOrchestrator } from '../orchestrator/index.js';
import type { TaskPayload } from '../orchestrator/index.js';
import type {
  PipelineStartedEvent,
  StageEnteredEvent,
  GateEvaluatedEvent,
  StageAdvancedEvent,
  PipelineCompletedEvent,
  PipelineFailedEvent,
} from '../orchestrator/index.js';

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

/** A minimal 3-stage linear graph for focused testing. */
function makeLinearGraph(stages: StageId[]): StageGraph {
  const edges: StageEdge[] = [];
  for (let i = 0; i < stages.length - 1; i++) {
    edges.push({ from: stages[i]!, to: stages[i + 1]! });
  }
  return new StageGraph(edges);
}

function makeLinearPayload(stages: StageId[], taskId = 'task-1'): TaskPayload {
  return {
    taskId,
    title: 'E2E Test Pipeline',
    initialStage: stages[0]!,
    stages,
  };
}

// ── 1. Full Pipeline Happy Path ─────────────────────────────────

describe('E2E: Full Pipeline Happy Path', () => {
  const stages: StageId[] = ['spec', 'spec-review-gate', 'contract', 'contract-review-gate', 'implement', 'review', 'smoke-test', 'ux-acceptance', 'pm-commercial-review', 'regression', 'publish-generalization-gate', 'deploy', 'verify', 'post-release-validation', 'clean-install-verification', 'ledger'];
  // The orchestrator follows the graph's first unconditional edge at each fork.
  // From smoke-test it picks ux-acceptance → regression, skipping pm-commercial-review.
  const walkPath: StageId[] = stages.filter(s => s !== 'pm-commercial-review');
  let orchestrator: TaskOrchestrator;
  let gateEngine: GateEngine;

  beforeEach(() => {
    gateEngine = new GateEngine();
    gateEngine.registerRule(new FileExistsRule(stages, ['spec.md']));
    gateEngine.registerRule(new TestPassRule(stages));

    const router = new StageRouter();
    orchestrator = new TaskOrchestrator(router, gateEngine);
  });

  it('should advance from spec to ledger (terminal) with proper artifacts', async () => {
    const payload = makeLinearPayload(walkPath);
    const run = orchestrator.startPipeline(payload);

    // Walk through each stage
    for (let i = 0; i < walkPath.length - 1; i++) {
      const currentStage = walkPath[i]!;
      expect(run.getCurrentStage()).toBe(currentStage);

      // Submit artifacts that satisfy both rules
      orchestrator.submitArtifacts(run.runId, [
        makeArtifact({ path: 'spec.md', type: 'file' }),
        makeArtifact({ path: 'test-results.json', type: 'test-result', metadata: { passed: true } }),
      ]);

      const { verdict, nextStage } = await orchestrator.evaluateAndAdvanceAsync(run.runId);
      expect(verdict.conclusion).toBe('passed');
      expect(nextStage).toBe(walkPath[i + 1]);
    }

    // Should be at terminal stage (ledger) and marked completed
    expect(run.getCurrentStage()).toBe('ledger');
    expect(run.isCompleted()).toBe(true);
  });
});

// ── 2. Gate Blocking Scenario ───────────────────────────────────

describe('E2E: Gate Blocking Scenario', () => {
  const stages: StageId[] = ['spec', 'spec-review-gate', 'contract'];
  let orchestrator: TaskOrchestrator;
  let gateEngine: GateEngine;

  beforeEach(() => {
    gateEngine = new GateEngine();
    gateEngine.registerRule(new FileExistsRule(stages, ['spec.md', 'requirements.md']));
    gateEngine.registerRule(new TestPassRule(stages));

    const graph = makeLinearGraph(stages);
    const router = new StageRouter(graph);
    orchestrator = new TaskOrchestrator(router, gateEngine);
  });

  it('should block when required artifact is missing, then pass after submission', async () => {
    const payload = makeLinearPayload(stages);
    const run = orchestrator.startPipeline(payload);

    // Submit incomplete artifacts — missing requirements.md and test-result
    orchestrator.submitArtifacts(run.runId, [
      makeArtifact({ path: 'spec.md', type: 'file' }),
    ]);

    // Gate should reject
    const { verdict: v1, nextStage: ns1 } = await orchestrator.evaluateAndAdvanceAsync(run.runId);
    expect(v1.conclusion).toBe('rejected');
    expect(v1.blockers.length).toBeGreaterThan(0);
    expect(ns1).toBeNull();
    expect(run.getCurrentStage()).toBe('spec'); // stays at spec

    // Now submit the missing artifacts
    orchestrator.submitArtifacts(run.runId, [
      makeArtifact({ path: 'requirements.md', type: 'file' }),
      makeArtifact({ path: 'test-report.json', type: 'test-result', metadata: { passed: true } }),
    ]);

    // Re-evaluate — should pass now
    const { verdict: v2, nextStage: ns2 } = await orchestrator.evaluateAndAdvanceAsync(run.runId);
    expect(v2.conclusion).toBe('passed');
    expect(ns2).toBe('spec-review-gate');
    expect(run.getCurrentStage()).toBe('spec-review-gate');
  });
});

// ── 3. Conditional Branch Routing ───────────────────────────────

describe('E2E: Conditional Branch Routing', () => {
  it('should follow conditional edge when condition is met', async () => {
    const gateEngine = new GateEngine();
    // No rules → default pass (score=1)

    // Custom graph: spec → (if no blockers) → implement, (unconditional) → contract
    const edges: StageEdge[] = [
      {
        from: 'spec',
        to: 'implement',
        condition: (verdict: GateVerdict) => verdict.blockers.length === 0,
      },
      { from: 'spec', to: 'contract' },
      { from: 'implement', to: 'review' },
      { from: 'contract', to: 'implement' },
    ];
    const graph = new StageGraph(edges);
    const router = new StageRouter(graph);
    const orchestrator = new TaskOrchestrator(router, gateEngine);

    const payload: TaskPayload = {
      taskId: 'branch-test',
      title: 'Branch Test',
      initialStage: 'spec',
      stages: ['spec', 'contract', 'implement', 'review'],
    };

    const run = orchestrator.startPipeline(payload);

    // No rules → gate passes with no blockers → condition met → goes to implement
    const { nextStage } = await orchestrator.evaluateAndAdvanceAsync(run.runId);
    expect(nextStage).toBe('implement');
    expect(run.getCurrentStage()).toBe('implement');
  });

  it('should fall back to unconditional edge when condition is not met', async () => {
    const gateEngine = new GateEngine();
    // Register a rule that always passes but produces a warning-free verdict
    // We need a condition that checks something specific

    const edges: StageEdge[] = [
      {
        from: 'spec',
        to: 'implement',
        // Condition: only if verdict has specific metadata (won't match)
        condition: (verdict: GateVerdict) => verdict.gateId === 'special-gate',
      },
      { from: 'spec', to: 'contract' },
      { from: 'contract', to: 'implement' },
    ];
    const graph = new StageGraph(edges);
    const router = new StageRouter(graph);
    const orchestrator = new TaskOrchestrator(router, gateEngine);

    const payload: TaskPayload = {
      taskId: 'fallback-test',
      title: 'Fallback Test',
      initialStage: 'spec',
      stages: ['spec', 'contract', 'implement'],
    };

    const run = orchestrator.startPipeline(payload);

    // Gate passes but condition won't match (gateId is 'spec-gate' not 'special-gate')
    const { nextStage } = await orchestrator.evaluateAndAdvanceAsync(run.runId);
    expect(nextStage).toBe('contract');
    expect(run.getCurrentStage()).toBe('contract');
  });
});

// ── 4. Event Completeness ───────────────────────────────────────

describe('E2E: Event Completeness', () => {
  it('should emit all 6 event types in correct order for a full run', async () => {
    const gateEngine = new GateEngine();
    // No rules → auto-pass
    const stages: StageId[] = ['spec', 'spec-review-gate', 'contract'];
    const graph = makeLinearGraph(stages);
    const router = new StageRouter(graph);
    const orchestrator = new TaskOrchestrator(router, gateEngine);

    const events: Array<{ type: string; payload: unknown }> = [];

    orchestrator.events.on('pipeline:started', (p) => events.push({ type: 'pipeline:started', payload: p }));
    orchestrator.events.on('stage:entered', (p) => events.push({ type: 'stage:entered', payload: p }));
    orchestrator.events.on('gate:evaluated', (p) => events.push({ type: 'gate:evaluated', payload: p }));
    orchestrator.events.on('stage:advanced', (p) => events.push({ type: 'stage:advanced', payload: p }));
    orchestrator.events.on('pipeline:completed', (p) => events.push({ type: 'pipeline:completed', payload: p }));
    orchestrator.events.on('pipeline:failed', (p) => events.push({ type: 'pipeline:failed', payload: p }));

    const payload = makeLinearPayload(stages);
    const run = orchestrator.startPipeline(payload);

    // Advance through all stages
    await orchestrator.evaluateAndAdvanceAsync(run.runId); // spec → spec-review-gate
    await orchestrator.evaluateAndAdvanceAsync(run.runId); // spec-review-gate → contract (terminal)

    // Verify event types emitted
    const eventTypes = events.map((e) => e.type);

    // Expected sequence:
    // 1. pipeline:started
    // 2. stage:entered (spec)
    // 3. gate:evaluated (spec)
    // 4. stage:advanced (spec → spec-review-gate)
    // 5. stage:entered (spec-review-gate)
    // 6. gate:evaluated (spec-review-gate)
    // 7. stage:advanced (spec-review-gate → contract)
    // 8. stage:entered (contract)
    // 9. pipeline:completed

    expect(eventTypes[0]).toBe('pipeline:started');
    expect(eventTypes[1]).toBe('stage:entered'); // initial
    expect(eventTypes[2]).toBe('gate:evaluated');
    expect(eventTypes[3]).toBe('stage:advanced');
    expect(eventTypes[4]).toBe('stage:entered');
    expect(eventTypes[5]).toBe('gate:evaluated');
    expect(eventTypes[6]).toBe('stage:advanced');
    expect(eventTypes[7]).toBe('stage:entered');
    expect(eventTypes[8]).toBe('pipeline:completed');

    // Verify all 6 event types were emitted (pipeline:failed via separate test)
    const uniqueTypes = new Set(eventTypes);
    expect(uniqueTypes).toContain('pipeline:started');
    expect(uniqueTypes).toContain('stage:entered');
    expect(uniqueTypes).toContain('gate:evaluated');
    expect(uniqueTypes).toContain('stage:advanced');
    expect(uniqueTypes).toContain('pipeline:completed');

    // Verify pipeline:started payload
    const startedPayload = events[0]!.payload as PipelineStartedEvent;
    expect(startedPayload.runId).toBe(run.runId);
    expect(startedPayload.initialStage).toBe('spec');

    // Verify stage:advanced payload
    const advancedPayload = events[3]!.payload as StageAdvancedEvent;
    expect(advancedPayload.fromStage).toBe('spec');
    expect(advancedPayload.toStage).toBe('spec-review-gate');

    // Verify pipeline:completed payload
    const completedPayload = events[8]!.payload as PipelineCompletedEvent;
    expect(completedPayload.runId).toBe(run.runId);
    expect(completedPayload.finalStage).toBe('contract');
  });

  it('should emit pipeline:failed event', async () => {
    const gateEngine = new GateEngine();
    const stages: StageId[] = ['spec', 'spec-review-gate'];
    const graph = makeLinearGraph(stages);
    const router = new StageRouter(graph);
    const orchestrator = new TaskOrchestrator(router, gateEngine);

    const failedEvents: PipelineFailedEvent[] = [];
    orchestrator.events.on('pipeline:failed', (p) => failedEvents.push(p));

    const payload = makeLinearPayload(stages);
    const run = orchestrator.startPipeline(payload);

    orchestrator.failPipeline(run.runId, 'Manual abort');

    expect(failedEvents).toHaveLength(1);
    expect(failedEvents[0]!.runId).toBe(run.runId);
    expect(failedEvents[0]!.reason).toBe('Manual abort');
    expect(failedEvents[0]!.stage).toBe('spec');
    expect(run.isFailed()).toBe(true);
  });
});

// ── 5. Multi-Rule Aggregation ───────────────────────────────────

describe('E2E: Multi-Rule Aggregation', () => {
  it('should aggregate 3+ rules with mixed pass/warning/blocker results', async () => {
    const gateEngine = new GateEngine();
    const stages: StageId[] = ['implement', 'review'];

    // Rule 1: FileExistsRule — will PASS (blocker severity when fails)
    gateEngine.registerRule(new FileExistsRule(['implement'], ['src/main.ts']));
    // Rule 2: TestPassRule — will PASS (blocker severity when fails)
    gateEngine.registerRule(new TestPassRule(['implement']));
    // Rule 3: MinCoverageRule — will FAIL with WARNING (threshold 80, actual 60)
    gateEngine.registerRule(new MinCoverageRule(['implement'], 80));

    const graph = makeLinearGraph(stages);
    const router = new StageRouter(graph);
    const orchestrator = new TaskOrchestrator(router, gateEngine);

    const payload = makeLinearPayload(stages, 'agg-test');
    const run = orchestrator.startPipeline(payload);

    // Submit artifacts: file exists, tests pass, but coverage is low
    orchestrator.submitArtifacts(run.runId, [
      makeArtifact({ path: 'src/main.ts', type: 'file' }),
      makeArtifact({ path: 'test-report.json', type: 'test-result', metadata: { passed: true } }),
      makeArtifact({ path: 'coverage.json', type: 'coverage', metadata: { percentage: 60 } }),
    ]);

    // Evaluate: 2 pass + 1 warning → overall pass (warnings don't block)
    const { verdict, nextStage } = await orchestrator.evaluateAndAdvanceAsync(run.runId);
    expect(verdict.conclusion).toBe('passed');
    expect(nextStage).toBe('review');
  });

  it('should reject when any blocker rule fails', async () => {
    const gateEngine = new GateEngine();
    const stages: StageId[] = ['implement', 'review'];

    // Rule 1: FileExistsRule — will FAIL (blocker)
    gateEngine.registerRule(new FileExistsRule(['implement'], ['src/main.ts', 'src/missing.ts']));
    // Rule 2: TestPassRule — will PASS
    gateEngine.registerRule(new TestPassRule(['implement']));
    // Rule 3: MinCoverageRule — will PASS
    gateEngine.registerRule(new MinCoverageRule(['implement'], 50));

    const graph = makeLinearGraph(stages);
    const router = new StageRouter(graph);
    const orchestrator = new TaskOrchestrator(router, gateEngine);

    const payload = makeLinearPayload(stages, 'agg-block-test');
    const run = orchestrator.startPipeline(payload);

    // Submit: missing src/missing.ts
    orchestrator.submitArtifacts(run.runId, [
      makeArtifact({ path: 'src/main.ts', type: 'file' }),
      makeArtifact({ path: 'test-report.json', type: 'test-result', metadata: { passed: true } }),
      makeArtifact({ path: 'coverage.json', type: 'coverage', metadata: { percentage: 75 } }),
    ]);

    const { verdict, nextStage } = await orchestrator.evaluateAndAdvanceAsync(run.runId);
    expect(verdict.conclusion).toBe('rejected');
    expect(verdict.blockers.length).toBeGreaterThan(0);
    expect(verdict.blockers[0]!.item).toContain('src/missing.ts');
    expect(nextStage).toBeNull();
  });

  it('should pass when all rules pass (score=1)', async () => {
    const gateEngine = new GateEngine();
    const stages: StageId[] = ['implement', 'review'];

    gateEngine.registerRule(new FileExistsRule(['implement'], ['src/main.ts']));
    gateEngine.registerRule(new TestPassRule(['implement']));
    gateEngine.registerRule(new MinCoverageRule(['implement'], 50));

    const graph = makeLinearGraph(stages);
    const router = new StageRouter(graph);
    const orchestrator = new TaskOrchestrator(router, gateEngine);

    const payload = makeLinearPayload(stages, 'agg-all-pass');
    const run = orchestrator.startPipeline(payload);

    orchestrator.submitArtifacts(run.runId, [
      makeArtifact({ path: 'src/main.ts', type: 'file' }),
      makeArtifact({ path: 'test-report.json', type: 'test-result', metadata: { passed: true } }),
      makeArtifact({ path: 'coverage.json', type: 'coverage', metadata: { percentage: 90 } }),
    ]);

    const { verdict, nextStage } = await orchestrator.evaluateAndAdvanceAsync(run.runId);
    expect(verdict.conclusion).toBe('passed');
    expect(verdict.blockers).toHaveLength(0);
    expect(nextStage).toBe('review');
  });
});
