/**
 * Pipeline From — FR-27 Flexible Stage Entry.
 *
 * Allows users to start a pipeline from any valid stage, skipping
 * all preceding stages. Reuses FR-12 pipeline creation logic.
 *
 * Entry points:
 *   - CLI: `sevo from <project-slug> <stage>`
 *   - Plugin: label containing `from:<stage>`
 *   - Programmatic: `createPipelineFromStage()`
 */

import type {
  PipelineInstance,
  PipelineTask,
  StageId,
  SkippedStage,
  Result,
} from '../types/index.js';
import type { PipelineCreateError } from '../types/index.js';
import { createPipelineInstance, type InstanceStore } from './pipeline-create.js';
import { ALL_STAGES } from '../constants.js';

// ── Valid Entry Stages (spec FR-27) ─────────────────────────────

/** Stages that are valid entry points for flexible stage entry. */
export const VALID_ENTRY_STAGES: readonly StageId[] = [
  'spec',
  'contract',
  'implement',
  'review',
  'deploy',
  'verify',
] as const;

/** Gate stages that cannot be used as entry points. */
export const GATE_STAGES: readonly StageId[] = [
  'spec-review-gate',
  'contract-review-gate',
  'publish-generalization-gate',
] as const;

/** Auxiliary stages that cannot be used as entry points. */
export const AUXILIARY_STAGES: readonly StageId[] = [
  'test-case-authoring',
  'ux-acceptance-authoring',
  'commercial-acceptance-authoring',
  'smoke-test',
  'ux-acceptance',
  'pm-commercial-review',
  'regression',
  'post-release-validation',
  'ledger',
] as const;

// ── Error Types ─────────────────────────────────────────────────

export type PipelineFromErrorCode =
  | 'INVALID_STAGE'
  | 'GATE_STAGE_NOT_ALLOWED'
  | 'PROJECT_NOT_FOUND'
  | 'SPEC_FILE_MISSING'
  | 'STAGE_NOT_IN_TIER'
  | PipelineCreateError['code'];

export interface PipelineFromError {
  code: PipelineFromErrorCode;
  message: string;
  activeInstanceId?: string;
}

// ── Request & Options ───────────────────────────────────────────

export interface PipelineFromRequest {
  projectSlug: string;
  stage: string;
  task: PipelineTask;
}

export interface PipelineFromOptions {
  store: InstanceStore;
  workspaceRoot: string;
  /** Check if project directory exists. */
  projectExists?: (workspaceRoot: string, projectSlug: string) => boolean;
  /** Check if spec file exists for the project. */
  specFileExists?: (workspaceRoot: string, projectSlug: string) => boolean;
  /** Check if architecture/contract file exists. */
  contractFileExists?: (workspaceRoot: string, projectSlug: string) => boolean;
  /** Get the tier's valid stages (for AC-27.9). Returns null if no tier restriction. */
  getTierStages?: (task: PipelineTask) => StageId[] | null;
  /** Override current date for testing. */
  now?: Date;
  /** Callback for warnings (e.g., missing contract file). */
  onWarning?: (message: string) => void;
}

// ── Validation ──────────────────────────────────────────────────

/** Check if a stage identifier is a valid entry point. */
export function isValidEntryStage(stage: string): stage is StageId {
  return (VALID_ENTRY_STAGES as readonly string[]).includes(stage);
}

/** Check if a stage identifier is a gate stage. */
export function isGateStage(stage: string): boolean {
  return (GATE_STAGES as readonly string[]).includes(stage);
}

// ── Label Parsing (AC-27.6) ─────────────────────────────────────

/**
 * Parse `from:<stage>` from a label string.
 * Returns the stage identifier or null if not found.
 */
export function parseFromLabel(label: string): string | null {
  const match = /(?:^|[\s:])from:([a-z-]+)/.exec(label);
  return match ? match[1]! : null;
}

/**
 * Parse `sevo:from <project> <stage>` command format.
 * Returns { projectSlug, stage } or null if format doesn't match.
 */
export function parseSevoFromCommand(input: string): { projectSlug: string; stage: string } | null {
  const match = /^sevo:from\s+([a-z0-9][a-z0-9-]*[a-z0-9])\s+([a-z-]+)$/.exec(input.trim());
  if (!match) return null;
  return { projectSlug: match[1]!, stage: match[2]! };
}

// ── Core Logic ──────────────────────────────────────────────────

/**
 * Compute which stages to skip when entering from a given stage.
 * Returns all stages in ALL_STAGES that come before the target stage.
 */
export function computeSkippedStages(entryStage: StageId): SkippedStage[] {
  const skipped: SkippedStage[] = [];
  const reason = `用户指定从 ${entryStage} 开始`;

  for (const stage of ALL_STAGES) {
    if (stage === entryStage) break;
    skipped.push({ stage, reason });
  }

  return skipped;
}

/**
 * Create a Pipeline Instance starting from a specific stage (FR-27).
 *
 * AC-27.7: If stage is 'spec', delegates directly to FR-12 createPipelineInstance.
 * AC-27.2: Stages before the entry point are marked as skipped.
 * AC-27.3: Subsequent stages proceed normally via FR-12 pipeline engine.
 */
