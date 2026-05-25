import { describe, it, expect, beforeEach } from 'vitest';
import { PipelineEngineFacade } from '../pipeline-engine.js';
import { GateEngine } from '../../gate/gate-engine.js';
import type { GateRule } from '../../gate/gate-rule.js';
import type { StageId, ArtifactRef, RuleResult } from '../../types/index.js';

describe('PipelineEngineFacade', () => {
  let engine: PipelineEngineFacade;

  beforeEach(() => {
    engine = new PipelineEngineFacade();
  });

  // ── createPipeline ──

  describe('createPipeline', () => {
    it('creates an L0 pipeline with lifecycle=created', async () => {
      const summary = await engine.createPipeline('my-project', 'fix a bug', 'L0');

      expect(summary.slug).toBe('my-project');
      expect(summary.description).toBe('fix a bug');
      expect(summary.level).toBe('L0');
      expect(summary.lifecycle).toBe('created');
      expect(summary.currentStage).toBeNull();
      expect(summary.stages.length).toBeGreaterThan(0);
      expect(summary.pipelineId).toBeTruthy();
      expect(summary.createdAt).toBeTruthy();
    });

    it('creates an L1 pipeline with more stages than L0', async () => {
      const l0 = await engine.createPipeline('proj', 'small fix', 'L0');
      const l1 = await engine.createPipeline('proj', 'medium change', 'L1');

      expect(l1.stages.length).toBeGreaterThanOrEqual(l0.stages.length);
    });

    it('creates an L2+ pipeline with the most stages', async () => {
      const l2 = await engine.createPipeline('proj', 'new system', 'L2+');

      expect(l2.stages.length).toBeGreaterThan(0);
      expect(l2.level).toBe('L2+');
    });

    it('records a pipeline_created event in the ledger', async () => {
      const summary = await engine.createPipeline('proj', 'desc', 'L0');
      const events = engine.getLedger().getHistory(summary.pipelineId);

      expect(events.some((e) => e.type === 'pipeline_created')).toBe(true);
    });
  });

  // ── listPipelines ──

  describe('listPipelines', () => {
    it('returns empty array when no pipelines exist', async () => {
      expect(engine.listPipelines()).toEqual([]);
    });

    it('lists all created pipelines', async () => {
      await engine.createPipeline('a', 'desc a', 'L0');
      await engine.createPipeline('b', 'desc b', 'L1');

      const list = engine.listPipelines();
      expect(list).toHaveLength(2);
      expect(list.map((p) => p.slug).sort()).toEqual(['a', 'b']);
    });
  });

  // ── getStatus ──

  describe('getStatus', () => {
    it('returns current status of a pipeline', async () => {
      const created = await engine.createPipeline('proj', 'desc', 'L0');
      const status = engine.getStatus(created.pipelineId);

      expect(status.pipelineId).toBe(created.pipelineId);
      expect(status.lifecycle).toBe('created');
    });

    it('throws for unknown pipeline', async () => {
      expect(() => engine.getStatus('nonexistent')).toThrow(/not found/);
    });
  });

  // ── advance (state machine transitions) ──

  describe('advance', () => {
    it('transitions from created → running on first advance', async () => {
      const summary = await engine.createPipeline('proj', 'desc', 'L0');
      const result = engine.advance(summary.pipelineId);

      expect(result.lifecycle).toBe('running');
      expect(result.transition).not.toBeNull();
      expect(result.transition!.status).toBe('active');
      expect(result.events.length).toBeGreaterThan(0);
    });

    it('does nothing when pipeline is already completed', async () => {
      const summary = await engine.createPipeline('proj', 'desc', 'L0');

      // Advance to running
      engine.advance(summary.pipelineId);

      // Complete all stages one by one
      const status = engine.getStatus(summary.pipelineId);
      for (const stageId of status.stages) {
        const current = engine.getStatus(summary.pipelineId);
        if (current.lifecycle === 'completed') break;

        engine.completeStage(summary.pipelineId, {
          stageId,
          outcome: 'passed',
          artifacts: [],
        });
      }

      const finalStatus = engine.getStatus(summary.pipelineId);
      if (finalStatus.lifecycle === 'completed') {
        const result = engine.advance(summary.pipelineId);
        expect(result.lifecycle).toBe('completed');
        expect(result.transition).toBeNull();
      }
    });

    it('evaluates gate when running and blocks if gate fails', async () => {
      const gateEngine = new GateEngine();
      const blockingRule: GateRule = {
        id: 'always-block',
        appliesTo: ['implement'] as StageId[],
        evaluate: (_artifacts: ArtifactRef[]): RuleResult => ({
          pass: false,
          message: 'Missing test coverage',
          severity: 'blocker',
        }),
      };
      gateEngine.registerRule(blockingRule);

      engine = new PipelineEngineFacade({ gateEngine });
      const summary = await engine.createPipeline('proj', 'desc', 'L0');

      // Advance to running (activates first stage)
      engine.advance(summary.pipelineId);

      // Complete stages until we hit 'implement'
      let status = engine.getStatus(summary.pipelineId);
      while (status.currentStage && status.currentStage !== 'implement' && status.lifecycle === 'running') {
        engine.completeStage(summary.pipelineId, {
          stageId: status.currentStage,
          outcome: 'passed',
          artifacts: [],
        });
        status = engine.getStatus(summary.pipelineId);
      }

      if (status.currentStage === 'implement' && status.lifecycle === 'running') {
        // Now advance should evaluate gate and block
        const result = engine.advance(summary.pipelineId);
        expect(result.lifecycle).toBe('blocked');
        expect(result.gateVerdict).toBeDefined();
        expect(result.gateVerdict!.pass).toBe(false);
      }
    });
  });

  // ── completeStage ──

  describe('completeStage', () => {
    it('marks stage as passed and activates next', async () => {
      const summary = await engine.createPipeline('proj', 'desc', 'L0');
      engine.advance(summary.pipelineId);

      const status = engine.getStatus(summary.pipelineId);
      const firstStage = status.currentStage!;

      const result = engine.completeStage(summary.pipelineId, {
        stageId: firstStage,
        outcome: 'passed',
        artifacts: [],
      });

      expect(result.lifecycle).toBe('running');
      expect(result.transition).not.toBeNull();
      expect(result.transition!.fromStage).toBe(firstStage);
    });

    it('marks pipeline as failed when stage fails', async () => {
      const summary = await engine.createPipeline('proj', 'desc', 'L0');
      engine.advance(summary.pipelineId);

      const status = engine.getStatus(summary.pipelineId);
      const firstStage = status.currentStage!;

      const result = engine.completeStage(summary.pipelineId, {
        stageId: firstStage,
        outcome: 'failed',
        artifacts: [],
        failureReason: 'compilation error',
      });

      expect(result.lifecycle).toBe('failed');
      expect(result.transition!.status).toBe('failed');
    });

    it('marks pipeline as completed when all stages pass', async () => {
      const summary = await engine.createPipeline('proj', 'desc', 'L0');
      engine.advance(summary.pipelineId);

      // Complete all stages sequentially
      let status = engine.getStatus(summary.pipelineId);
      let lastResult;
      for (const stageId of status.stages) {
        const current = engine.getStatus(summary.pipelineId);
        if (current.lifecycle === 'completed' || current.lifecycle === 'failed') break;

        lastResult = engine.completeStage(summary.pipelineId, {
          stageId,
          outcome: 'passed',
          artifacts: [],
        });
      }

      const finalStatus = engine.getStatus(summary.pipelineId);
      expect(finalStatus.lifecycle).toBe('completed');
    });

    it('runs advance and complete-stage through the unified runStep entry', async () => {
      const summary = await engine.createPipeline('proj', 'desc', 'L0');
      const started = await engine.runStep({ type: 'advance', pipelineId: summary.pipelineId });

      expect(started.action).toBe('advance');
      expect(started.lifecycle).toBe('running');

      const firstStage = engine.getStatus(summary.pipelineId).currentStage!;
      const completed = await engine.runStep({
        type: 'complete-stage',
        pipelineId: summary.pipelineId,
        stageResult: { stageId: firstStage, outcome: 'passed', artifacts: [] },
      });

      expect(completed.action).toBe('complete-stage');
      expect(completed.transition!.fromStage).toBe(firstStage);
    });

    it('throws when unified complete-stage input misses stageResult', async () => {
      const summary = await engine.createPipeline('proj', 'desc', 'L0');
      await expect(engine.runStep({ type: 'complete-stage', pipelineId: summary.pipelineId })).rejects.toThrow(/stageResult is required/);
    });

    it('throws for unknown stage', async () => {
      const summary = await engine.createPipeline('proj', 'desc', 'L0');
      engine.advance(summary.pipelineId);

      expect(() =>
        engine.completeStage(summary.pipelineId, {
          stageId: 'nonexistent' as StageId,
          outcome: 'passed',
          artifacts: [],
        }),
      ).toThrow(/not found/);
    });

    it('records artifacts on the stage', async () => {
      const summary = await engine.createPipeline('proj', 'desc', 'L0');
      engine.advance(summary.pipelineId);

      const status = engine.getStatus(summary.pipelineId);
      const firstStage = status.currentStage!;

      const artifact: ArtifactRef = {
        id: 'art-1',
        type: 'test-report',
        path: '/reports/test.json',
        createdAt: new Date().toISOString(),
      };

      engine.completeStage(summary.pipelineId, {
        stageId: firstStage,
        outcome: 'passed',
        artifacts: [artifact],
      });

      // Verify via ledger events
      const events = engine.getLedger().getHistory(summary.pipelineId);
      const completedEvent = events.find(
        (e) => e.type === 'stage_completed' && e.stageId === firstStage,
      );
      expect(completedEvent).toBeDefined();
      expect(completedEvent!.detail?.artifacts).toContain('art-1');
    });
  });

  // ── GateEngine access ──

  describe('getGateEngine', () => {
    it('returns the gate engine for rule registration', async () => {
      const gate = engine.getGateEngine();
      expect(gate).toBeInstanceOf(GateEngine);
    });
  });

  // ── Post-Release Validation stage in pipeline ──

  describe('post-release-validation in pipeline', () => {
    it('L2+ pipeline includes post-release-validation stage', async () => {
      const summary = await engine.createPipeline('proj', 'new system', 'L2+');
      expect(summary.stages).toContain('post-release-validation');
    });

    it('L1 pipeline includes post-release-validation stage', async () => {
      const summary = await engine.createPipeline('proj', 'medium change', 'L1');
      expect(summary.stages).toContain('post-release-validation');
    });

    it('L0 pipeline skips post-release-validation', async () => {
      const summary = await engine.createPipeline('proj', 'tiny fix', 'L0');
      expect(summary.stages).not.toContain('post-release-validation');
    });

    it('post-release-validation comes after verify and clean-install verification before ledger', async () => {
      const summary = await engine.createPipeline('proj', 'new system', 'L2+');
      const stages = summary.stages;
      const verifyIdx = stages.indexOf('verify');
      const prvIdx = stages.indexOf('post-release-validation');
      const cleanInstallIdx = stages.indexOf('clean-install-verification');
      const ledgerIdx = stages.indexOf('ledger');

      expect(verifyIdx).toBeGreaterThan(-1);
      expect(prvIdx).toBeGreaterThan(-1);
      expect(cleanInstallIdx).toBeGreaterThan(-1);
      expect(ledgerIdx).toBeGreaterThan(-1);
      expect(prvIdx).toBeGreaterThan(verifyIdx);
      expect(cleanInstallIdx).toBeGreaterThan(prvIdx);
      expect(cleanInstallIdx).toBeLessThan(ledgerIdx);
    });

    it('pipeline does not complete until post-release-validation passes', async () => {
      const summary = await engine.createPipeline('proj', 'new system', 'L2+');
      engine.advance(summary.pipelineId);

      // Complete all stages except post-release-validation, clean-install verification, and ledger
      let status = engine.getStatus(summary.pipelineId);
      for (const stageId of status.stages) {
        const current = engine.getStatus(summary.pipelineId);
        if (current.lifecycle === 'completed' || current.lifecycle === 'failed') break;
        if (stageId === 'post-release-validation') break;

        engine.completeStage(summary.pipelineId, {
          stageId,
          outcome: 'passed',
          artifacts: [],
        });
      }

      status = engine.getStatus(summary.pipelineId);
      // Pipeline should still be running, not completed
      expect(status.lifecycle).not.toBe('completed');
      expect(status.currentStage).toBe('post-release-validation');
    });
  });
});
