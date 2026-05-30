/**
 * FR-D03: Post-Release Auto Gap Scan.
 *
 * Automatically triggers PostReleaseValidation after verify stage passes.
 * On gaps > 0, generates fixTasks, emits events, and triggers back-edge
 * to implement stage for another PDCA cycle.
 *
 * (spec §FR-D03, AC-D03.1 through AC-D03.8)
 */

import type { ArtifactRef } from '../types/index.js';
import type { PdcaCycleRecord } from '../types/index.js';
import { PostReleaseValidationStage } from '../stages/post-release-validation-stage.js';
import type {
  PostReleaseValidationInput,
  PostReleaseValidationOutput,
  GapAnalysisReport,
} from '../stages/post-release-validation-types.js';
import type { BackEdgeRecord } from './types.js';

/** Result of the auto gap scan. */
export interface AutoGapScanResult {
  /** The gap analysis report. */
  report: GapAnalysisReport;
  /** Whether the pipeline can proceed (gaps = 0). */
  canComplete: boolean;
  /** Fix tasks generated when gaps > 0. */
  fixTasks: Array<{ frId: string; description: string }>;
  /** Current PDCA cycle number. */
  cycle: number;
  /** Back-edge record if triggered. */
  backEdge: BackEdgeRecord | null;
}

/**
 * PostReleaseAutoScanner — triggers gap scan after verify passes.
 *
 * AC-D03.1: Auto-triggers without manual call.
 * AC-D03.2: Reuses FR-17 PostReleaseValidationStage semantics.
 * AC-D03.3: Emits post-release-passed when gaps = 0.
 * AC-D03.4: Emits post-release-gap-found with fixTasks when gaps > 0.
 * AC-D03.5: Auto-triggers back-edge on gaps > 0.
 * AC-D03.6: Stage queue re-arranged after back-edge.
 * AC-D03.7: Cycle number tracked in pdcaCycles.
 * AC-D03.8: Preserves existing artifacts and records.
 */
export class PostReleaseAutoScanner {
  private readonly validationStage: PostReleaseValidationStage;
  private readonly maxCycles: number;

  constructor(maxCycles: number = 3) {
    this.validationStage = new PostReleaseValidationStage();
    this.maxCycles = maxCycles;
  }

  /**
   * Execute the auto gap scan.
   *
   * AC-D03.1: Called automatically when verify passes.
   * AC-D03.2: Delegates to PostReleaseValidationStage (FR-17 semantics).
   */
  scan(input: PostReleaseValidationInput, currentCycle: number = 1): AutoGapScanResult {
    // AC-D03.2: Reuse FR-17 validation semantics
    const output: PostReleaseValidationOutput = this.validationStage.run(input);

    const result: AutoGapScanResult = {
      report: output.report,
      canComplete: output.canComplete,
      fixTasks: output.fixTasks,
      cycle: currentCycle,
      backEdge: null,
    };

    // AC-D03.4 + AC-D03.5: Generate back-edge on gaps > 0
    if (!output.canComplete) {
      result.backEdge = this.generateBackEdge(currentCycle, output.fixTasks);
    }

    return result;
  }

  /**
   * Check if more PDCA cycles are allowed.
   */
  canContinueCycle(currentCycle: number): boolean {
    return currentCycle < this.maxCycles;
  }

  /**
   * Get the max cycles configuration.
   */
  getMaxCycles(): number {
    return this.maxCycles;
  }

  /**
   * Build the stage queue after a back-edge (AC-D03.6).
   * Returns the re-arranged stage sequence for the next cycle.
   */
  buildBackEdgeStageQueue(): readonly string[] {
    // AC-D03.6: implement → review → deploy → verify → post-release-validation
    return [
      'implement',
      'review',
      'deploy',
      'verify',
      'post-release-validation',
    ] as const;
  }

  /**
   * Create a PdcaCycleRecord for the current cycle (AC-D03.7).
   */
  createCycleRecord(
    cycle: number,
    fixTasks: Array<{ frId: string; description: string }>,
    converged: boolean,
  ): PdcaCycleRecord {
    return {
      cycle,
      triggeredBy: fixTasks.map((t) => t.frId),
      newTasks: fixTasks.map((t) => t.description),
      result: converged
        ? 'converged'
        : cycle >= this.maxCycles
          ? 'escalated'
          : 'gap-remaining',
    };
  }

  // ── Private helpers ───────────────────────────────────────────

  /**
   * Generate a back-edge record (AC-D03.5, AC-D03.7).
   */
  private generateBackEdge(
    cycle: number,
    fixTasks: Array<{ frId: string; description: string }>,
  ): BackEdgeRecord {
    return {
      triggeredAt: new Date().toISOString(),
      cycle,
      reason: `Post-release gap scan found ${fixTasks.length} gap(s) at cycle ${cycle}`,
      fixTasks,
    };
  }
}
