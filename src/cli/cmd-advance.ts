/**
 * sevo advance <pipeline-id> — activate and dispatch runnable stages for a persisted PipelineInstance.
 */

import type { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

import { createFileInstanceStore, findConfigFile, projectRoot } from './helpers.js';
import { registerToActiveState, enqueuePendingAdvanceFile } from './active-state-bridge.js';
import { OpenClawAdapter, type SpawnLike } from '../adapter/openclaw-adapter.js';
import { buildTriggerStagePrompt } from '../adapter/host-adapter.js';
import { getActivatableStages } from '../pipeline/parallel-branch.js';
import { PipelineEngine } from '../pipeline/pipeline-engine.js';
import { CliPipelineEngine } from '../engine/index.js';
import { transitionInstanceStatus } from '../pipeline/status-history.js';
import {
  STAGE_HANDLERS,
  STAGE_HANDLER_TO_STAGE_ID,
  type StageHandler as RegistryStageHandler,
  type StageHandlerResult as RegistryStageHandlerResult,
} from '../stage-handlers/index.js';
import type {
  StageHandler as CliStageHandler,
  StageHandlerResult as CliStageHandlerResult,
} from '../engine/index.js';
import type {
  PipelineInstance,
  PipelineState,
  ProjectConfig,
  StageId,
  StageRecord,
} from '../types/index.js';

const DEFAULT_STAGE_AGENTS: Partial<Record<StageId, string>> = {
  implement: 'cc',
  review: 'audit-01',
  regression: 'audit-01',
  verify: 'ux-01',
  ledger: 'pm-01',
};

interface AdvanceCliOptions {
  stage?: string;
  force?: boolean;
  autoAdvance?: boolean;
  dryRun?: boolean;
}

function instanceFilePath(root: string, pipelineId: string): string {
  return path.join(root, 'pipelines', `${pipelineId}.json`);
}

function stateFilePath(root: string, pipelineId: string): string {
  return path.join(root, 'data', 'pipelines', pipelineId, 'state.json');
}

function pipelineOnlyStatePath(cwd: string, pipelineId: string): string {
  return path.join(cwd, '.sevo', pipelineId, 'state.json');
}

async function advancePipelineOnly(
  cwd: string,
  pipelineId: string,
  opts: AdvanceCliOptions,
): Promise<void> {
  const sevoBase = path.join(cwd, '.sevo');
  const engine = new CliPipelineEngine(sevoBase);
  const state = engine.load(pipelineId);

  if (opts.dryRun) {
    console.log(`Pipeline:   ${pipelineId}`);
    console.log(`Status:     ${state.status}`);
    console.log(`Current:    ${state.currentStage ?? 'none'}`);
    console.log('Stages:');
    for (const stageId of state.requiredStages) {
      const record = state.stages[stageId];
      console.log(`  - ${stageId.padEnd(34)} ${record?.status ?? 'pending'}`);
    }
    console.log(`State file: ${pipelineOnlyStatePath(cwd, pipelineId)}`);
    return;
  }

  const result = await engine.advanceAsync(pipelineId, {
    force: opts.force,
    autoAdvance: opts.autoAdvance,
    stage: opts.stage as StageId | undefined,
  });

  console.log(`Pipeline:   ${result.pipelineId}`);
  console.log(`Stage:      ${result.stage}`);
  console.log(`Outcome:    ${result.outcome}`);
  console.log(`Next:       ${result.nextStage ?? '(none)'}`);
  console.log(`Status:     ${result.pipelineStatus}`);
  if (result.reason) console.log(`Reason:     ${result.reason}`);
  console.log(`State file: ${pipelineOnlyStatePath(cwd, pipelineId)}`);
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJsonFile(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tempPath, filePath);
}

function loadPipelineInstance(root: string, pipelineId: string): PipelineInstance | null {
  const filePath = instanceFilePath(root, pipelineId);
  if (!fs.existsSync(filePath)) return null;
  return readJsonFile<PipelineInstance>(filePath);
}

function createStageRecord(stageId: StageId, status: StageRecord['status']): StageRecord {
  return { stageId, status, artifacts: [] };
}

function createStateFromInstance(instance: PipelineInstance, now: string): PipelineState {
  const stages = {} as Record<StageId, StageRecord>;
  for (const stageId of instance.routingResult.requiredStages) {
    stages[stageId] = createStageRecord(stageId, 'pending');
  }

  return {
    pipelineId: instance.instanceId,
    taskId: instance.routingResult.taskId,
    level: instance.routingResult.level,
    requiredStages: instance.routingResult.requiredStages,
    stages,
    currentStage: null,
    createdAt: instance.createdAt ?? now,
    updatedAt: now,
    pipelineStatus: 'active',
  };
}

function ensureCoreState(root: string, instance: PipelineInstance): PipelineState {
  const filePath = stateFilePath(root, instance.instanceId);
  if (fs.existsSync(filePath)) return readJsonFile<PipelineState>(filePath);

  const state = createStateFromInstance(instance, new Date().toISOString());
  writeJsonFile(filePath, state);
  return state;
}

function findWorkspaceRoot(startDir: string): string {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;

  while (true) {
    const boardScript = path.join(dir, 'scripts', 'local-subagent-board.js');
    if (fs.existsSync(boardScript)) return dir;
    const nestedWorkspaceScript = path.join(dir, 'workspace', 'scripts', 'local-subagent-board.js');
    if (fs.existsSync(nestedWorkspaceScript)) return path.join(dir, 'workspace');
    if (dir === root) break;
    dir = path.dirname(dir);
  }

  throw new Error(`Workspace root not found from ${startDir}`);
}

function readNestedTaskId(parsed: Record<string, unknown> | null): string | null {
  if (!parsed) return null;
  const task = parsed['task'];
  if (!task || typeof task !== 'object') return null;
  const taskId = (task as Record<string, unknown>)['id'];
  return typeof taskId === 'string' && taskId.length > 0 ? taskId : null;
}

function createBoardSpawnClient(config: ProjectConfig, workspaceRoot: string): SpawnLike {
  const boardScript = path.join(workspaceRoot, 'scripts', 'local-subagent-board.js');

  return {
    async spawn(request) {
      const label = `sevo:${request.payload.taskId}:${request.stage}:1`;
      const payload = {
        agentId: request.agentId ?? config.stageAgents?.[request.stage] ?? config.defaultAgentId ?? 'cc',
        title: label,
        prompt: buildTriggerStagePrompt(request.payload.taskId, request.stage, config),
        timeoutSec: stageTimeout(request.stage),
      };

      const raw = execFileSync('node', [boardScript, 'enqueue', JSON.stringify(payload)], {
        cwd: workspaceRoot,
        encoding: 'utf8',
      });

      const taskId = readNestedTaskId(parseLastJsonLine(raw));
      return { taskId: taskId ?? label };
    },
  };
}

function parseLastJsonLine(raw: string): Record<string, unknown> | null {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]!) as Record<string, unknown>;
    } catch {
      // Ignore non-JSON lines.
    }
  }
  return null;
}

