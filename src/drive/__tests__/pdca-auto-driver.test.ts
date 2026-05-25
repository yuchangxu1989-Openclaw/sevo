/**
 * Tests for FR-D05: PDCA Cycle Auto-Driver.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PdcaAutoDriver } from '../pdca-auto-driver.js';
import type { PdcaDriverEventSink, PdcaCliOutputAdapter } from '../pdca-auto-driver.js';
import type { PipelineInstance } from '../../types/index.js';
import type {
  PostReleaseGapFoundEvent,
  OkrCheckCompletedEvent,
  PdcaCycleStartedEvent,
  PdcaEscalatedEvent,
} from '../types.js';

// ── Test helpers ────────────────────────────────────────────────

function createMockEventSink(): PdcaDriverEventSink & {
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

function createMockCliOutput(): PdcaCliOutputAdapter & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    write(msg: string) {
      lines.push(msg);
    },
  };
}

function createPipeline(overrides?: Partial<PipelineInstance>): PipelineInstance {
  return {
    instanceId: 'pipeline-pdca-001',
    projectSlug: 'test-project',
    status: 'active',
    routingResult: {
      taskId: 'task-1',
      level: 'L2+',
      requiredStages: ['spec', 'implement', 'review'],
      skippedStages: [],
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
      description: 'Ship v2.0',
      lockedAt: '2026-01-01T00:00:00Z',
    },
    okrTree: [
      {
        objectiveId: 'OBJ-01',
        description: 'Release quality',
        keyResults: [
          { krId: 'KR-01', description: 'Zero P0 bugs', measure: 'count', status: 'in-progress' },
        ],
      },
    ],
    pdcaCycles: [],
    ...overrides,
  };
}

function createGapEvent(pipelineId: string): PostReleaseGapFoundEvent {
  return {
    pipelineId,
    report: {
      totalFrs: 5,
      coveredCount: 4,
      codeOnlyCount: 1,
      missingCount: 0,
      entries: [
        { frId: 'FR-05', summary: 'Error handling', status: 'code-only' as const, reason: 'Missing error handling in API layer' },
      ],
      gaps: 1,
      analyzedAt: '2026-05-08T10:00:00Z',
    },
    fixTasks: [
      { frId: 'FR-05', description: 'Add try-catch to all endpoints' },
      { frId: 'FR-05', description: 'Add error response schema' },
    ],
    cycle: 1,
  };
}

function createOkrCheckEvent(pipelineId: string): OkrCheckCompletedEvent {
  return {
    pipelineId,
    report: {
      pipelineId,
      checkedAt: '2026-05-08T10:00:00Z',
      interval: 'daily',
      results: [
        {
          krId: 'KR-01',
          krDescription: 'Zero P0 bugs',
          status: 'in-progress',
          suggestedTasks: [
            { title: 'Fix remaining P0 bugs', measure: 'bug count = 0', deadline: '2026-05-15' },
          ],
        },
      ],
      allAchieved: false,
    },
    unachievedKrs: [
      {
        krId: 'KR-01',
        krDescription: 'Zero P0 bugs',
        status: 'in-progress',
        suggestedTasks: [
          { title: 'Fix remaining P0 bugs', measure: 'bug count = 0', deadline: '2026-05-15' },
        ],
      },
    ],
    timestamp: '2026-05-08T10:00:00Z',
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe('PdcaAutoDriver', () => {
  let eventSink: ReturnType<typeof createMockEventSink>;
  let driver: PdcaAutoDriver;

  beforeEach(() => {
    eventSink = createMockEventSink();
    driver = new PdcaAutoDriver({
      eventSink,
      maxCycles: 5,
      now: () => '2026-05-08T10:00:00Z',
    });
  });

  describe('handleGapFound (AC-D05.1)', () => {
    it('creates PdcaCycleRecord and appends to pipeline', async () => {
      const pipeline = createPipeline();
      const event = createGapEvent(pipeline.instanceId);

      const record = driver.handleGapFound(pipeline, event);

      expect(record).not.toBeNull();
      expect(record!.cycle).toBe(1);
      expect(record!.triggeredBy).toContain('FR-05: Add try-catch to all endpoints');
      expect(record!.newTasks).toContain('Add try-catch to all endpoints');
      expect(record!.newTasks).toContain('Add error response schema');
      expect(record!.result).toBe('gap-remaining');
    });

    it('appends record to pipeline.pdcaCycles (AC-D05.4)', async () => {
      const pipeline = createPipeline();
      const event = createGapEvent(pipeline.instanceId);

      driver.handleGapFound(pipeline, event);

      expect(pipeline.pdcaCycles).toHaveLength(1);
      expect(pipeline.pdcaCycles![0]!.cycle).toBe(1);
    });

    it('emits pdca-cycle-started event (AC-D05.3)', async () => {
      const pipeline = createPipeline();
      const event = createGapEvent(pipeline.instanceId);

      driver.handleGapFound(pipeline, event);

      expect(eventSink.events).toHaveLength(1);
      expect(eventSink.events[0]!.event).toBe('pdca-cycle-started');

      const payload = eventSink.events[0]!.payload as PdcaCycleStartedEvent;
      expect(payload.pipelineId).toBe('pipeline-pdca-001');
      expect(payload.cycle).toBe(1);
      expect(payload.triggeredBy.length).toBeGreaterThan(0);
      expect(payload.newTasks.length).toBeGreaterThan(0);
    });

    it('increments cycle number on subsequent calls', async () => {
      const pipeline = createPipeline();
      const event = createGapEvent(pipeline.instanceId);

      driver.handleGapFound(pipeline, event);
      driver.handleGapFound(pipeline, event);

      expect(pipeline.pdcaCycles).toHaveLength(2);
      expect(pipeline.pdcaCycles![0]!.cycle).toBe(1);
      expect(pipeline.pdcaCycles![1]!.cycle).toBe(2);
    });
  });

  describe('handleOkrCheckWithGaps (AC-D05.1)', () => {
    it('creates cycle from OKR check event with unachieved KRs', async () => {
      const pipeline = createPipeline();
      const event = createOkrCheckEvent(pipeline.instanceId);

      const record = driver.handleOkrCheckWithGaps(pipeline, event);

      expect(record).not.toBeNull();
      expect(record!.cycle).toBe(1);
      expect(record!.triggeredBy[0]).toContain('KR-01');
      expect(record!.newTasks).toContain('Fix remaining P0 bugs');
    });

    it('returns null when no unachieved KRs', async () => {
      const pipeline = createPipeline();
      const event: OkrCheckCompletedEvent = {
        ...createOkrCheckEvent(pipeline.instanceId),
        unachievedKrs: [],
      };

      const record = driver.handleOkrCheckWithGaps(pipeline, event);
      expect(record).toBeNull();
      expect(eventSink.events).toHaveLength(0);
    });
  });

  describe('notifyFixComplete', () => {
    it('marks converged when gaps closed (AC-D05.5)', async () => {
      const pipeline = createPipeline();
      const event = createGapEvent(pipeline.instanceId);
      driver.handleGapFound(pipeline, event);

      const result = driver.notifyFixComplete(pipeline, true);

      expect(result.result).toBe('converged');
      expect(result.shouldContinue).toBe(false);
      expect(pipeline.pdcaCycles![0]!.result).toBe('converged');
    });

    it('marks gap-remaining and continues when gaps exist (AC-D05.4)', async () => {
      const pipeline = createPipeline();
      const event = createGapEvent(pipeline.instanceId);
      driver.handleGapFound(pipeline, event);

      const result = driver.notifyFixComplete(pipeline, false);

      expect(result.result).toBe('gap-remaining');
      expect(result.shouldContinue).toBe(true);
      expect(pipeline.pdcaCycles![0]!.result).toBe('gap-remaining');
    });

    it('marks escalated when max cycles reached (AC-D05.6)', async () => {
      const pipeline = createPipeline();
      const event = createGapEvent(pipeline.instanceId);

      // Fill up to max cycles
      for (let i = 0; i < 5; i++) {
        driver.handleGapFound(pipeline, event);
      }

      const result = driver.notifyFixComplete(pipeline, false);

      expect(result.result).toBe('escalated');
      expect(result.shouldContinue).toBe(false);
    });

    it('emits pdca-escalated event on max cycles (AC-D05.6)', async () => {
      const pipeline = createPipeline();
      const event = createGapEvent(pipeline.instanceId);

      for (let i = 0; i < 5; i++) {
        driver.handleGapFound(pipeline, event);
      }

      eventSink.events.length = 0; // Clear cycle-started events
      driver.notifyFixComplete(pipeline, false);

      const escalateEvents = eventSink.events.filter((e) => e.event === 'pdca-escalated');
      expect(escalateEvents).toHaveLength(1);

      const payload = escalateEvents[0]!.payload as PdcaEscalatedEvent;
      expect(payload.totalCycles).toBe(5);
      expect(payload.maxCycles).toBe(5);
    });

    it('returns converged with no cycles (edge case)', async () => {
      const pipeline = createPipeline({ pdcaCycles: [] });
      const result = driver.notifyFixComplete(pipeline, true);
      expect(result.result).toBe('converged');
      expect(result.shouldContinue).toBe(false);
    });
  });

  describe('max cycles enforcement (AC-D05.6, AC-D05.7)', () => {
    it('refuses to start cycle beyond max (returns null)', async () => {
      const pipeline = createPipeline();
      const event = createGapEvent(pipeline.instanceId);

      // Fill to max
      for (let i = 0; i < 5; i++) {
        driver.handleGapFound(pipeline, event);
      }

      eventSink.events.length = 0;
      const record = driver.handleGapFound(pipeline, event);

      expect(record).toBeNull();
      expect(pipeline.pdcaCycles).toHaveLength(5); // Not 6
    });

    it('emits pdca-escalated when trying to exceed max', async () => {
      const pipeline = createPipeline();
      const event = createGapEvent(pipeline.instanceId);

      for (let i = 0; i < 5; i++) {
        driver.handleGapFound(pipeline, event);
      }

      eventSink.events.length = 0;
      driver.handleGapFound(pipeline, event);

      expect(eventSink.events[0]!.event).toBe('pdca-escalated');
    });

    it('respects custom maxCycles config (AC-D05.7)', async () => {
      const customDriver = new PdcaAutoDriver({
        eventSink,
        maxCycles: 3,
        now: () => '2026-05-08T10:00:00Z',
      });

      expect(customDriver.getMaxCycles()).toBe(3);

      const pipeline = createPipeline();
      const event = createGapEvent(pipeline.instanceId);

      for (let i = 0; i < 3; i++) {
        customDriver.handleGapFound(pipeline, event);
      }

      const record = customDriver.handleGapFound(pipeline, event);
      expect(record).toBeNull();
    });
  });

  describe('generateSummaryReport (AC-D05.8)', () => {
    it('generates summary with all cycles', async () => {
      const pipeline = createPipeline();
      const event = createGapEvent(pipeline.instanceId);

      driver.handleGapFound(pipeline, event);
      driver.handleGapFound(pipeline, event);
      driver.notifyFixComplete(pipeline, true); // Mark last as converged

      const report = driver.generateSummaryReport(pipeline);

      expect(report.pipelineId).toBe('pipeline-pdca-001');
      expect(report.cycles).toHaveLength(2);
      expect(report.finalResult).toBe('converged');
      expect(report.generatedAt).toBe('2026-05-08T10:00:00Z');
    });

    it('reports escalated when last cycle is escalated', async () => {
      const pipeline = createPipeline();
      const event = createGapEvent(pipeline.instanceId);

      for (let i = 0; i < 5; i++) {
        driver.handleGapFound(pipeline, event);
      }
      driver.notifyFixComplete(pipeline, false); // Escalate

      const report = driver.generateSummaryReport(pipeline);
      expect(report.finalResult).toBe('escalated');
    });

    it('includes triggeredBy and newTasks in each cycle (AC-D05.2)', async () => {
      const pipeline = createPipeline();
      const event = createGapEvent(pipeline.instanceId);

      driver.handleGapFound(pipeline, event);

      const report = driver.generateSummaryReport(pipeline);
      expect(report.cycles[0]!.triggeredBy.length).toBeGreaterThan(0);
      expect(report.cycles[0]!.newTasks.length).toBeGreaterThan(0);
    });
  });

  describe('CLI degradation (AC-D05.10)', () => {
    it('outputs cycle info to CLI when adapter provided', async () => {
      const cliOutput = createMockCliOutput();
      const driverWithCli = new PdcaAutoDriver({
        eventSink,
        cliOutput,
        now: () => '2026-05-08T10:00:00Z',
      });

      const pipeline = createPipeline();
      const event = createGapEvent(pipeline.instanceId);

      driverWithCli.handleGapFound(pipeline, event);

      expect(cliOutput.lines.length).toBeGreaterThan(0);
      expect(cliOutput.lines.some((l) => l.includes('PDCA'))).toBe(true);
      expect(cliOutput.lines.some((l) => l.includes('Cycle 1'))).toBe(true);
      expect(cliOutput.lines.some((l) => l.includes('Fix tasks'))).toBe(true);
    });

    it('outputs escalation warning to CLI', async () => {
      const cliOutput = createMockCliOutput();
      const driverWithCli = new PdcaAutoDriver({
        eventSink,
        maxCycles: 2,
        cliOutput,
        now: () => '2026-05-08T10:00:00Z',
      });

      const pipeline = createPipeline();
      const event = createGapEvent(pipeline.instanceId);

      driverWithCli.handleGapFound(pipeline, event);
      driverWithCli.handleGapFound(pipeline, event);
      driverWithCli.notifyFixComplete(pipeline, false);

      expect(cliOutput.lines.some((l) => l.includes('Escalation'))).toBe(true);
    });
  });

  describe('getMaxCycles (AC-D05.7)', () => {
    it('returns default 5', async () => {
      expect(driver.getMaxCycles()).toBe(5);
    });

    it('returns custom value', async () => {
      const custom = new PdcaAutoDriver({ eventSink, maxCycles: 10 });
      expect(custom.getMaxCycles()).toBe(10);
    });
  });

  describe('pipeline without pdcaCycles array', () => {
    it('initializes pdcaCycles array if missing', async () => {
      const pipeline = createPipeline({ pdcaCycles: undefined });
      const event = createGapEvent(pipeline.instanceId);

      driver.handleGapFound(pipeline, event);

      expect(pipeline.pdcaCycles).toBeDefined();
      expect(pipeline.pdcaCycles).toHaveLength(1);
    });
  });
});
