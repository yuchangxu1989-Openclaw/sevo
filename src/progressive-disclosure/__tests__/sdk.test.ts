import { describe, it, expect, beforeEach } from 'vitest';
import { SevoSDK } from '../sdk.js';
import { GateEngine } from '../../gate/gate-engine.js';
import { STAGE_IDS } from '../../constants.js';

describe('SevoSDK (L3 Progressive Disclosure)', () => {
  let sdk: SevoSDK;

  beforeEach(() => {
    sdk = new SevoSDK({ engineOptions: { gateEngine: new GateEngine() } });
  });

  // ── createPipeline (AC-15.4: pipeline creation) ──

  describe('createPipeline', () => {
    it('creates a pipeline and returns status info', async () => {
      const status = await sdk.createPipeline({
        slug: 'my-project',
        description: 'build a feature',
        level: 'L1',
      });

      expect(status.slug).toBe('my-project');
      expect(status.description).toBe('build a feature');
      expect(status.level).toBe('L1');
      expect(status.lifecycle).toBe('created');
      expect(status.pipelineId).toBeTruthy();
      expect(status.stages.length).toBeGreaterThan(0);
    });

    it('creates pipelines at different levels', async () => {
      const l0 = await sdk.createPipeline({ slug: 'p0', description: 'fix', level: 'L0' });
      const l2 = await sdk.createPipeline({ slug: 'p2', description: 'new system', level: 'L2+' });

      expect(l0.level).toBe('L0');
      expect(l2.level).toBe('L2+');
      expect(l2.stages.length).toBeGreaterThanOrEqual(l0.stages.length);
    });
  });

  // ── advanceStage (AC-15.4: stage query/advance) ──

  describe('advanceStage', () => {
    it('activates the first stage from created state', async () => {
      const status = await sdk.createPipeline({ slug: 'proj', description: 'test', level: 'L0' });
      const result = sdk.advanceStage(status.pipelineId);

      expect(result.lifecycle).toBe('running');
      expect(result.transition).not.toBeNull();
      expect(result.transition!.status).toBe('active');
    });

    it('throws for unknown pipeline ID', async () => {
      expect(() => sdk.advanceStage('nonexistent')).toThrow(/not found/);
    });
  });

  // ── getStatus (AC-15.4: status query) ──

  describe('getStatus', () => {
    it('returns current pipeline status', async () => {
      const created = await sdk.createPipeline({ slug: 'proj', description: 'test', level: 'L1' });
      const status = sdk.getStatus(created.pipelineId);

      expect(status.pipelineId).toBe(created.pipelineId);
      expect(status.lifecycle).toBe('created');
      expect(status.slug).toBe('proj');
    });

    it('reflects lifecycle changes after advance', async () => {
      const created = await sdk.createPipeline({ slug: 'proj', description: 'test', level: 'L0' });
      sdk.advanceStage(created.pipelineId);
      const status = sdk.getStatus(created.pipelineId);

      expect(status.lifecycle).toBe('running');
      expect(status.currentStage).not.toBeNull();
    });
  });

  // ── completeStage (AC-15.4: stage completion) ──

  describe('completeStage', () => {
    it('completes a stage and advances to the next', async () => {
      const created = await sdk.createPipeline({ slug: 'proj', description: 'test', level: 'L0' });
      sdk.advanceStage(created.pipelineId);

      const status = sdk.getStatus(created.pipelineId);
      const currentStage = status.currentStage!;

      const result = sdk.completeStage({
        pipelineId: created.pipelineId,
        stageId: currentStage,
        outcome: 'passed',
        artifacts: [],
      });

      // Should have advanced or completed
      expect(['running', 'completed']).toContain(result.lifecycle);
    });

    it('routes a failed stage into the fix loop and keeps the pipeline running', async () => {
      const created = await sdk.createPipeline({ slug: 'proj', description: 'test', level: 'L0' });
      sdk.advanceStage(created.pipelineId);

      const status = sdk.getStatus(created.pipelineId);

      const result = sdk.completeStage({
        pipelineId: created.pipelineId,
        stageId: status.currentStage!,
        outcome: 'failed',
        failureReason: 'tests failed',
      });

      // 原则：流水线永远往前走。失败转入 fix_pending 修复循环，lifecycle 保持 running。
      expect(result.lifecycle).toBe('running');
      expect(result.transition!.status).toBe('fix_pending');
    }, 10000);
  });

  // ── pause / resume / cancel (AC-15.4: lifecycle management) ──

  describe('lifecycle management', () => {
    it('pauses and resumes a running pipeline', async () => {
      const created = await sdk.createPipeline({ slug: 'proj', description: 'test', level: 'L0' });
      sdk.advanceStage(created.pipelineId);

      const paused = sdk.pause(created.pipelineId);
      expect(paused.lifecycle).toBe('paused');

      const resumed = sdk.resume(created.pipelineId);
      expect(resumed.lifecycle).toBe('running');
    });

    it('cancels a pipeline', async () => {
      const created = await sdk.createPipeline({ slug: 'proj', description: 'test', level: 'L0' });
      const cancelled = sdk.cancel(created.pipelineId);
      expect(cancelled.lifecycle).toBe('cancelled');
    });
  });

  // ── listPipelines ──

  describe('listPipelines', () => {
    it('lists all created pipelines', async () => {
      await sdk.createPipeline({ slug: 'a', description: 'first', level: 'L0' });
      await sdk.createPipeline({ slug: 'b', description: 'second', level: 'L1' });

      const list = sdk.listPipelines();
      expect(list).toHaveLength(2);
      expect(list.map((p) => p.slug).sort()).toEqual(['a', 'b']);
    });
  });

  // ── Custom stage bridge (L2 via L3 API) ──

  describe('custom stage management', () => {
    it('registers and lists custom stages via SDK', async () => {
      const result = sdk.registerCustomStage({
        stageId: 'security-audit',
        name: 'Security Audit',
        anchorStage: STAGE_IDS.REVIEW,
        position: 'after',
      });

      expect(result.success).toBe(true);
      expect(sdk.listCustomStages()).toHaveLength(1);
    });

    it('unregisters a custom stage via SDK', async () => {
      sdk.registerCustomStage({
        stageId: 'temp',
        name: 'Temp',
        anchorStage: STAGE_IDS.DEPLOY,
        position: 'before',
      });

      expect(sdk.unregisterCustomStage('temp')).toBe(true);
      expect(sdk.listCustomStages()).toHaveLength(0);
    });
  });

  // ── AC-15.5: Cumulative capabilities ──

  describe('cumulative capabilities (AC-15.5)', () => {
    it('L3 SDK includes all L2 custom stage capabilities', async () => {
      // L2 capability: register custom stage
      sdk.registerCustomStage({
        stageId: 'custom-gate',
        name: 'Custom Gate',
        anchorStage: STAGE_IDS.IMPLEMENT,
        position: 'after',
      });

      // L3 capability: programmatic pipeline control
      const pipeline = await sdk.createPipeline({ slug: 'test', description: 'test', level: 'L0' });
      sdk.advanceStage(pipeline.pipelineId);

      // Both work together
      expect(sdk.listCustomStages()).toHaveLength(1);
      expect(sdk.getStatus(pipeline.pipelineId).lifecycle).toBe('running');
    });
  });
});