function stageTimeout(stageId: StageId): number {
  switch (stageId) {
    case 'implement':
      return 1800;
    case 'review':
    case 'regression':
    case 'verify':
      return 1200;
    default:
      return 600;
  }
}

/**
 * Check task board for existing running/queued tasks matching this pipeline + stage.
 * Returns true if a duplicate exists (should skip dispatch).
 */
function hasDuplicateOnBoard(workspaceRoot: string, pipelineId: string, stageId: StageId): boolean {
  const boardPath = path.join(workspaceRoot, 'logs', 'subagent-task-board.json');
  if (!fs.existsSync(boardPath)) return false;
  try {
    const board = JSON.parse(fs.readFileSync(boardPath, 'utf8')) as { tasks?: Array<{ title?: string; status?: string }> };
    const label = `sevo:${pipelineId}:${stageId}`;
    const activeStatuses = ['running', 'queued', 'pending'];
    return (board.tasks ?? []).some(
      (t) => t.title?.includes(label) && activeStatuses.includes(t.status ?? ''),
    );
  } catch {
    return false;
  }
}

function buildProjectConfig(root: string): ProjectConfig {
  return {
    workspaceRoot: findWorkspaceRoot(root),
    projectRoot: root,
    artifactRoots: [path.join(root, 'artifacts'), path.join(root, 'docs'), path.join(root, 'reports')],
    defaultAgentId: 'cc',
    stageAgents: DEFAULT_STAGE_AGENTS,
    hasUI: true,
    notifications: { feishuEnabled: false },
  };
}