export async function createPipelineFromStage(
  request: PipelineFromRequest,
  options: PipelineFromOptions,
): Promise<Result<PipelineInstance, PipelineFromError>> {
  const { projectSlug, stage, task } = request;
  const {
    store,
    workspaceRoot,
    projectExists,
    specFileExists,
    contractFileExists,
    getTierStages,
    now,
    onWarning,
  } = options;

  // ── AC-27.1: Validate stage identifier ──
  if (isGateStage(stage)) {
    return {
      ok: false,
      error: {
        code: 'GATE_STAGE_NOT_ALLOWED',
        message: `Stage "${stage}" is a gate stage and cannot be used as an entry point. Valid entry stages: ${VALID_ENTRY_STAGES.join(', ')}`,
      },
    };
  }

  if (!isValidEntryStage(stage)) {
    return {
      ok: false,
      error: {
        code: 'INVALID_STAGE',
        message: `Invalid stage "${stage}". Valid entry stages: ${VALID_ENTRY_STAGES.join(', ')}`,
      },
    };
  }

  // ── AC-27.7: If stage is 'spec', delegate to FR-12 ──
  if (stage === 'spec') {
    const result = await createPipelineInstance(
      { projectSlug, task },
      { store, workspaceRoot, now },
    );
    if (!result.ok) {
      return {
        ok: false,
        error: result.error as PipelineFromError,
      };
    }
    return result as Result<PipelineInstance, PipelineFromError>;
  }

  // ── AC-27.4a: Project must exist for non-spec entry ──
  if (projectExists && !projectExists(workspaceRoot, projectSlug)) {
    return {
      ok: false,
      error: {
        code: 'PROJECT_NOT_FOUND',
        message: `Project "${projectSlug}" does not exist. Only 'spec' stage is allowed for new projects (use 'sevo:from ${projectSlug} spec' or 'sevo create ${projectSlug}').`,
      },
    };
  }

  // ── AC-27.4b: Spec file must exist when skipping spec stage ──
  if (specFileExists && !specFileExists(workspaceRoot, projectSlug)) {
    return {
      ok: false,
      error: {
        code: 'SPEC_FILE_MISSING',
        message: `Cannot skip 'spec' stage: product-requirements.md not found for project "${projectSlug}". Run spec stage first or create the file manually.`,
      },
    };
  }

  // ── AC-27.4c: Warn if contract file missing when skipping contract ──
  const contractStageIndex = ALL_STAGES.indexOf('contract');
  const entryStageIndex = ALL_STAGES.indexOf(stage);
  if (
    entryStageIndex > contractStageIndex &&
    contractFileExists &&
    !contractFileExists(workspaceRoot, projectSlug) &&
    onWarning
  ) {
    onWarning(
      `Warning: No architecture/contract file found for project "${projectSlug}". ` +
      `Proceeding without contract documentation may reduce implementation quality.`,
    );
  }

  // ── AC-27.9: Tier stage compatibility check ──
  if (getTierStages) {
    const tierStages = getTierStages(task);
    if (tierStages && !tierStages.includes(stage as StageId)) {
      return {
        ok: false,
        error: {
          code: 'STAGE_NOT_IN_TIER',
          message: `Stage "${stage}" is not available for this task's tier. Available stages: ${tierStages.join(', ')}`,
        },
      };
    }
  }

  // ── AC-27.2 + AC-27.8: Create instance via FR-12 (handles conflict check) ──
  const createResult = await createPipelineInstance(
    { projectSlug, task },
    { store, workspaceRoot, now },
  );

  if (!createResult.ok) {
    return {
      ok: false,
      error: createResult.error as PipelineFromError,
    };
  }

  // ── AC-27.2: Mark preceding stages as skipped ──
  const instance = createResult.value;

  // ── Defensive: Validate target stage exists in this pipeline's required stages ──
  if (!instance.routingResult.requiredStages.includes(stage as StageId)) {
    return {
      ok: false,
      error: {
        code: 'STAGE_NOT_IN_TIER' as PipelineFromErrorCode,
        message: `Stage "${stage}" is not in this pipeline's stage list: ${instance.routingResult.requiredStages.join(', ')}. Check Tier routing.`,
      },
    };
  }

  const skippedStages = computeSkippedStages(stage as StageId);

  // Merge skipped stages from FR-27 with any from routing
  const existingSkippedIds = new Set(instance.routingResult.skippedStages.map(s => s.stage));
  for (const skip of skippedStages) {
    if (!existingSkippedIds.has(skip.stage)) {
      instance.routingResult.skippedStages.push(skip);
    }
  }

  // Update required stages: remove skipped ones
  const skippedIds = new Set(skippedStages.map(s => s.stage));
  instance.routingResult.requiredStages = instance.routingResult.requiredStages.filter(
    s => !skippedIds.has(s),
  );

  // Persist updated instance
  store.save(instance);

  return { ok: true, value: instance };
}
