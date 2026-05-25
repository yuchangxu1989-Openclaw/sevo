import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GateVerdict, StageId, ArtifactRef, ProjectConfig } from '../types/index.js';
import { createSevoTag } from '../plugin-adapter/plugin-adapter.js';
import { formatStageStandardForPrompt, getStageStandard } from '../engine/stage-standards-loader.js';
import type {
  RequirementAnalysisRequest,
  RequirementAnalysisResponse,
} from '../stages/spec-types.js';
import type { TaskPayload } from '../orchestrator/pipeline-run.js';
import type { PublishAdapter, ReadmeUpdateRequest } from './publish-adapter.js';

// ── Programmatic Spawn Types (AC-19.10) ─────────────────────────

/** Options for spawning a single task programmatically. */
export interface SpawnTaskOptions {
  label?: string;
  timeoutSeconds?: number;
  /** Role knowledge to inject for single-agent users (AC-19.13). */
  roleKnowledge?: string;
  /** FR-22: Human-readable role degradation warning injected for single-agent mismatches. */
  roleWarning?: string;
}

/** A task descriptor for parallel spawning (AC-19.11). */
export interface ParallelTaskDescriptor {
  agentId: string;
  task: string;
  options?: SpawnTaskOptions;
}

/**
 * Minimal host adapter contract for integrating SEVO with runtime environments.
 * Core keeps stage semantics; adapters provide dispatch, artifact recovery,
 * notification, and project-level configuration.
 */
export interface SevoHostAdapter {
  dispatchTask(stage: StageId, payload: TaskPayload): Promise<string>;
  collectArtifacts(taskId: string): Promise<ArtifactRef[]>;
  notifyGateResult(stage: StageId, verdict: GateVerdict): void;
  callLlm(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<string>;
  /** Trigger a pipeline stage through the host dispatch layer. */
  triggerStage(pipelineId: string, stageId: StageId): Promise<void>;
  analyzeRequirements?(input: RequirementAnalysisRequest): Promise<RequirementAnalysisResponse>;
  getProjectConfig(): ProjectConfig;
  publish?(projectPath: string, version: string): Promise<import('./publish-adapter.js').PublishResult>;
  requestReadmeUpdate?(request: ReadmeUpdateRequest): Promise<string | null>;

  // ── Programmatic Spawn API (AC-19.10) ───────────────────────

  /**
   * Spawn a single task via host API (e.g. sessions_spawn).
   * Returns the spawned session/task ID.
   * If not supported, returns null (caller falls back to prompt injection).
   */
  spawnTask?(agentId: string, task: string, options?: SpawnTaskOptions): Promise<string | null>;

  /**
   * Spawn multiple tasks in parallel (AC-19.11).
   * Returns an array of session/task IDs.
   * If not supported, returns null (caller falls back to sequential dispatch).
   */
  spawnParallelTasks?(tasks: ParallelTaskDescriptor[]): Promise<string[] | null>;

  /**
   * Whether this adapter supports programmatic task spawning.
   * Used to decide between programmatic dispatch vs prompt injection fallback.
   */
  supportsSpawn?(): boolean;

  /** Optional stage lifecycle hooks for endgame liveness integration. */
  runPdcaLivenessCheck?(pipelineId: string): Promise<{ blocked: boolean; p0Failures?: string[]; p1Failures?: string[] }>;
  markPipelineBlocked?(pipelineId: string, reason: string): Promise<void> | void;
  notifyUser?(message: string): Promise<void> | void;
}

export function buildStageStandardPrompt(projectRoot: string, stageId: StageId): string {
  return formatStageStandardForPrompt(stageId, getStageStandard(stageId, { projectRoot }));
}

/**
 * Load a pipeline instance JSON from disk for prompt enrichment.
 * Searches both `pipelines/<id>.json` and `data/pipelines/<id>/state.json`.
 */
function loadInstanceForPrompt(pipelineId: string, config: ProjectConfig): Record<string, unknown> | null {
  const candidates = [
    path.join(config.projectRoot, 'pipelines', `${pipelineId}.json`),
    path.join(config.projectRoot, 'data', 'pipelines', pipelineId, 'state.json'),
  ];

  // Also scan all project pipelines dirs under workspaceRoot/projects/
  const projectsDir = path.join(config.workspaceRoot, 'projects');
  try {
    if (fs.existsSync(projectsDir)) {
      for (const entry of fs.readdirSync(projectsDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          candidates.push(path.join(projectsDir, entry.name, 'pipelines', `${pipelineId}.json`));
        }
      }
    }
  } catch {
    // Best-effort scan
  }

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return JSON.parse(fs.readFileSync(candidate, 'utf8')) as Record<string, unknown>;
      }
    } catch {
      // Skip malformed files
    }
  }
  return null;
}

/**
 * Build a rich prompt section from instance data (task description, scope, constraints).
 */