function printStateSummary(instance: PipelineInstance, state: PipelineState, root: string): void {
  console.log(`Pipeline: ${instance.instanceId}`);
  console.log(`Instance: ${instance.status}`);
  console.log(`Current:  ${state.currentStage ?? 'none'}`);
  console.log('Stages:');
  for (const stageId of state.requiredStages) {
    const record = state.stages[stageId];
    console.log(`  - ${stageId.padEnd(34)} ${record?.status ?? 'pending'}`);
  }
  console.log(`State file: ${stateFilePath(root, instance.instanceId)}`);
}

function toCliStageResult(result: RegistryStageHandlerResult): CliStageHandlerResult {
  return {
    outcome: result.verdict === 'pass' ? 'passed' : result.verdict === 'block' ? 'gate_blocked' : 'failed',
    artifacts: result.artifacts.map((artifact) => ({
      id: artifact.id,
      type: artifact.type,
      path: artifact.path,
      createdAt: artifact.createdAt,
    })),
    reason: result.issues.length > 0 ? result.issues.join('; ') : result.summary,
  };
}

export function buildStageHandlers(): Partial<Record<StageId, CliStageHandler>> {
  const handlers: Partial<Record<StageId, CliStageHandler>> = {};
  for (const [key, handler] of Object.entries(STAGE_HANDLERS) as Array<[keyof typeof STAGE_HANDLERS, RegistryStageHandler]>) {
    const mappedStageId = STAGE_HANDLER_TO_STAGE_ID[key];
    if (!mappedStageId) continue;
    handlers[mappedStageId] = async (ctx) => {
      const workspaceRoot = path.dirname(path.dirname(ctx.pipelineDir));
      const result = await handler({
        pipelineId: ctx.pipelineId,
        projectSlug: ctx.pipelineId,
        workspaceRoot,
        projectRoot: ctx.pipelineDir,
        frDescription: ctx.state.description ?? '',
        now: ctx.now,
        previousResults: {},
      });
      return {
        ...toCliStageResult(result),
        artifacts: result.artifacts.map((artifact) => ({
          id: artifact.id,
          type: artifact.type,
          path: path.isAbsolute(artifact.path) ? path.relative(ctx.pipelineDir, artifact.path) : artifact.path,
          createdAt: artifact.createdAt,
        })),
      };
    };
  }
  return handlers;
}

