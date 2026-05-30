/**
 * FR-D04: OKR Achievement Periodic Checker.
 *
 * For pipelines with endStateGoal + OKR tree (FR-18), periodically checks
 * KR achievement status. Unachieved KRs get SMART decomposition suggestions
 * pushed via event bus. When all KRs are achieved, emits pipeline-converged.
 *
 * Design:
 * - Engine is the trigger, not the executor (Domain D principle).
 * - Check frequency configurable: daily / weekly / on-stage-complete.
 * - Single-agent mode: degrades to CLI output (AC-D04.8 non-blocking).
 */

import type {
  ObjectiveKeyResult,
  KeyResult,
  PipelineInstance,
} from '../types/index.js';
import type {
  OkrCheckInterval,
  OkrCheckReport,
  KrCheckResult,
  SmartTaskSuggestion,
  OkrCheckCompletedEvent,
  PipelineConvergedEvent,
  DriveEventType,
} from './types.js';

// ── Adapter interface ───────────────────────────────────────────

/** Adapter for emitting events to the host environment. */
export interface OkrCheckerEventSink {
  emit(event: DriveEventType, payload: OkrCheckCompletedEvent | PipelineConvergedEvent): void;
}

/** Optional LLM adapter for generating SMART suggestions. */
export interface SmartDecompositionAdapter {
  generateSmartTasks(kr: KeyResult): Promise<SmartTaskSuggestion[]>;
}

/** CLI output adapter for single-agent degradation (AC-D04.8). */
export interface CliOutputAdapter {
  write(message: string): void;
}

// ── Configuration ───────────────────────────────────────────────

export interface OkrPeriodicCheckerOptions {
  /** Event sink for pushing results to the host/dispatcher. */
  eventSink: OkrCheckerEventSink;
  /** Optional LLM adapter for SMART decomposition. Falls back to template-based. */
  smartAdapter?: SmartDecompositionAdapter;
  /** CLI output for single-agent degradation. */
  cliOutput?: CliOutputAdapter;
  /** Override check interval. Default read from config or 'daily'. */
  interval?: OkrCheckInterval;
  /** Clock override for testing. */
  now?: () => string;
}

// ── Checker implementation ──────────────────────────────────────

export class OkrPeriodicChecker {
  private readonly eventSink: OkrCheckerEventSink;
  private readonly smartAdapter?: SmartDecompositionAdapter;
  private readonly cliOutput?: CliOutputAdapter;
  private readonly interval: OkrCheckInterval;
  private readonly now: () => string;

