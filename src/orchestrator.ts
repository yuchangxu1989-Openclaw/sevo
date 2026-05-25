/**
 * SEVO Orchestrator — thin integration layer connecting Router, Pipeline,
 * Gate, and Ledger engines (arc42 §5, §6).
 *
 * No business logic lives here; this is pure module-to-module glue.
 */

import type {
  TaskScope,
  PipelineState,
  StageResult,
  StageTransition,
  ReviewBundle,
  GateVerdict,
  LedgerEntry,
  LedgerFilter,
  Result,
  RouterError,
} from './types/index.js';
import type { ClarificationCoordinator } from './clarification/index.js';

import { route } from './router/index.js';
import { PipelineEngine } from './pipeline/index.js';
import { evaluate } from './gate/index.js';
import { LedgerEngine } from './ledger/index.js';

export class SevoOrchestrator {
  private readonly pipeline: PipelineEngine;
  private readonly ledger: LedgerEngine;

  constructor(basePath: string, clarificationCoordinator?: ClarificationCoordinator) {
    this.pipeline = new PipelineEngine(basePath, { clarificationCoordinator });
    this.ledger = new LedgerEngine(basePath);
  }

  /**
   * Create a new SEVO pipeline: classify → plan stages → persist.
   */
  async createPipeline(
    taskId: string,
    title: string,
    scope?: TaskScope,
  ): Promise<Result<PipelineState>> {
    const routingResult = await route({
      taskId,
      title,
      scope: scope ?? {},
    });

    if (!routingResult.ok) {
      return routingResult as Result<PipelineState>;
    }

    const state = this.pipeline.create(routingResult.value);
    return { ok: true, value: state };
  }

  /**
   * Advance a stage within a pipeline.
   */
  advanceStage(
    pipelineId: string,
    stageResult: StageResult,
  ): StageTransition {
    return this.pipeline.advance(pipelineId, stageResult);
  }

  /**
   * Read the persisted pipeline state.
   */
  getPipelineState(pipelineId: string): PipelineState {
    return this.pipeline.load(pipelineId);
  }

  /**
   * Evaluate a gate with review bundles.
   */
  evaluateGate(
    gateId: string,
    reviews: ReviewBundle[],
  ): Result<GateVerdict> {
    return evaluate(gateId, reviews);
  }

  /**
   * Record a pipeline's delivery to the ledger.
   */
  recordDelivery(pipelineId: string): LedgerEntry {
    return this.ledger.record(pipelineId);
  }

  /**
   * Query ledger history.
   */
  queryHistory(filter: LedgerFilter): LedgerEntry[] {
    return this.ledger.query(filter);
  }
}
