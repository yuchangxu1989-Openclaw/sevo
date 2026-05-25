/**
 * Sevo Facade — unified entry point for the SEVO pipeline system.
 * Wraps TaskOrchestrator, StageRouter, GateEngine into a single API.
 * (arc42 §5, spec §FR-01/FR-02/FR-04)
 */

import type { GateVerdict, StageId } from './types/index.js';
import type { PipelineStatus, TaskPayload } from './orchestrator/pipeline-run.js';
import { PipelineRun } from './orchestrator/pipeline-run.js';
import { TaskOrchestrator } from './orchestrator/task-orchestrator.js';
import { StageRouter } from './router/stage-router.js';
import { GateEngine } from './gate/gate-engine.js';
import { createSpecReviewGateEngine } from './gate/default-spec-review-gate-engine.js';
import type { SemanticRuleOptions } from './gate/rules/semantic-rule-utils.js';
import type { SevoConfig } from './config.js';
import { validateConfig } from './config.js';

export interface SevoRuntimeOptions {
  /** Custom GateEngine override. If provided, default spec-review-gate rules are not registered. */
  gateEngine?: GateEngine;
  /** Options forwarded to default spec-review-gate semantic LLM rules. Ignored when gateEngine is provided. */
  specReviewGateRuleOptions?: SemanticRuleOptions;
}

export class Sevo {
  private readonly config: SevoConfig;
  private readonly options: SevoRuntimeOptions;
  private orchestrator: TaskOrchestrator | null = null;
  private initialized = false;

  constructor(config: SevoConfig, options: SevoRuntimeOptions = {}) {
    const validation = validateConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid SevoConfig: ${validation.errors.join('; ')}`);
    }
    this.config = config;
    this.options = options;
  }

  /** Initialize all sub-modules. Must be called before pipeline operations. */
  async init(): Promise<void> {
    if (this.initialized) return;

    const router = new StageRouter();
    const gateEngine = this.options.gateEngine ?? createSpecReviewGateEngine(this.options.specReviewGateRuleOptions);

    this.orchestrator = new TaskOrchestrator(router, gateEngine);
    this.initialized = true;
  }

  /** Start a new pipeline run. */
  startPipeline(payload: TaskPayload): PipelineRun {
    this.ensureInitialized();
    return this.orchestrator!.startPipeline(payload);
  }

  /** Evaluate the gate for the current stage of a run. */
  evaluateGate(runId: string): GateVerdict {
    this.ensureInitialized();
    const { verdict } = this.orchestrator!.evaluateAndAdvance(runId);
    return verdict;
  }

  /** Advance the pipeline to the next stage (evaluate + advance). Returns next stage or null. */
  advanceStage(runId: string): StageId | null {
    this.ensureInitialized();
    const { nextStage } = this.orchestrator!.evaluateAndAdvance(runId);
    return nextStage;
  }

  /** Async variant required by LLM semantic rules. */
  async evaluateGateAsync(runId: string): Promise<GateVerdict> {
    this.ensureInitialized();
    const { verdict } = await this.orchestrator!.evaluateAndAdvanceAsync(runId);
    return verdict;
  }

  /** Async variant required by LLM semantic rules. */
  async advanceStageAsync(runId: string): Promise<StageId | null> {
    this.ensureInitialized();
    const { nextStage } = await this.orchestrator!.evaluateAndAdvanceAsync(runId);
    return nextStage;
  }

  /** Get the current status of a pipeline run. */
  getPipelineStatus(runId: string): PipelineStatus {
    this.ensureInitialized();
    return this.orchestrator!.getPipelineStatus(runId);
  }

  /** Shutdown and release resources. */
  shutdown(): void {
    this.orchestrator = null;
    this.initialized = false;
  }

  /**
   * Convenience: run a full pipeline from start to completion or failure.
   * Automatically loops evaluate+advance until terminal or gate rejection.
   */
  async runFullPipeline(payload: TaskPayload): Promise<PipelineStatus> {
    this.ensureInitialized();
    const run = this.startPipeline(payload);
    const maxIterations = payload.stages.length * 2; // safety bound

    for (let i = 0; i < maxIterations; i++) {
      const { verdict, nextStage } = await this.orchestrator!.evaluateAndAdvanceAsync(run.runId);

      if (verdict.conclusion !== 'passed' || nextStage === null) {
        break;
      }
    }

    return this.getPipelineStatus(run.runId);
  }

  /** Get the underlying config. */
  getConfig(): Readonly<SevoConfig> {
    return this.config;
  }

  /** Get the runtime GateEngine after init. */
  getGateEngine(): GateEngine {
    this.ensureInitialized();
    return this.orchestrator!.getGateEngine();
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.orchestrator) {
      throw new Error('Sevo not initialized. Call init() first.');
    }
  }
}
