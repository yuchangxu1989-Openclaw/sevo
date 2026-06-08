/**
 * Tests for FR-D04: OKR Achievement Periodic Checker.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OkrPeriodicChecker } from '../okr-periodic-checker.js';
import type { OkrCheckerEventSink, SmartDecompositionAdapter, CliOutputAdapter } from '../okr-periodic-checker.js';
import type { PipelineInstance } from '../../types/index.js';
import type { OkrCheckCompletedEvent, PipelineConvergedEvent } from '../types.js';

// ── Test helpers ────────────────────────────────────────────────

function createMockEventSink(): OkrCheckerEventSink & {
  events: Array<{ event: string; payload: unknown }>;
} {
  const events: Array<{ event: string; payload: unknown }> = [];
  return {
    events,
    emit(event: string, payload: unknown) {
      events.push({ event, payload });
    },
  };
}

function createMockCliOutput(): CliOutputAdapter & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    write(msg: string) {
      lines.push(msg);
    },
  };
}

function createPipelineWithOkr(overrides?: Partial<PipelineInstance>): PipelineInstance {
  return {
    instanceId: 'test-pipeline-001',
    projectSlug: 'test-project',
    status: 'active',
    routingResult: {
      taskId: 'task-1',
      level: 'L2+',
      requiredStages: ['spec', 'implement', 'review'],
      matchedRules: ['new-module'],
      needsUxDesign: false, uxDesignReason: '', needsArchDesign: false, archDesignReason: '',
    },
    directoryStructure: {
      projectRoot: '/tmp/test',
      createdDirs: [],
      existingDirs: [],
      createdFiles: [],
      existingFiles: [],
      complete: true,
    },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    endStateGoal: {
      description: 'Achieve 100% test coverage',
      lockedAt: '2026-01-01T00:00:00Z',
    },
    okrTree: [
      {
        objectiveId: 'OBJ-01',
        description: 'Full test coverage',
        keyResults: [
          {
            krId: 'KR-01.1',
            description: 'Unit test coverage >= 90%',
            measure: 'coverage percentage',
            threshold: '90%',
            status: 'in-progress',
          },
          {
            krId: 'KR-01.2',
            description: 'Integration tests for all API endpoints',
            measure: 'endpoint count',
            threshold: '100%',
            status: 'not-started',
          },
        ],
      },
    ],
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe('OkrPeriodicChecker', () => {
  let eventSink: ReturnType<typeof createMockEventSink>;
  let checker: OkrPeriodicChecker;

  beforeEach(() => {
    eventSink = createMockEventSink();
    checker = new OkrPeriodicChecker({
      eventSink,
      now: () => '2026-05-08T10:00:00Z',
    });
  });

  describe('shouldCheck', () => {
    it('returns true for pipeline with endStateGoal and okrTree (AC-D04.1)', async () => {
      const pipeline = createPipelineWithOkr();
      expect(checker.shouldCheck(pipeline)).toBe(true);
    });

    it('returns false for pipeline without OKR tree (AC-D04.6)', async () => {
      const pipeline = createPipelineWithOkr({ okrTree: undefined });
      expect(checker.shouldCheck(pipeline)).toBe(false);
    });

    it('returns false for pipeline with empty OKR tree (AC-D04.6)', async () => {
      const pipeline = createPipelineWithOkr({ okrTree: [] });
      expect(checker.shouldCheck(pipeline)).toBe(false);
    });

    it('returns false for pipeline without endStateGoal (AC-D04.6)', async () => {
      const pipeline = createPipelineWithOkr({ endStateGoal: undefined });
      expect(checker.shouldCheck(pipeline)).toBe(false);
    });
  });

  describe('check', () => {
    it('throws for pipeline without OKR tree (AC-D04.6)', async () => {
      const pipeline = createPipelineWithOkr({ okrTree: undefined });
      await expect(checker.check(pipeline)).rejects.toThrow('has no OKR tree');
    });

    it('generates SMART suggestions for unachieved KRs (AC-D04.3)', async () => {
      const pipeline = createPipelineWithOkr();
      const report = await checker.check(pipeline);

      expect(report.results).toHaveLength(2);
      // KR-01.1 is in-progress → should have suggestions
      const kr1 = report.results.find((r) => r.krId === 'KR-01.1');
      expect(kr1).toBeDefined();
      expect(kr1!.suggestedTasks.length).toBeGreaterThan(0);
      expect(kr1!.suggestedTasks[0]!.title).toContain('KR');
      expect(kr1!.suggestedTasks[0]!.measure).toBeDefined();
      expect(kr1!.suggestedTasks[0]!.deadline).toBeDefined();
    });

    it('skips achieved KRs with empty suggestions (AC-D04 step 3)', async () => {
      const pipeline = createPipelineWithOkr({
        okrTree: [
          {
            objectiveId: 'OBJ-01',
            description: 'Test',
            keyResults: [
              { krId: 'KR-01', description: 'Done', measure: 'x', status: 'achieved' },
              { krId: 'KR-02', description: 'Not done', measure: 'y', status: 'in-progress' },
            ],
          },
        ],
      });

      const report = await checker.check(pipeline);
      const achieved = report.results.find((r) => r.krId === 'KR-01');
      expect(achieved!.suggestedTasks).toHaveLength(0);
    });

    it('emits okr-check-completed event with unachieved KRs (AC-D04.4)', async () => {
      const pipeline = createPipelineWithOkr();
      await checker.check(pipeline);

      expect(eventSink.events).toHaveLength(1);
      expect(eventSink.events[0]!.event).toBe('okr-check-completed');

      const payload = eventSink.events[0]!.payload as OkrCheckCompletedEvent;
      expect(payload.pipelineId).toBe('test-pipeline-001');
      expect(payload.unachievedKrs).toHaveLength(2);
      expect(payload.timestamp).toBe('2026-05-08T10:00:00Z');
    });

    it('emits pipeline-converged when all KRs achieved (AC-D04.5)', async () => {
      const pipeline = createPipelineWithOkr({
        okrTree: [
          {
            objectiveId: 'OBJ-01',
            description: 'All done',
            keyResults: [
              { krId: 'KR-01', description: 'Done 1', measure: 'x', status: 'achieved' },
              { krId: 'KR-02', description: 'Done 2', measure: 'y', status: 'achieved' },
            ],
          },
        ],
      });

      const report = await checker.check(pipeline);

      expect(report.allAchieved).toBe(true);
      expect(eventSink.events).toHaveLength(2);
      expect(eventSink.events[0]!.event).toBe('okr-check-completed');
      expect(eventSink.events[1]!.event).toBe('pipeline-converged');

      const converged = eventSink.events[1]!.payload as PipelineConvergedEvent;
      expect(converged.pipelineId).toBe('test-pipeline-001');
      expect(converged.convergedAt).toBe('2026-05-08T10:00:00Z');
    });

    it('does NOT emit pipeline-converged when KRs remain (AC-D04.5 negative)', async () => {
      const pipeline = createPipelineWithOkr();
      await checker.check(pipeline);

      const convergedEvents = eventSink.events.filter((e) => e.event === 'pipeline-converged');
      expect(convergedEvents).toHaveLength(0);
    });

    it('uses LLM adapter for SMART suggestions when available', async () => {
      const smartAdapter: SmartDecompositionAdapter = {
        generateSmartTasks: vi.fn().mockResolvedValue([
          { title: 'LLM-generated task', measure: 'custom', deadline: '2026-06-01' },
        ]),
      };

      const checkerWithLlm = new OkrPeriodicChecker({
        eventSink,
        smartAdapter,
        now: () => '2026-05-08T10:00:00Z',
      });

      const pipeline = createPipelineWithOkr();
      const report = await checkerWithLlm.check(pipeline);

      expect(smartAdapter.generateSmartTasks).toHaveBeenCalled();
      const kr1 = report.results.find((r) => r.krId === 'KR-01.1');
      expect(kr1!.suggestedTasks[0]!.title).toBe('LLM-generated task');
    });

    it('report includes correct metadata (AC-D04.7)', async () => {
      const pipeline = createPipelineWithOkr();
      const report = await checker.check(pipeline);

      expect(report.pipelineId).toBe('test-pipeline-001');
      expect(report.checkedAt).toBe('2026-05-08T10:00:00Z');
      expect(report.interval).toBe('daily');
      expect(report.allAchieved).toBe(false);
    });
  });

  describe('getInterval (AC-D04.2)', () => {
    it('returns configured interval', async () => {
      expect(checker.getInterval()).toBe('daily');

      const weeklyChecker = new OkrPeriodicChecker({
        eventSink,
        interval: 'weekly',
      });
      expect(weeklyChecker.getInterval()).toBe('weekly');

      const stageChecker = new OkrPeriodicChecker({
        eventSink,
        interval: 'on-stage-complete',
      });
      expect(stageChecker.getInterval()).toBe('on-stage-complete');
    });
  });

  describe('CLI degradation (AC-D04.8)', () => {
    it('outputs to CLI when adapter provided', async () => {
      const cliOutput = createMockCliOutput();
      const checkerWithCli = new OkrPeriodicChecker({
        eventSink,
        cliOutput,
        now: () => '2026-05-08T10:00:00Z',
      });

      const pipeline = createPipelineWithOkr();
      await checkerWithCli.check(pipeline);

      expect(cliOutput.lines.length).toBeGreaterThan(0);
      expect(cliOutput.lines.some((l) => l.includes('OKR Check'))).toBe(true);
      expect(cliOutput.lines.some((l) => l.includes('not yet achieved'))).toBe(true);
    });

    it('outputs converged message when all KRs achieved', async () => {
      const cliOutput = createMockCliOutput();
      const checkerWithCli = new OkrPeriodicChecker({
        eventSink,
        cliOutput,
        now: () => '2026-05-08T10:00:00Z',
      });

      const pipeline = createPipelineWithOkr({
        okrTree: [
          {
            objectiveId: 'OBJ-01',
            description: 'Done',
            keyResults: [
              { krId: 'KR-01', description: 'Done', measure: 'x', status: 'achieved' },
            ],
          },
        ],
      });

      await checkerWithCli.check(pipeline);
      expect(cliOutput.lines.some((l) => l.includes('converged'))).toBe(true);
    });
  });
});
