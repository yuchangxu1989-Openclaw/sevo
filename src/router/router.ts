/**
 * Router — entry point for SEVO pipeline routing.
 *
 * Receives a PipelineTask, classifies its level, and produces a
 * RoutingResult with required/skipped stages and justifications.
 *
 * Sub-modules (arc42 §5.2.1):
 *   Rule Matcher    → matchTriggerRules (in level-classifier.ts)
 *   Level Classifier → classifyLevel    (in level-classifier.ts)
 *   Stage Planner   → planStages        (below)
 */

import type {
  PipelineTask,
  ProjectConfig,
  RoutingResult,
  StageId,
  SkippedStage,
  TaskLevel,
  Result,
  RouterError,
} from '../types/index.js';
import type { SpecOutput } from '../stages/spec-types.js';
import { classifyLevel } from './level-classifier.js';
import { classifyDesignNeeds, type DesignNeedResult } from './design-need-classifier.js';
import { ALL_STAGES, L0_REQUIRED_STAGES, L0_SKIP_REASONS, STAGE_IDS } from '../constants.js';

// ── Public API ──────────────────────────────────────────────────

/**
 * Route a task through the SEVO pipeline.
 *
 * @param task - The pipeline task to route.
 * @returns Result containing RoutingResult on success, RouterError on failure.
 */
export async function route(
  task: PipelineTask,
  specOutput?: SpecOutput,
  projectConfig?: Partial<ProjectConfig>,
): Promise<Result<RoutingResult>> {
  const validation = validateTask(task);
  if (!validation.ok) return validation as Result<RoutingResult>;

  const { level, matchedRules } = classifyLevel(task.scope);
  const designNeeds = await classifyDesignNeeds({
    taskScope: task.scope,
    specOutput,
    projectConfig,
  });
  const { requiredStages, skippedStages } = planStages(level, designNeeds, projectConfig);

  return {
    ok: true,
    value: {
      taskId: task.taskId,
      level,
      requiredStages,
      skippedStages,
      matchedRules,
      needsUxDesign: designNeeds.needsUxDesign,
      uxDesignReason: designNeeds.uxDesignReason,
      needsArchDesign: designNeeds.needsArchDesign,
      archDesignReason: designNeeds.archDesignReason,
    },
  };
}

// ── Stage Planner ───────────────────────────────────────────────

interface StagePlan {
  requiredStages: StageId[];
  skippedStages: SkippedStage[];
}

function planStages(
  level: TaskLevel,
  designNeeds: DesignNeedResult,
  projectConfig?: Partial<ProjectConfig>,
): StagePlan {
  switch (level) {
    case 'L0':
      return planL0(projectConfig);
    case 'L1':
    case 'L2+':
      return planFullPipeline(designNeeds, projectConfig);
  }
}

function planFullPipeline(
  designNeeds: DesignNeedResult,
  projectConfig?: Partial<ProjectConfig>,
): StagePlan {
  const requiredStages: StageId[] = [];
  const skippedStages: SkippedStage[] = [];
  const forceArch = projectConfig?.forceArchDesignAllLevels === true;

  for (const stage of ALL_STAGES) {
    if (stage === STAGE_IDS.UX_INTERACTION_DESIGN && !designNeeds.needsUxDesign) {
      skippedStages.push({ stage, reason: designNeeds.uxDesignReason });
      continue;
    }

    if (stage === STAGE_IDS.ARCHITECTURE_DESIGN && !designNeeds.needsArchDesign && !forceArch) {
      skippedStages.push({ stage, reason: designNeeds.archDesignReason });
      continue;
    }

    requiredStages.push(stage);
  }

  return { requiredStages, skippedStages };
}

function planL0(projectConfig?: Partial<ProjectConfig>): StagePlan {
  const requiredStages: StageId[] = [];
  const skippedStages: SkippedStage[] = [];
  const forceArch = projectConfig?.forceArchDesignAllLevels === true;

  for (const stage of ALL_STAGES) {
    if (forceArch && stage === STAGE_IDS.ARCHITECTURE_DESIGN) {
      requiredStages.push(stage);
      continue;
    }
    if (L0_REQUIRED_STAGES.has(stage)) {
      requiredStages.push(stage);
    } else {
      const reason = L0_SKIP_REASONS[stage];
      if (reason) {
        skippedStages.push({ stage, reason });
      }
    }
  }

  return { requiredStages, skippedStages };
}

// ── Validation ──────────────────────────────────────────────────

function validateTask(
  task: PipelineTask,
): Result<true> {
  if (!task.taskId || task.taskId.trim() === '') {
    return {
      ok: false,
      error: {
        code: 'INVALID_TASK_ID',
        message: 'taskId must be a non-empty string',
      },
    };
  }

  if (!task.title || task.title.trim() === '') {
    return {
      ok: false,
      error: {
        code: 'INVALID_TITLE',
        message: 'title must be a non-empty string',
      },
    };
  }

  return { ok: true, value: true };
}
