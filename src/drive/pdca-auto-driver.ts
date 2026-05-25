/**
 * FR-D05: PDCA Cycle Auto-Driver.
 *
 * Listens for gap events (FR-D03 post-release-gap-found, FR-D04 okr-check-completed
 * with unachieved KRs) and automatically drives PDCA cycles until convergence
 * or escalation.
 *
 * Design:
 * - Reuses PdcaCycleRecord from FR-18 types.
 * - Each cycle records triggeredBy + newTasks + result.
 * - Terminates when gap=0 (converged) or max cycles reached (escalated).
 * - Emits pdca-cycle-started per cycle, pdca-escalated on limit breach.
 * - Single-agent mode: degrades to CLI output listing fix tasks.
 */

import type { PdcaCycleRecord, PipelineInstance } from '../types/index.js';
import type {
  PostReleaseGapFoundEvent,
  OkrCheckCompletedEvent,
  PdcaCycleStartedEvent,
  PdcaEscalatedEvent,
  PdcaSummaryReport,
  DriveEventType,
} from './types.js';

// ── Adapter interfaces ──────────────────────────────────────────

/** Event sink for PDCA auto-driver emissions. */
export interface PdcaDriverEventSink {
  emit(event: DriveEventType, payload: PdcaCycleStartedEvent | PdcaEscalatedEvent): void;
}

/** CLI output adapter for single-agent degradation (AC-D05.10). */
export interface PdcaCliOutputAdapter {
  write(message: string): void;
}

// ── Options ─────────────────────────────────────────────────────

export interface PdcaAutoDriverOptions {
  /** Event sink for pushing cycle events. */
  eventSink: PdcaDriverEventSink;
  /** Maximum PDCA cycles before escalation. Default: 5. */
  maxCycles?: number;
  /** CLI output for single-agent degradation. */
  cliOutput?: PdcaCliOutputAdapter;
  /** Clock override for testing. */
  now?: () => string;
}

// ── Trigger context ─────────────────────────────────────────────

/** Context for triggering a PDCA cycle. */
export interface PdcaTriggerContext {
  /** Source event type that triggered this cycle. */
  source: 'post-release-gap-found' | 'okr-check-completed';
  /** Human-readable reasons (KR IDs or FR gap descriptions). */
  triggeredBy: string[];
  /** Task identifiers extracted from fixTasks or suggestedTasks. */
  newTasks: string[];
}

// ── PDCA Auto-Driver ────────────────────────────────────────────

export class PdcaAutoDriver {
  private readonly eventSink: PdcaDriverEventSink;
  private readonly maxCycles: number;
  private readonly cliOutput?: PdcaCliOutputAdapter;
  private readonly now: () => string;

