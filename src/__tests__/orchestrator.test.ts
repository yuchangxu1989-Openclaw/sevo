import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ArtifactRef, GateVerdict, StageId } from '../types/index.js';
import { StageRouter } from '../router/stage-router.js';
import { StageGraph } from '../router/stage-graph.js';
import { GateEngine } from '../gate/gate-engine.js';
import type { GateRule } from '../gate/gate-rule.js';
import { TaskOrchestrator } from '../orchestrator/task-orchestrator.js';
import type { TaskPayload } from '../orchestrator/pipeline-run.js';
import type {
  PipelineStartedEvent,
  StageEnteredEvent,
  GateEvaluatedEvent,
  StageAdvancedEvent,
  PipelineCompletedEvent,
  PipelineFailedEvent,
} from '../orchestrator/orchestrator-events.js';

// ── Test helpers ────────────────────────────────────────────────

/** Simple 5-stage linear graph: specify→plan→implement→verify→release */
const TEST_STAGES: StageId[] = ['spec', 'contract', 'implement', 'verify', 'ledger'];

const TEST_EDGES = [
  { from: 'spec' as StageId, to: 'contract' as StageId },
  { from: 'contract' as StageId, to: 'implement' as StageId },
  { from: 'implement' as StageId, to: 'verify' as StageId },
  { from: 'verify' as StageId, to: 'ledger' as StageId },
];

function makeTestGraph(): StageGraph {
  return new StageGraph(TEST_EDGES);
}

/** A GateRule that always passes. */
function alwaysPassRule(stages: StageId[]): GateRule {
  return {
    id: 'always-pass',
    appliesTo: stages,
    evaluate: () => ({ pass: true, message: 'OK', severity: 'warning' as const }),
  };
}

/** A GateRule that always fails. */
function alwaysFailRule(stages: StageId[]): GateRule {
  return {
    id: 'always-fail',
    appliesTo: stages,
    evaluate: () => ({ pass: false, message: 'Blocked', severity: 'blocker' as const }),
  };
}

function makeArtifact(stage: StageId): ArtifactRef {
  return {
    id: `art-${stage}-${Date.now()}`,
    type: 'document',
    path: `/out/${stage}.md`,
    createdAt: new Date().toISOString(),
  };
}