  constructor(options: OkrPeriodicCheckerOptions) {
    this.eventSink = options.eventSink;
    this.smartAdapter = options.smartAdapter;
    this.cliOutput = options.cliOutput;
    this.interval = options.interval ?? 'daily';
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /**
   * Check if a pipeline should have OKR periodic checks registered.
   * AC-D04.6: No OKR tree → no check, no events, no side effects.
   */
  shouldCheck(pipeline: PipelineInstance): boolean {
    return !!(pipeline.endStateGoal && pipeline.okrTree && pipeline.okrTree.length > 0);
  }

  /**
   * Execute OKR achievement check for a pipeline instance.
   *
   * AC-D04.1: Auto-registered for pipelines with OKR tree.
   * AC-D04.3: Unachieved KRs get SMART suggestions.
   * AC-D04.4: Results pushed via okr-check-completed event.
   * AC-D04.5: All achieved → pipeline-converged event.
   * AC-D04.7: Report stored in pipeline metadata.
   * AC-D04.8: Non-blocking, async execution.
   */
  async check(pipeline: PipelineInstance): Promise<OkrCheckReport> {
    if (!this.shouldCheck(pipeline)) {
      throw new Error(
        `Pipeline '${pipeline.instanceId}' has no OKR tree; cannot run periodic check (AC-D04.6).`,
      );
    }

    const okrTree = pipeline.okrTree!;
    const timestamp = this.now();

    // Evaluate each KR
    const results: KrCheckResult[] = [];
    for (const objective of okrTree) {
      for (const kr of objective.keyResults) {
        if (kr.status === 'achieved') {
          // AC-D04 step 3: skip achieved KRs
          results.push({
            krId: kr.krId,
            krDescription: kr.description,
            status: kr.status,
            suggestedTasks: [],
          });
          continue;
        }

        // Generate SMART suggestions for unachieved KRs
        const suggestedTasks = await this.generateSmartSuggestions(kr);
        results.push({
          krId: kr.krId,
          krDescription: kr.description,
          status: kr.status,
          suggestedTasks,
        });
      }
    }

    const allAchieved = results.every((r) => r.status === 'achieved');

    const report: OkrCheckReport = {
      pipelineId: pipeline.instanceId,
      checkedAt: timestamp,
      interval: this.interval,
      results,
      allAchieved,
    };

    // Emit events
    const unachievedKrs = results.filter((r) => r.status !== 'achieved');

    const checkEvent: OkrCheckCompletedEvent = {
      pipelineId: pipeline.instanceId,
      report,
      unachievedKrs,
      timestamp,
    };
    this.eventSink.emit('okr-check-completed', checkEvent);

    // AC-D04.5: All KRs achieved → converged
    if (allAchieved) {
      const convergedEvent: PipelineConvergedEvent = {
        pipelineId: pipeline.instanceId,
        convergedAt: timestamp,
        okrCheckReport: report,
      };
      this.eventSink.emit('pipeline-converged', convergedEvent);
    }

    // Single-agent CLI degradation
    if (this.cliOutput) {
      this.outputToCli(report, unachievedKrs);
    }

    return report;
  }

  /**
   * Get the configured check interval.
   * AC-D04.2: Supports daily, weekly, on-stage-complete.
   */
  getInterval(): OkrCheckInterval {
    return this.interval;
  }

  // ── Private helpers ─────────────────────────────────────────────

  /**
   * Generate SMART task suggestions for an unachieved KR.
   * Uses LLM adapter if available; falls back to template-based generation.
   */
  private async generateSmartSuggestions(kr: KeyResult): Promise<SmartTaskSuggestion[]> {
    if (this.smartAdapter) {
      try {
        return await this.smartAdapter.generateSmartTasks(kr);
      } catch (err) {
        // P1-3 fix: LLM adapter failure should not crash the checker.
        // Degrade gracefully to template-based fallback and log warning.
        if (this.cliOutput) {
          const message = err instanceof Error ? err.message : String(err);
          this.cliOutput.write(`  ⚠️  SMART adapter failed for KR '${kr.krId}': ${message}. Using template fallback.`);
        }
      }
    }

    // Template-based fallback: one task per KR
    return [{
      title: `Achieve KR: ${kr.description}`,
      measure: kr.measure || 'completion',
      deadline: this.computeDefaultDeadline(),
    }];
  }

  /** Compute a default deadline (7 days from now). */
  private computeDefaultDeadline(): string {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0]!;
  }

  /** Output check results to CLI for single-agent mode (AC-D04.8 degradation). */
  private outputToCli(report: OkrCheckReport, unachievedKrs: KrCheckResult[]): void {
    if (!this.cliOutput) return;

    this.cliOutput.write(`\n[SEVO OKR Check] Pipeline: ${report.pipelineId}`);
    this.cliOutput.write(`  Interval: ${report.interval} | Checked at: ${report.checkedAt}`);

    if (report.allAchieved) {
      this.cliOutput.write('  ✅ All KRs achieved — pipeline converged.');
      return;
    }

    this.cliOutput.write(`  ⚠️  ${unachievedKrs.length} KR(s) not yet achieved:`);
    for (const kr of unachievedKrs) {
      this.cliOutput.write(`    - [${kr.status}] ${kr.krId}: ${kr.krDescription}`);
      for (const task of kr.suggestedTasks) {
        this.cliOutput.write(`      → ${task.title} (measure: ${task.measure}, deadline: ${task.deadline})`);
      }
    }
  }
}

// ── Config reader ───────────────────────────────────────────────

/**
 * Read DriveConfig from a raw config object.
 * Extracts drive-layer settings with defaults.
 */
export function readDriveConfig(config: Record<string, unknown>): import('./types.js').DriveConfig {
  const drive = (config['drive'] ?? config) as Record<string, unknown>;
  return {
    okrCheckInterval: (drive['okrCheckInterval'] as import('./types.js').OkrCheckInterval) ?? 'daily',
    maxPdcaCycles: (drive['maxPdcaCycles'] as number) ?? 5,
    smartSuggestionsEnabled: (drive['smartSuggestionsEnabled'] as boolean) ?? true,
  };
}