  constructor(options: PdcaAutoDriverOptions) {
    this.eventSink = options.eventSink;
    this.maxCycles = options.maxCycles ?? 5;
    this.cliOutput = options.cliOutput;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /**
   * Handle a post-release-gap-found event (FR-D03 → FR-D05 trigger).
   * AC-D05.1: Auto-creates PdcaCycleRecord and appends to pipeline.
   */
  handleGapFound(
    pipeline: PipelineInstance,
    event: PostReleaseGapFoundEvent,
  ): PdcaCycleRecord | null {
    const triggeredBy = event.fixTasks.map((t) => `${t.frId}: ${t.description}`);
    const newTasks = event.fixTasks.map((t) => t.description);

    return this.startCycle(pipeline, {
      source: 'post-release-gap-found',
      triggeredBy,
      newTasks,
    });
  }

  /**
   * Handle an okr-check-completed event with unachieved KRs (FR-D04 → FR-D05 trigger).
   * AC-D05.1: Auto-creates PdcaCycleRecord and appends to pipeline.
   */
  handleOkrCheckWithGaps(
    pipeline: PipelineInstance,
    event: OkrCheckCompletedEvent,
  ): PdcaCycleRecord | null {
    if (event.unachievedKrs.length === 0) {
      return null; // No gaps, no cycle needed
    }

    const triggeredBy = event.unachievedKrs.map(
      (kr) => `${kr.krId}: ${kr.krDescription} (status: ${kr.status})`,
    );
    const newTasks = event.unachievedKrs.flatMap(
      (kr) => kr.suggestedTasks.map((t) => t.title),
    );

    return this.startCycle(pipeline, {
      source: 'okr-check-completed',
      triggeredBy,
      newTasks,
    });
  }

  /**
   * Notify the driver that fix tasks for a cycle are complete.
   * AC-D05.4: Auto-triggers next scan or terminates.
   *
   * @param pipeline - Current pipeline state (with updated pdcaCycles).
   * @param gapsClosed - Whether all gaps are now resolved.
   * @returns The cycle result and whether the loop should continue.
   */
  notifyFixComplete(
    pipeline: PipelineInstance,
    gapsClosed: boolean,
  ): { result: PdcaCycleRecord['result']; shouldContinue: boolean } {
    const cycles = pipeline.pdcaCycles ?? [];
    const currentCycle = cycles[cycles.length - 1];

    if (!currentCycle) {
      return { result: 'converged', shouldContinue: false };
    }

    if (gapsClosed) {
      // AC-D05.5: All gaps closed → converged
      currentCycle.result = 'converged';
      return { result: 'converged', shouldContinue: false };
    }

    if (cycles.length >= this.maxCycles) {
      // AC-D05.6: Max cycles reached → escalated
      currentCycle.result = 'escalated';

      const escalateEvent: PdcaEscalatedEvent = {
        pipelineId: pipeline.instanceId,
        totalCycles: cycles.length,
        maxCycles: this.maxCycles,
        timestamp: this.now(),
      };
      this.eventSink.emit('pdca-escalated', escalateEvent);

      if (this.cliOutput) {
        this.cliOutput.write(
          `\n[SEVO PDCA] ⚠️ Escalation: ${cycles.length} cycles reached max (${this.maxCycles}). Human intervention recommended.`,
        );
      }

      return { result: 'escalated', shouldContinue: false };
    }

    // AC-D05.4: Gap remaining, continue loop
    currentCycle.result = 'gap-remaining';
    return { result: 'gap-remaining', shouldContinue: true };
  }

  /**
   * Generate PDCA Summary Report after loop termination.
   * AC-D05.8: Summarizes all cycles with triggeredBy, newTasks, result.
   * AC-D05.9: Suitable for Ledger evidence chain (FR-10).
   */
  generateSummaryReport(pipeline: PipelineInstance): PdcaSummaryReport {
    const cycles = pipeline.pdcaCycles ?? [];
    const lastCycle = cycles[cycles.length - 1];
    const finalResult: PdcaSummaryReport['finalResult'] =
      lastCycle?.result === 'converged' ? 'converged' : 'escalated';

    return {
      pipelineId: pipeline.instanceId,
      cycles: cycles.map((c) => ({
        cycle: c.cycle,
        triggeredBy: c.triggeredBy,
        newTasks: c.newTasks,
        result: c.result,
      })),
      finalResult,
      generatedAt: this.now(),
    };
  }

  /**
   * Get the configured maximum cycles.
   * AC-D05.7: Configurable via sevo.config.json maxPdcaCycles.
   */
  getMaxCycles(): number {
    return this.maxCycles;
  }

  // ── Private ─────────────────────────────────────────────────────

  /**
   * Start a new PDCA cycle.
   * AC-D05.1: Creates PdcaCycleRecord.
   * AC-D05.2: Records triggeredBy and newTasks.
   * AC-D05.3: Emits pdca-cycle-started event.
   * AC-D05.4: Appends to pipeline.pdcaCycles.
   */
  private startCycle(
    pipeline: PipelineInstance,
    context: PdcaTriggerContext,
  ): PdcaCycleRecord | null {
    // Initialize pdcaCycles array if needed
    if (!pipeline.pdcaCycles) {
      pipeline.pdcaCycles = [];
    }

    const cycleNumber = pipeline.pdcaCycles.length + 1;

    // Check if we've already hit the max before starting
    if (pipeline.pdcaCycles.length >= this.maxCycles) {
      const escalateEvent: PdcaEscalatedEvent = {
        pipelineId: pipeline.instanceId,
        totalCycles: pipeline.pdcaCycles.length,
        maxCycles: this.maxCycles,
        timestamp: this.now(),
      };
      this.eventSink.emit('pdca-escalated', escalateEvent);

      if (this.cliOutput) {
        this.cliOutput.write(
          `\n[SEVO PDCA] ⚠️ Cannot start cycle ${cycleNumber}: max cycles (${this.maxCycles}) already reached. Escalating.`,
        );
      }

      return null;
    }

    // AC-D05.1 + AC-D05.2: Create record
    const record: PdcaCycleRecord = {
      cycle: cycleNumber,
      triggeredBy: context.triggeredBy,
      newTasks: context.newTasks,
      result: 'gap-remaining', // Will be updated by notifyFixComplete
    };

    // AC-D05.4: Append to pipeline
    pipeline.pdcaCycles.push(record);

    // AC-D05.3: Emit event
    const timestamp = this.now();
    const startEvent: PdcaCycleStartedEvent = {
      pipelineId: pipeline.instanceId,
      cycle: cycleNumber,
      triggeredBy: context.triggeredBy,
      newTasks: context.newTasks,
      timestamp,
    };
    this.eventSink.emit('pdca-cycle-started', startEvent);

    // AC-D05.10: Single-agent CLI degradation
    if (this.cliOutput) {
      this.outputCycleToCli(startEvent);
    }

    return record;
  }

  /** Output cycle info to CLI for single-agent mode (AC-D05.10). */
  private outputCycleToCli(event: PdcaCycleStartedEvent): void {
    if (!this.cliOutput) return;

    this.cliOutput.write(`\n[SEVO PDCA] Cycle ${event.cycle} started (pipeline: ${event.pipelineId})`);
    this.cliOutput.write(`  Triggered by:`);
    for (const reason of event.triggeredBy) {
      this.cliOutput.write(`    - ${reason}`);
    }
    this.cliOutput.write(`  Fix tasks to execute:`);
    for (const task of event.newTasks) {
      this.cliOutput.write(`    → ${task}`);
    }
  }
}