function makePayload(initialStage: StageId = 'spec'): TaskPayload {
  return {
    taskId: 'test-task-1',
    title: 'Test Pipeline',
    initialStage,
    stages: TEST_STAGES,
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe('TaskOrchestrator', () => {
  let orchestrator: TaskOrchestrator;
  let router: StageRouter;
  let gateEngine: GateEngine;

  beforeEach(() => {
    router = new StageRouter(makeTestGraph());
    gateEngine = new GateEngine();
    orchestrator = new TaskOrchestrator(router, gateEngine);
  });

  describe('startPipeline', () => {
    it('creates a pipeline run with correct initial state', () => {
      const payload = makePayload();
      const run = orchestrator.startPipeline(payload);

      expect(run.runId).toBeDefined();
      expect(run.getCurrentStage()).toBe('spec');
      expect(run.payload).toEqual(payload);
      expect(run.isCompleted()).toBe(false);
      expect(run.isFailed()).toBe(false);
    });

    it('emits pipeline:started and stage:entered events', () => {
      const startedEvents: PipelineStartedEvent[] = [];
      const enteredEvents: StageEnteredEvent[] = [];

      orchestrator.events.on('pipeline:started', (e) => startedEvents.push(e));
      orchestrator.events.on('stage:entered', (e) => enteredEvents.push(e));

      const run = orchestrator.startPipeline(makePayload());

      expect(startedEvents).toHaveLength(1);
      expect(startedEvents[0]!.runId).toBe(run.runId);
      expect(startedEvents[0]!.initialStage).toBe('spec');

      expect(enteredEvents).toHaveLength(1);
      expect(enteredEvents[0]!.stage).toBe('spec');
    });
  });

  describe('submitArtifacts', () => {
    it('stores artifacts for the current stage', () => {
      const run = orchestrator.startPipeline(makePayload());
      const artifact = makeArtifact('spec');

      orchestrator.submitArtifacts(run.runId, [artifact]);

      expect(run.getArtifacts('spec')).toHaveLength(1);
      expect(run.getArtifacts('spec')[0]!.id).toBe(artifact.id);
    });

    it('throws for unknown runId', () => {
      expect(() => orchestrator.submitArtifacts('nonexistent', [])).toThrow(
        'Pipeline run not found',
      );
    });
  });

  describe('evaluateAndAdvance — happy path', () => {
    it('advances through all stages when gate always passes', () => {
      // Register a rule that passes for all stages
      gateEngine.registerRule(alwaysPassRule(TEST_STAGES));

      const run = orchestrator.startPipeline(makePayload());

      // spec → contract
      orchestrator.submitArtifacts(run.runId, [makeArtifact('spec')]);
      let result = orchestrator.evaluateAndAdvance(run.runId);
      expect(result.verdict.conclusion).toBe('passed');
      expect(result.nextStage).toBe('contract');
      expect(run.getCurrentStage()).toBe('contract');

      // contract → implement
      orchestrator.submitArtifacts(run.runId, [makeArtifact('contract')]);
      result = orchestrator.evaluateAndAdvance(run.runId);
      expect(result.nextStage).toBe('implement');

      // implement → verify
      orchestrator.submitArtifacts(run.runId, [makeArtifact('implement')]);
      result = orchestrator.evaluateAndAdvance(run.runId);
      expect(result.nextStage).toBe('verify');

      // verify → ledger (terminal)
      orchestrator.submitArtifacts(run.runId, [makeArtifact('verify')]);
      result = orchestrator.evaluateAndAdvance(run.runId);
      expect(result.nextStage).toBe('ledger');
      expect(run.isCompleted()).toBe(true);
    });
  });

  describe('evaluateAndAdvance — gate rejection', () => {
    it('stays at current stage when gate fails', () => {
      // Register a rule that fails for 'spec'
      gateEngine.registerRule(alwaysFailRule(['spec']));

      const run = orchestrator.startPipeline(makePayload());
      orchestrator.submitArtifacts(run.runId, [makeArtifact('spec')]);

      const result = orchestrator.evaluateAndAdvance(run.runId);

      expect(result.verdict.conclusion).toBe('rejected');
      expect(result.nextStage).toBeNull();
      expect(run.getCurrentStage()).toBe('spec');
      expect(run.isCompleted()).toBe(false);
    });

    it('advances after re-evaluation with passing artifacts', () => {
      // Fail on first call, pass on second
      let callCount = 0;
      const conditionalRule: GateRule = {
        id: 'conditional',
        appliesTo: ['spec'],
        evaluate: () => {
          callCount++;
          if (callCount === 1) {
            return { pass: false, message: 'Missing spec', severity: 'blocker' };
          }
          return { pass: true, message: 'OK', severity: 'warning' };
        },
      };
      gateEngine.registerRule(conditionalRule);
      // Pass for all other stages
      gateEngine.registerRule(alwaysPassRule(['contract', 'implement', 'verify', 'ledger']));

      const run = orchestrator.startPipeline(makePayload());
      orchestrator.submitArtifacts(run.runId, [makeArtifact('spec')]);

      // First attempt — blocked
      let result = orchestrator.evaluateAndAdvance(run.runId);
      expect(result.verdict.conclusion).toBe('rejected');
      expect(result.nextStage).toBeNull();
      expect(run.getCurrentStage()).toBe('spec');

      // Submit more artifacts and retry
      orchestrator.submitArtifacts(run.runId, [makeArtifact('spec')]);
      result = orchestrator.evaluateAndAdvance(run.runId);
      expect(result.verdict.conclusion).toBe('passed');
      expect(result.nextStage).toBe('contract');
      expect(run.getCurrentStage()).toBe('contract');
    });
  });

  describe('event emission', () => {
    it('emits gate:evaluated and stage:advanced on successful advance', () => {
      gateEngine.registerRule(alwaysPassRule(TEST_STAGES));

      const gateEvents: GateEvaluatedEvent[] = [];
      const advancedEvents: StageAdvancedEvent[] = [];

      orchestrator.events.on('gate:evaluated', (e) => gateEvents.push(e));
      orchestrator.events.on('stage:advanced', (e) => advancedEvents.push(e));

      const run = orchestrator.startPipeline(makePayload());
      orchestrator.submitArtifacts(run.runId, [makeArtifact('spec')]);
      orchestrator.evaluateAndAdvance(run.runId);

      expect(gateEvents).toHaveLength(1);
      expect(gateEvents[0]!.stage).toBe('spec');
      expect(gateEvents[0]!.verdict.conclusion).toBe('passed');

      expect(advancedEvents).toHaveLength(1);
      expect(advancedEvents[0]!.fromStage).toBe('spec');
      expect(advancedEvents[0]!.toStage).toBe('contract');
    });

    it('emits pipeline:completed when reaching terminal stage', () => {
      gateEngine.registerRule(alwaysPassRule(TEST_STAGES));

      const completedEvents: PipelineCompletedEvent[] = [];
      orchestrator.events.on('pipeline:completed', (e) => completedEvents.push(e));

      const run = orchestrator.startPipeline(makePayload());

      // Advance through all stages
      for (const stage of TEST_STAGES.slice(0, -1)) {
        orchestrator.submitArtifacts(run.runId, [makeArtifact(stage)]);
        orchestrator.evaluateAndAdvance(run.runId);
      }

      expect(completedEvents).toHaveLength(1);
      expect(completedEvents[0]!.finalStage).toBe('ledger');
    });

    it('emits pipeline:failed when failPipeline is called', () => {
      const failedEvents: PipelineFailedEvent[] = [];
      orchestrator.events.on('pipeline:failed', (e) => failedEvents.push(e));

      const run = orchestrator.startPipeline(makePayload());
      orchestrator.failPipeline(run.runId, 'Critical error');

      expect(failedEvents).toHaveLength(1);
      expect(failedEvents[0]!.reason).toBe('Critical error');
      expect(failedEvents[0]!.stage).toBe('spec');
      expect(run.isFailed()).toBe(true);
    });

    it('emits gate:evaluated even when gate rejects', () => {
      gateEngine.registerRule(alwaysFailRule(['spec']));

      const gateEvents: GateEvaluatedEvent[] = [];
      orchestrator.events.on('gate:evaluated', (e) => gateEvents.push(e));

      const run = orchestrator.startPipeline(makePayload());
      orchestrator.submitArtifacts(run.runId, [makeArtifact('spec')]);
      orchestrator.evaluateAndAdvance(run.runId);

      expect(gateEvents).toHaveLength(1);
      expect(gateEvents[0]!.verdict.conclusion).toBe('rejected');
    });
  });

  describe('getPipelineStatus', () => {
    it('reflects initial state correctly', () => {
      const run = orchestrator.startPipeline(makePayload());
      const status = orchestrator.getPipelineStatus(run.runId);

      expect(status.runId).toBe(run.runId);
      expect(status.currentStage).toBe('spec');
      expect(status.history).toHaveLength(0);
      expect(status.verdict).toBeUndefined();
      expect(status.startedAt).toBeDefined();
      expect(status.updatedAt).toBeDefined();
    });

    it('reflects state after advancement', () => {
      gateEngine.registerRule(alwaysPassRule(TEST_STAGES));

      const run = orchestrator.startPipeline(makePayload());
      orchestrator.submitArtifacts(run.runId, [makeArtifact('spec')]);
      orchestrator.evaluateAndAdvance(run.runId);

      const status = orchestrator.getPipelineStatus(run.runId);

      expect(status.currentStage).toBe('contract');
      expect(status.history).toHaveLength(1);
      expect(status.history[0]!.from).toBe('spec');
      expect(status.history[0]!.to).toBe('contract');
      expect(status.verdict).toBeDefined();
      expect(status.verdict!.conclusion).toBe('passed');
    });

    it('reflects state after gate rejection (no advancement)', () => {
      gateEngine.registerRule(alwaysFailRule(['spec']));

      const run = orchestrator.startPipeline(makePayload());
      orchestrator.submitArtifacts(run.runId, [makeArtifact('spec')]);
      orchestrator.evaluateAndAdvance(run.runId);

      const status = orchestrator.getPipelineStatus(run.runId);

      expect(status.currentStage).toBe('spec');
      expect(status.history).toHaveLength(0);
      expect(status.verdict!.conclusion).toBe('rejected');
    });

    it('throws for unknown runId', () => {
      expect(() => orchestrator.getPipelineStatus('nonexistent')).toThrow(
        'Pipeline run not found',
      );
    });
  });

  describe('full pipeline happy path (5 stages)', () => {
    it('completes spec→contract→implement→verify→ledger', () => {
      gateEngine.registerRule(alwaysPassRule(TEST_STAGES));

      const allEvents: string[] = [];
      orchestrator.events.on('pipeline:started', () => allEvents.push('started'));
      orchestrator.events.on('stage:entered', (e) => allEvents.push(`entered:${e.stage}`));
      orchestrator.events.on('gate:evaluated', (e) => allEvents.push(`gate:${e.stage}`));
      orchestrator.events.on('stage:advanced', (e) => allEvents.push(`advanced:${e.fromStage}->${e.toStage}`));
      orchestrator.events.on('pipeline:completed', () => allEvents.push('completed'));

      const run = orchestrator.startPipeline(makePayload());

      for (const stage of TEST_STAGES.slice(0, -1)) {
        orchestrator.submitArtifacts(run.runId, [makeArtifact(stage)]);
        orchestrator.evaluateAndAdvance(run.runId);
      }

      expect(run.isCompleted()).toBe(true);
      expect(run.getCurrentStage()).toBe('ledger');

      // Verify event sequence
      expect(allEvents).toEqual([
        'started',
        'entered:spec',
        'gate:spec',
        'advanced:spec->contract',
        'entered:contract',
        'gate:contract',
        'advanced:contract->implement',
        'entered:implement',
        'gate:implement',
        'advanced:implement->verify',
        'entered:verify',
        'gate:verify',
        'advanced:verify->ledger',
        'entered:ledger',
        'completed',
      ]);

      const status = orchestrator.getPipelineStatus(run.runId);
      expect(status.history).toHaveLength(4);
    });
  });

  describe('cleanupRun', () => {
    it('removes a completed run and returns true', () => {
      gateEngine.registerRule(alwaysPassRule(TEST_STAGES));
      const run = orchestrator.startPipeline(makePayload());

      // Drive to completion
      for (const stage of TEST_STAGES.slice(0, -1)) {
        orchestrator.submitArtifacts(run.runId, [makeArtifact(stage)]);
        orchestrator.evaluateAndAdvance(run.runId);
      }
      expect(run.isCompleted()).toBe(true);

      const result = orchestrator.cleanupRun(run.runId);
      expect(result).toBe(true);

      // Run is no longer accessible
      expect(() => orchestrator.getPipelineStatus(run.runId)).toThrow('Pipeline run not found');
    });

    it('removes a failed run and returns true', () => {
      const run = orchestrator.startPipeline(makePayload());
      orchestrator.failPipeline(run.runId, 'boom');

      const result = orchestrator.cleanupRun(run.runId);
      expect(result).toBe(true);
      expect(() => orchestrator.getPipelineStatus(run.runId)).toThrow('Pipeline run not found');
    });

    it('refuses to clean up a running pipeline and returns false', () => {
      const run = orchestrator.startPipeline(makePayload());

      const result = orchestrator.cleanupRun(run.runId);
      expect(result).toBe(false);

      // Run is still accessible
      expect(orchestrator.getPipelineStatus(run.runId).currentStage).toBe('spec');
    });

    it('returns false for unknown runId', () => {
      expect(orchestrator.cleanupRun('nonexistent')).toBe(false);
    });
  });

  describe('cleanupCompleted', () => {
    it('removes all completed and failed runs, keeps running ones', () => {
      gateEngine.registerRule(alwaysPassRule(TEST_STAGES));

      // Create a completed run
      const completedRun = orchestrator.startPipeline(makePayload());
      for (const stage of TEST_STAGES.slice(0, -1)) {
        orchestrator.submitArtifacts(completedRun.runId, [makeArtifact(stage)]);
        orchestrator.evaluateAndAdvance(completedRun.runId);
      }

      // Create a failed run
      const failedRun = orchestrator.startPipeline(makePayload());
      orchestrator.failPipeline(failedRun.runId, 'error');

      // Create a running run
      const runningRun = orchestrator.startPipeline(makePayload());

      const count = orchestrator.cleanupCompleted();
      expect(count).toBe(2);

      // Running run still accessible
      expect(orchestrator.getPipelineStatus(runningRun.runId).currentStage).toBe('spec');

      // Completed and failed runs gone
      expect(() => orchestrator.getPipelineStatus(completedRun.runId)).toThrow('Pipeline run not found');
      expect(() => orchestrator.getPipelineStatus(failedRun.runId)).toThrow('Pipeline run not found');
    });

    it('returns 0 when no runs are finished', () => {
      orchestrator.startPipeline(makePayload());
      orchestrator.startPipeline(makePayload());

      expect(orchestrator.cleanupCompleted()).toBe(0);
    });
  });

  describe('maxRuns auto-eviction', () => {
    it('evicts oldest completed runs when maxRuns is exceeded', () => {
      gateEngine.registerRule(alwaysPassRule(TEST_STAGES));

      const limitedOrchestrator = new TaskOrchestrator(router, gateEngine, { maxRuns: 2 });

      // Create and complete first run
      const run1 = limitedOrchestrator.startPipeline(makePayload());
      for (const stage of TEST_STAGES.slice(0, -1)) {
        limitedOrchestrator.submitArtifacts(run1.runId, [makeArtifact(stage)]);
        limitedOrchestrator.evaluateAndAdvance(run1.runId);
      }

      // Create and complete second run
      const run2 = limitedOrchestrator.startPipeline(makePayload());
      for (const stage of TEST_STAGES.slice(0, -1)) {
        limitedOrchestrator.submitArtifacts(run2.runId, [makeArtifact(stage)]);
        limitedOrchestrator.evaluateAndAdvance(run2.runId);
      }

      // Third run triggers eviction of oldest completed (run1)
      const run3 = limitedOrchestrator.startPipeline(makePayload());

      // run1 evicted
      expect(() => limitedOrchestrator.getPipelineStatus(run1.runId)).toThrow('Pipeline run not found');
      // run2 and run3 still present
      expect(limitedOrchestrator.getPipelineStatus(run2.runId).runId).toBe(run2.runId);
      expect(limitedOrchestrator.getPipelineStatus(run3.runId).runId).toBe(run3.runId);
    });

    it('does not evict running runs even when over maxRuns', () => {
      const limitedOrchestrator = new TaskOrchestrator(router, gateEngine, { maxRuns: 1 });

      // Two running runs — neither can be evicted
      const run1 = limitedOrchestrator.startPipeline(makePayload());
      const run2 = limitedOrchestrator.startPipeline(makePayload());

      // Both still accessible (can't evict running)
      expect(limitedOrchestrator.getPipelineStatus(run1.runId).runId).toBe(run1.runId);
      expect(limitedOrchestrator.getPipelineStatus(run2.runId).runId).toBe(run2.runId);
    });
  });
});
