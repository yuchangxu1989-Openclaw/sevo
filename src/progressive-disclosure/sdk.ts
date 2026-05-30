/**
 * L3 Progressive Disclosure — Programmatic SDK API.
 *
 * Provides a code-level interface for controlling SEVO pipelines.
 * Users can create pipelines, advance stages, query status, and
 * manage the full lifecycle programmatically.
 *
 * (spec §FR-15, AC-15.4)
 */

import type {
  StageId,
  TaskLevel,
  StageResult,
  ArtifactRef,
} from '../types/index.js';
import type { ActionLevelConfig, ActionLevel } from '../config.js';
import { DEFAULT_ACTION_LEVELS } from '../config.js';
import {
  PipelineEngineFacade,
  type PipelineSummary,
  type AdvanceResult,
  type PipelineEngineFacadeOptions,
  type PipelineLifecycle,
} from '../pipeline/pipeline-engine.js';
import { CustomStageRegistry, type CustomStageDefinition } from './custom-stage.js';

// ── SDK Types ───────────────────────────────────────────────────

/** Options for creating a pipeline via the SDK. */
export interface CreatePipelineOptions {
  slug: string;
  description: string;
  level: TaskLevel;
}

/** Options for completing a stage via the SDK. */
export interface CompleteStageOptions {
  pipelineId: string;
  stageId: StageId;
  outcome: 'passed' | 'failed';
  artifacts?: ArtifactRef[];
  failureReason?: string;
}

/** Pipeline status returned by the SDK. */
export interface PipelineStatusInfo {
  pipelineId: string;
  slug: string;
  description: string;
  level: TaskLevel;
  lifecycle: PipelineLifecycle;
  currentStage: StageId | null;
  stages: StageId[];
  createdAt: string;
  updatedAt: string;
}

/** SDK configuration options. */
export interface SevoSDKOptions {
  /** Options passed to the underlying PipelineEngine. */
  engineOptions?: PipelineEngineFacadeOptions;
}

// ── SevoSDK ─────────────────────────────────────────────────────

/**
 * Programmatic SDK for controlling SEVO pipelines (L3 Progressive Disclosure).
 *
 * Wraps PipelineEngineFacade and CustomStageRegistry into a unified,
 * user-facing API surface.
 *
 * Core operations:
 * - createPipeline(): Create a new pipeline
 * - advanceStage(): Advance to the next stage
 * - completeStage(): Complete a stage with a result
 * - getStatus(): Query pipeline status
 * - pause() / resume() / cancel(): Lifecycle management
 * - registerCustomStage(): L2 custom stage registration
 */
export class SevoSDK {
  private readonly engine: PipelineEngineFacade;
  private readonly customStages: CustomStageRegistry;

  constructor(options?: SevoSDKOptions) {
    this.engine = new PipelineEngineFacade(options?.engineOptions);
    this.customStages = new CustomStageRegistry();
  }

  // ── Pipeline Lifecycle ──────────────────────────────────────

  /**
   * Create a new pipeline.
   * Routes the task based on level and initializes the stage queue.
   */
  async createPipeline(options: CreatePipelineOptions): Promise<PipelineStatusInfo> {
    const summary = await this.engine.createPipeline(
      options.slug,
      options.description,
      options.level,
    );
    return this.toStatusInfo(summary);
  }

  /**
   * Advance a pipeline to the next stage.
   * If the pipeline is in 'created' state, activates the first stage.
   * If running, evaluates the current gate and advances if passed.
   */
  advanceStage(pipelineId: string): AdvanceResult {
    return this.engine.advance(pipelineId);
  }

  /**
   * Complete a stage with a result, then auto-advance.
   * This is the primary API for driving the pipeline forward.
   */
  completeStage(options: CompleteStageOptions): AdvanceResult {
    const stageResult: StageResult = {
      stageId: options.stageId,
      outcome: options.outcome,
      artifacts: options.artifacts ?? [],
      failureReason: options.failureReason,
    };
    return this.engine.completeStage(options.pipelineId, stageResult);
  }

  /**
   * Get the current status of a pipeline.
   */
  getStatus(pipelineId: string): PipelineStatusInfo {
    return this.toStatusInfo(this.engine.getStatus(pipelineId));
  }

  /**
   * List all pipelines.
   */
  listPipelines(): PipelineStatusInfo[] {
    return this.engine.listPipelines().map((s) => this.toStatusInfo(s));
  }

  /**
   * Pause a running pipeline.
   */
  pause(pipelineId: string): PipelineStatusInfo {
    return this.toStatusInfo(this.engine.pause(pipelineId));
  }

  /**
   * Resume a paused pipeline.
   */
  resume(pipelineId: string): PipelineStatusInfo {
    return this.toStatusInfo(this.engine.resume(pipelineId));
  }

  /**
   * Cancel a pipeline.
   */
  cancel(pipelineId: string): PipelineStatusInfo {
    return this.toStatusInfo(this.engine.cancel(pipelineId));
  }

  // ── Custom Stage Management (L2 bridge) ─────────────────────

  /**
   * Register a custom stage (L2 capability exposed via L3 API).
   */
  registerCustomStage(definition: CustomStageDefinition) {
    return this.customStages.register(definition);
  }

  /**
   * Unregister a custom stage.
   */
  unregisterCustomStage(stageId: string): boolean {
    return this.customStages.unregister(stageId);
  }

  /**
   * List all registered custom stages.
   */
  listCustomStages(): CustomStageDefinition[] {
    return this.customStages.list();
  }

  /**
   * AC-15.7: Classify an operation into an action level.
   * Returns the level (L0/L1/L2) and whether confirmation is required.
   */
  classifyAction(
    operation: string,
    customLevels?: ActionLevelConfig,
  ): { level: ActionLevel; requiresConfirmation: boolean; notifyAfter: boolean } {
    const levels = customLevels ?? DEFAULT_ACTION_LEVELS;
    const normalizedOp = operation.toLowerCase().trim();
    if (levels.L2.some((op) => op.toLowerCase().trim() === normalizedOp)) {
      return { level: 'L2', requiresConfirmation: true, notifyAfter: false };
    }
    if (levels.L1.some((op) => op.toLowerCase().trim() === normalizedOp)) {
      return { level: 'L1', requiresConfirmation: false, notifyAfter: true };
    }
    return { level: 'L0', requiresConfirmation: false, notifyAfter: false };
  }

  // ── Underlying engine access (advanced) ─────────────────────

  /**
   * Get the underlying PipelineEngineFacade for advanced operations.
   */
  getEngine(): PipelineEngineFacade {
    return this.engine;
  }

  /**
   * Get the custom stage registry for direct manipulation.
   */
  getCustomStageRegistry(): CustomStageRegistry {
    return this.customStages;
  }

  // ── Private ─────────────────────────────────────────────────

  private toStatusInfo(summary: PipelineSummary): PipelineStatusInfo {
    return {
      pipelineId: summary.pipelineId,
      slug: summary.slug,
      description: summary.description,
      level: summary.level,
      lifecycle: summary.lifecycle,
      currentStage: summary.currentStage,
      stages: summary.stages,
      createdAt: summary.createdAt,
      updatedAt: summary.updatedAt,
    };
  }
}
