/**
 * Router — entry point for SEVO pipeline routing.
 *
 * Receives a PipelineTask, classifies its level, and produces a
 * RoutingResult with the full required stage chain.
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
  Result,
  RouterError,
} from '../types/index.js';
import type { SpecOutput } from '../stages/spec-types.js';
import { classifyLevel } from './level-classifier.js';
import { classifyDesignNeeds } from './design-need-classifier.js';
import { ALL_STAGES } from '../constants.js';

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
  const requiredStages = planStages();

  return {
    ok: true,
    value: {
      taskId: task.taskId,
      level,
      requiredStages,
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
}

function planStages(): StagePlan['requiredStages'] {
  return [...ALL_STAGES];
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