function buildInstanceContext(instance: Record<string, unknown> | null, pipelineId: string): string {
  if (!instance) return '';

  const sections: string[] = [];

  // Extract task info from routingResult or top-level
  const routingResult = instance['routingResult'] as Record<string, unknown> | undefined;
  const task = (routingResult?.['task'] ?? instance['task']) as Record<string, unknown> | undefined;

  if (task) {
    const title = task['title'] as string | undefined;
    const description = task['description'] as string | undefined;
    if (title) sections.push(`Task: ${title}`);
    if (description) sections.push(`Description: ${description}`);

    // Scope details
    const scope = task['scope'] as Record<string, unknown> | undefined;
    if (scope) {
      const scopeParts: string[] = [];
      if (scope['estimatedFiles']) scopeParts.push(`files: ~${scope['estimatedFiles']}`);
      if (scope['estimatedLines']) scopeParts.push(`lines: ~${scope['estimatedLines']}`);
      if (scope['affectedDomains']) scopeParts.push(`domains: ${(scope['affectedDomains'] as string[]).join(', ')}`);
      if (scope['isNewModule']) scopeParts.push('new module');
      if (scope['hasDataModelChange']) scopeParts.push('data model change');
      if (scopeParts.length > 0) sections.push(`Scope: ${scopeParts.join('; ')}`);
    }
  }

  // Project slug
  const projectSlug = instance['projectSlug'] as string | undefined;
  if (projectSlug) sections.push(`Project: ${projectSlug}`);

  // Instance ID
  const instanceId = instance['instanceId'] as string | undefined;
  if (instanceId) sections.push(`Instance: ${instanceId}`);

  // Level from routing
  const level = routingResult?.['level'] as string | undefined;
  if (level) sections.push(`Level: ${level}`);

  // Required stages
  const requiredStages = (routingResult?.['requiredStages'] ?? instance['requiredStages']) as string[] | undefined;
  if (requiredStages) sections.push(`Pipeline stages: ${requiredStages.join(' → ')}`);

  // Directory structure — spec path
  const dirStructure = instance['directoryStructure'] as Record<string, unknown> | undefined;
  const specPath = dirStructure?.['specPath'] as string | undefined;
  if (specPath) {
    sections.push(`Spec path: ${specPath}`);
  } else if (projectSlug) {
    // Infer standard spec path
    sections.push(`Spec path: docs/product-requirements.md (standard location)`);
  }

  // End-state goal (FR-18)
  const endStateGoal = instance['endStateGoal'] as Record<string, unknown> | undefined;
  if (endStateGoal?.['description']) {
    sections.push(`End-state goal: ${endStateGoal['description']}`);
  }

  if (sections.length === 0) return '';
  return `[Pipeline Context]\n${sections.join('\n')}`;
}

/**
 * Build constraints section for the prompt.
 */
function buildConstraintsSection(stageId: StageId): string {
  const constraints: string[] = [
    '禁止关键词匹配/FTS5/正则冒充语义理解，必须用向量检索或 LLM。',
    '只能实现 spec 定义的 FR/AC，每个功能模块必须能追溯到 FR/AC。',
    '完成后输出 AC 覆盖清单（覆盖/未覆盖/部分覆盖 + 代码位置）。',
    '最小改动，不顺手重构无关代码，匹配已有风格。',
    '所有命令 stdout 重定向 > /tmp/xxx.txt 2>&1，再 tail 看摘要。',
    '修改后 read 验证文件已写入，只在回复输出未写入 = 失败。',
  ];

  if (stageId === 'implement') {
    return `[Hard Constraints]\n${constraints.map((c, i) => `${i + 1}. ${c}`).join('\n')}`;
  }
  // For other stages, lighter constraints
  return `[Hard Constraints]\n1. ${constraints[4]}\n2. ${constraints[5]}`;
}

export function buildTriggerStagePrompt(pipelineId: string, stageId: StageId, config: ProjectConfig): string {
  const standards = buildStageStandardPrompt(config.projectRoot, stageId);
  const instance = loadInstanceForPrompt(pipelineId, config);
  const instanceContext = buildInstanceContext(instance, pipelineId);
  const constraints = buildConstraintsSection(stageId);
  const requiredSectionCheck = stageId === 'spec-review-gate'
    ? '\n\n[SEVO Spec Review Gate]\nKeep the required user-layer section order before 功能需求. The four-section semantic judgment is performed by SpecSectionsRule LLM gate.'
    : '';

  // Build report path template
  const projectSlug = (instance?.['projectSlug'] as string) ?? pipelineId.split('-').slice(1, -2).join('-');
  const reportPath = `reports/${projectSlug}-${stageId}-${new Date().toISOString().slice(0, 10)}.md`;

  return [
    `[SEVO Auto-Advance] Pipeline ${pipelineId}: Execute stage "${stageId}".`,
    `Use label ${createSevoTag(pipelineId, stageId, 1)} for any stage-bound task.`,
    instanceContext,
    standards,
    constraints,
    requiredSectionCheck,
    `[Output]\nWrite results to: ${reportPath}`,
    'Produce the required artifacts and report a structured pass/fail outcome.',
  ].filter((part) => part.trim().length > 0).join('\n\n');
}

