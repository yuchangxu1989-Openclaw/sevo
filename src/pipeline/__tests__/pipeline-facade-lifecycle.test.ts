/**
 * Tests for PipelineEngineFacade: pause, resume, cancel, recoverInterrupted.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PipelineEngineFacade } from '../pipeline-engine.js';

describe('PipelineEngineFacade — lifecycle control', () => {
  let engine: PipelineEngineFacade;

  beforeEach(() => {
    engine = new PipelineEngineFacade();
  });

  // ── pause ──

  describe('pause', () => {
    it('pauses a running pipeline', async () => {
      const summary = await engine.createPipeline('proj', 'desc', 'L0');
      engine.advance(summary.pipelineId); // created → running

      const result = engine.pause(summary.pipelineId);
      expect(result.lifecycle).toBe('paused');
    });

    it('records a pipeline_paused event in the ledger', async () => {
      const summary = await engine.createPipeline('proj', 'desc', 'L0');
      engine.advance(summary.pipelineId);
      engine.pause(summary.pipelineId);

      const events = engine.getLedger().getHistory(summary.pipelineId);
      expect(events.some((e) => e.type === 'pipeline_paused')).toBe(true);
    });

    it('throws when pipeline is not running', async () => {
      const summary = await engine.createPipeline('proj', 'desc', 'L0');
      // lifecycle is 'created', not 'running'
      expect(() => engine.pause(summary.pipelineId)).toThrow(/expected 'running'/);
    });

    it('throws when pipeline is already paused', async () => {
      const summary = await engine.createPipeline('proj', 'desc', 'L0');
      engine.advance(summary.pipelineId);
      engine.pause(summary.pipelineId);

      expect(() => engine.pause(summary.pipelineId)).toThrow(/expected 'running'/);
    });
  });

  // ── resume ──

  describe('resume', () => {
    it('resumes a paused pipeline back to running', async () => {
      const summary = await engine.createPipeline('proj', 'desc', 'L0');
      engine.advance(summary.pipelineId);
      engine.pause(summary.pipelineId);

      const result = engine.resume(summary.pipelineId);
      expect(result.lifecycle).toBe('running');
    });

    it('records a pipeline_resumed event in the ledger', async () => {
      const summary = await engine.createPipeline('proj', 'desc', 'L0');
      engine.advance(summary.pipelineId);
      engine.pause(summary.pipelineId);
      engine.resume(summary.pipelineId);

      const events = engine.getLedger().getHistory(summary.pipelineId);
      expect(events.some((e) => e.type === 'pipeline_resumed')).toBe(true);
    });

    it('throws when pipeline is not paused', async () => {
      const summary = await engine.createPipeline('proj', 'desc', 'L0');
      engine.advance(summary.pipelineId); // running
      expect(() => engine.resume(summary.pipelineId)).toThrow(/expected 'paused'/);
    });
  });

  // ── cancel ──

  describe('cancel', () => {
    it('cancels a running pipeline', async () => {
      const summary = await engine.createPipeline('proj', 'desc', 'L0');
      engine.advance(summary.pipelineId);

      const result = engine.cancel(summary.pipelineId);
      expect(result.lifecycle).toBe('cancelled');
    });

    it('cancels a created pipeline', async () => {
      const summary = await engine.createPipeline('proj', 'desc', 'L0');
      const result = engine.cancel(summary.pipelineId);
      expect(result.lifecycle).toBe('cancelled');
    });

    it('cancels a paused pipeline', async () => {
      const summary = await engine.createPipeline('proj', 'desc', 'L0');
      engine.advance(summary.pipelineId);
      engine.pause(summary.pipelineId);

      const result = engine.cancel(summary.pipelineId);
      expect(result.lifecycle).toBe('cancelled');
    });

    it('records a pipeline_cancelled event in the ledger', async () => {
      const summary = await engine.createPipeline('proj', 'desc', 'L0');
      engine.advance(summary.pipelineId);
      engine.cancel(summary.pipelineId);

      const events = engine.getLedger().getHistory(summary.pipelineId);
      expect(events.some((e) => e.type === 'pipeline_cancelled')).toBe(true);
    });

    it('throws when pipeline is already completed', async () => {
      const summary = await engine.createPipeline('proj', 'desc', 'L0');
      engine.advance(summary.pipelineId);

      // Complete all stages
      const status = engine.getStatus(summary.pipelineId);
      for (const stageId of status.stages) {
        const current = engine.getStatus(summary.pipelineId);
        if (current.lifecycle === 'completed') break;
        engine.completeStage(summary.pipelineId, { stageId, outcome: 'passed', artifacts: [] });
      }

      expect(() => engine.cancel(summary.pipelineId)).toThrow(/terminal/);
    });

    it('throws when pipeline is already cancelled', async () => {
      const summary = await engine.createPipeline('proj', 'desc', 'L0');
      engine.cancel(summary.pipelineId);
      expect(() => engine.cancel(summary.pipelineId)).toThrow(/terminal/);
    });
  });

  // ── recoverInterrupted ──

  describe('recoverInterrupted', () => {
    it('returns empty array when no pipelines are stale', async () => {
      const summary = await engine.createPipeline('proj', 'desc', 'L0');
      engine.advance(summary.pipelineId);

      const interrupted = engine.recoverInterrupted();
      expect(interrupted).toEqual([]);
    });

    it('detects and blocks stale running pipelines', async () => {
      const summary = await engine.createPipeline('proj', 'desc', 'L0');
      engine.advance(summary.pipelineId);

      // threshold=0 means any elapsed time triggers detection
      const interrupted = engine.recoverInterrupted(0);
      expect(interrupted).toContain(summary.pipelineId);

      const status = engine.getStatus(summary.pipelineId);
      expect(status.lifecycle).toBe('blocked');
    });

    it('records stage_blocked and pipeline_blocked events', async () => {
      const summary = await engine.createPipeline('proj', 'desc', 'L0');
      engine.advance(summary.pipelineId);

      engine.recoverInterrupted(0);

      const events = engine.getLedger().getHistory(summary.pipelineId);
      expect(events.some((e) => e.type === 'stage_blocked')).toBe(true);
      expect(events.filter((e) => e.type === 'pipeline_blocked').length).toBeGreaterThan(0);
    });

    it('ignores non-running pipelines', async () => {
      const s1 = await engine.createPipeline('proj1', 'desc', 'L0');
      // s1 stays 'created'

      const s2 = await engine.createPipeline('proj2', 'desc', 'L0');
      engine.advance(s2.pipelineId);
      engine.pause(s2.pipelineId);
      // s2 is 'paused'

      const interrupted = engine.recoverInterrupted(0);
      expect(interrupted).not.toContain(s1.pipelineId);
      expect(interrupted).not.toContain(s2.pipelineId);
    });
  });
});