export function registerAdvance(program: Command): void {
  program
    .command('advance <pipeline-id>')
    .description('Advance a persisted pipeline instance and dispatch active stages')
    .option('--stage <stage>', 'Only dispatch a specific stage if it becomes active')
    .option('--force', 'Accepted for CLI compatibility; no gate override is applied here', false)
    .option('--auto-advance', 'Accepted for CLI compatibility; current dispatch is one-shot', false)
    .option('--dry-run', 'Show current persisted core state without dispatching', false)
    .action(async (pipelineId: string, opts: AdvanceCliOptions) => {
      try {
        const cwd = process.cwd();
        const configPath = findConfigFile();
        const pipelineOnlyState = pipelineOnlyStatePath(cwd, pipelineId);

        // Pipeline-only fallback: no sevo.json found, OR project-mode instance
        // is missing while a `.sevo/<id>/state.json` exists. This matches the
        // layout produced by `sevo create <id>` in pipeline-only mode.
        if (!configPath && fs.existsSync(pipelineOnlyState)) {
          await advancePipelineOnly(cwd, pipelineId, opts);
          return;
        }
        if (configPath) {
          const root = projectRoot();
          if (!fs.existsSync(instanceFilePath(root, pipelineId)) && fs.existsSync(pipelineOnlyState)) {
            await advancePipelineOnly(cwd, pipelineId, opts);
            return;
          }
        }

        const root = projectRoot();
        const store = createFileInstanceStore(root);
        const instance = loadPipelineInstance(root, pipelineId);
        if (!instance) {
          console.error(
            `Pipeline instance "${pipelineId}" not found at ${instanceFilePath(root, pipelineId)} (and no .sevo/${pipelineId}/state.json fallback).`,
          );
          process.exitCode = 2;
          return;
        }

        const state = ensureCoreState(root, instance);
        if (opts.dryRun) {
          printStateSummary(instance, state, root);
          return;
        }

        const config = buildProjectConfig(root);
        const engine = new PipelineEngine(path.join(root, 'data'));
        const adapter = new OpenClawAdapter({
          projectRoot: config.projectRoot,
          workspaceRoot: config.workspaceRoot,
          artifactRoots: config.artifactRoots,
          defaultAgentId: config.defaultAgentId,
          stageAgents: config.stageAgents,
          notifications: config.notifications,
          spawnClient: createBoardSpawnClient(config, config.workspaceRoot),
        });

        transitionInstanceStatus(instance, 'active', 'advance-request');
        store.save(instance);

        const activatable = getActivatableStages(state).filter((stageId) => !opts.stage || stageId === opts.stage);
        for (const stageId of activatable) {
          try {
            engine.activate(instance.instanceId, stageId);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!message.includes(`Cannot activate stage '${stageId}' from status 'active'`)) throw error;
          }
        }

        const activated = engine.load(instance.instanceId);
        const toDispatch = activated.requiredStages.filter((stageId) => {
          if (opts.stage && stageId !== opts.stage) return false;
          return activated.stages[stageId]?.status === 'active';
        });

        const dispatched: StageId[] = [];
        const skipped: StageId[] = [];
        for (const stageId of toDispatch) {
          // Dedup: skip if already running/queued on task board (unless --force)
          if (!opts.force && hasDuplicateOnBoard(config.workspaceRoot, instance.instanceId, stageId)) {
            console.log(`  [dedup] Skipping ${stageId} — already running/queued on task board.`);
            skipped.push(stageId);
            continue;
          }
          await adapter.triggerStage(instance.instanceId, stageId);
          dispatched.push(stageId);
        }

        // Register to active state (cross-process bridge)
        const projectRootRelative = `projects/${path.basename(root)}`;
        registerToActiveState({
          root: config.workspaceRoot,
          pipelineId: instance.instanceId,
          projectSlug: instance.projectSlug,
          projectRoot: projectRootRelative,
          tier: 3,
          source: 'cli-advance',
          instanceId: instance.instanceId,
        });

        console.log(`Pipeline:   ${instance.instanceId}`);
        console.log(`Instance:   ${instance.status}`);
        console.log(`Activated:  ${activatable.join(', ') || '(none)'}`);
        console.log(`Dispatched: ${dispatched.join(', ') || '(none)'}`);
        if (skipped.length > 0) console.log(`Skipped:    ${skipped.join(', ')} (dedup)`);
        console.log(`State file: ${stateFilePath(root, instance.instanceId)}`);
      } catch (error) {
        console.error(`advance failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 2;
      }
    });
}
