/**
 * L2 Progressive Disclosure — Custom Stage Registry.
 *
 * Allows users to define custom stages and insert them into the pipeline.
 * Custom stages are registered via configuration or API, and the
 * PipelineEngine recognizes them alongside built-in stages.
 *
 * (spec §FR-15, AC-15.3)
 */

import type { StageId, StageStatus, ArtifactRef, StageRecord } from '../types/index.js';
import { ALL_STAGES } from '../constants.js';

// ── Types ───────────────────────────────────────────────────────

/** Where to insert a custom stage relative to an anchor stage. */
export type InsertPosition = 'before' | 'after';

/** Definition of a custom stage that can be inserted into the pipeline. */
export interface CustomStageDefinition {
  /** Unique identifier for this custom stage. Must not collide with built-in stage IDs. */
  stageId: string;
  /** Human-readable name. */
  name: string;
  /** Optional description of what this stage does. */
  description?: string;
  /** Built-in stage to anchor insertion against. */
  anchorStage: StageId;
  /** Insert before or after the anchor stage. */
  position: InsertPosition;
  /** Optional custom gate rules for this stage. */
  gateRules?: CustomGateRule[];
}

/** A custom gate rule attached to a custom stage. */
export interface CustomGateRule {
  ruleId: string;
  severity: 'blocker' | 'warning';
  /** Human-readable description of what this rule checks. */
  description: string;
}

/** Result of registering a custom stage. */
export interface CustomStageRegistrationResult {
  success: boolean;
  stageId: string;
  errors: string[];
}

// ── Built-in stage ID set (for collision detection) ─────────────

const BUILT_IN_STAGE_IDS = new Set<string>(ALL_STAGES as readonly string[]);

// ── Custom Stage Registry ───────────────────────────────────────

/**
 * Registry for custom pipeline stages (L2 Progressive Disclosure).
 *
 * Manages registration, validation, and stage-sequence resolution
 * for user-defined stages.
 */
export class CustomStageRegistry {
  private readonly stages = new Map<string, CustomStageDefinition>();

  /**
   * Register a custom stage definition.
   *
   * Validates:
   * - stageId is non-empty and does not collide with built-in stages
   * - anchorStage is a valid built-in stage
   * - No duplicate registration
   */
  register(definition: CustomStageDefinition): CustomStageRegistrationResult {
    const errors: string[] = [];

    // Validate stageId
    if (!definition.stageId || definition.stageId.trim() === '') {
      errors.push('stageId must be a non-empty string');
    } else if (BUILT_IN_STAGE_IDS.has(definition.stageId)) {
      errors.push(`stageId '${definition.stageId}' collides with a built-in stage`);
    } else if (this.stages.has(definition.stageId)) {
      errors.push(`stageId '${definition.stageId}' is already registered`);
    }

    // Validate name
    if (!definition.name || definition.name.trim() === '') {
      errors.push('name must be a non-empty string');
    }

    // Validate anchorStage
    if (!BUILT_IN_STAGE_IDS.has(definition.anchorStage)) {
      errors.push(`anchorStage '${definition.anchorStage}' is not a valid built-in stage`);
    }

    // Validate position
    if (definition.position !== 'before' && definition.position !== 'after') {
      errors.push(`position must be 'before' or 'after', got '${definition.position as string}'`);
    }

    if (errors.length > 0) {
      return { success: false, stageId: definition.stageId, errors };
    }

    this.stages.set(definition.stageId, { ...definition });
    return { success: true, stageId: definition.stageId, errors: [] };
  }

  /**
   * Unregister a custom stage.
   * Returns true if the stage was found and removed.
   */
  unregister(stageId: string): boolean {
    return this.stages.delete(stageId);
  }

  /** Get a registered custom stage definition. */
  get(stageId: string): CustomStageDefinition | undefined {
    const def = this.stages.get(stageId);
    return def ? { ...def } : undefined;
  }

  /** List all registered custom stages. */
  list(): CustomStageDefinition[] {
    return Array.from(this.stages.values()).map((d) => ({ ...d }));
  }

  /** Check if a stage ID is a registered custom stage. */
  isCustomStage(stageId: string): boolean {
    return this.stages.has(stageId);
  }

  /** Clear all registered custom stages. */
  clear(): void {
    this.stages.clear();
  }

  /**
   * Resolve the full stage sequence by inserting custom stages
   * into the base stage list.
   *
   * Custom stages are inserted relative to their anchor stage.
   * Multiple custom stages anchored to the same stage are inserted
   * in registration order.
   */
  resolveStageSequence(baseStages: readonly StageId[]): string[] {
    const result: string[] = [...baseStages];

    // Sort custom stages by their anchor position in baseStages
    // to ensure deterministic insertion order
    const sorted = this.list().sort((a, b) => {
      const aIdx = baseStages.indexOf(a.anchorStage);
      const bIdx = baseStages.indexOf(b.anchorStage);
      if (aIdx !== bIdx) return aIdx - bIdx;
      // Same anchor: 'before' comes first
      if (a.position !== b.position) return a.position === 'before' ? -1 : 1;
      return 0;
    });

    // Insert in reverse order to preserve indices
    for (let i = sorted.length - 1; i >= 0; i--) {
      const def = sorted[i]!;
      const anchorIdx = result.indexOf(def.anchorStage);
      if (anchorIdx === -1) continue; // anchor not in this pipeline's stages

      const insertIdx = def.position === 'before' ? anchorIdx : anchorIdx + 1;
      result.splice(insertIdx, 0, def.stageId);
    }

    return result;
  }

  /**
   * Create a StageRecord for a custom stage (for pipeline state initialization).
   */
  createStageRecord(stageId: string): StageRecord | undefined {
    if (!this.stages.has(stageId)) return undefined;
    return {
      stageId: stageId as StageId,
      status: 'pending' as StageStatus,
      artifacts: [] as ArtifactRef[],
    };
  }
}
