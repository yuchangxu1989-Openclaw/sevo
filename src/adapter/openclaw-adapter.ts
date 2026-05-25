import { EventEmitter } from 'node:events';
import { execFileSync as nodeExecFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import type { GateVerdict, StageId, ArtifactRef, ProjectConfig } from '../types/index.js';
import { LLMProvider, type ChatMessage, type LLMProviderConfig } from '../llm/index.js';
import type {
  RequirementAnalysisRequest,
  RequirementAnalysisResponse,
} from '../stages/spec-types.js';
import type { TaskPayload } from '../orchestrator/pipeline-run.js';
import type { SevoHostAdapter, SpawnTaskOptions, ParallelTaskDescriptor } from './host-adapter.js';
import { buildTriggerStagePrompt } from './host-adapter.js';
import type { PublishAdapter, PublishResult } from './publish-adapter.js';
import { inferVersionBump } from './publish-adapter.js';
import { resolveWorkspaceRoot } from '../utils/path-defaults.js';

export interface SpawnLike {
  spawn(request: { stage: StageId; payload: TaskPayload; agentId?: string }): Promise<{ taskId: string }>;
}

/** Programmatic spawn client for sessions_spawn API (AC-19.10). */
export interface SessionsSpawnClient {
  /** Spawn a subagent session. Returns the session ID. */
  spawnSession(request: {
    agentId: string;
    task: string;
    label?: string;
    timeoutSeconds?: number;
  }): Promise<{ sessionId: string }>;
}

export interface OpenClawAdapterOptions {
  projectRoot: string;
  workspaceRoot?: string;
  artifactRoots?: string[];
  defaultAgentId?: string;
  stageAgents?: Partial<Record<StageId, string>>;
  notifier?: (message: string) => void;
  spawnClient?: SpawnLike;
  /** Programmatic sessions_spawn client (AC-19.10). */
  sessionsSpawnClient?: SessionsSpawnClient;
  eventBus?: EventEmitter;
  projectConfigPath?: string;
  notifications?: ProjectConfig['notifications'];
  requirementAnalyzer?: (
    input: RequirementAnalysisRequest,
  ) => Promise<RequirementAnalysisResponse>;
  publishScript?: string;
  publishExecFileSync?: typeof nodeExecFileSync;
  publishCommandCwd?: string;
  llm?: LLMProviderConfig;
  llmClient?: { chat(messages: ChatMessage[]): Promise<string> };
}

export interface GateResultEvent {
  stage: StageId;
  verdict: GateVerdict;
  timestamp: string;
}

const DEFAULT_EVENT_NAME = 'gate:result';

export class OpenClawAdapter implements SevoHostAdapter, PublishAdapter {
  readonly eventBus: EventEmitter;
  private readonly projectRoot: string;
  private readonly workspaceRoot: string;
  private readonly artifactRoots: string[];
  private readonly defaultAgentId?: string;
  private readonly stageAgents?: Partial<Record<StageId, string>>;
  private readonly notifier?: (message: string) => void;
  private readonly spawnClient?: SpawnLike;
  private readonly sessionsSpawnClient?: SessionsSpawnClient;
  private readonly projectConfigPath?: string;
  private readonly notifications?: ProjectConfig['notifications'];
  private readonly requirementAnalyzer?: (
    input: RequirementAnalysisRequest,
  ) => Promise<RequirementAnalysisResponse>;
  private readonly publishScript: string;
  private readonly publishExecFileSync: typeof nodeExecFileSync;
  private readonly publishCommandCwd: string;
  private readonly llmClient: { chat(messages: ChatMessage[]): Promise<string> };

  constructor(options: OpenClawAdapterOptions) {
    this.projectRoot = options.projectRoot;
    this.workspaceRoot = options.workspaceRoot ?? options.projectRoot;
    this.artifactRoots = options.artifactRoots ?? [
      path.join(this.projectRoot, 'artifacts'),
      path.join(this.projectRoot, 'docs'),
      path.join(this.projectRoot, 'reports'),
    ];
    this.defaultAgentId = options.defaultAgentId;
    this.stageAgents = options.stageAgents;
    this.notifier = options.notifier;
    this.spawnClient = options.spawnClient;
    this.sessionsSpawnClient = options.sessionsSpawnClient;
    this.eventBus = options.eventBus ?? new EventEmitter();
    this.projectConfigPath = options.projectConfigPath;
    this.notifications = options.notifications;
    this.requirementAnalyzer = options.requirementAnalyzer;
    // NFR-5.18 / NFR-5.19: 不再硬编码 `/root/.openclaw/workspace/scripts/publish-release.sh`。
    // 顺序：options.publishScript > env `SEVO_PUBLISH_SCRIPT` > <workspaceRoot>/scripts/publish-release.sh
    // （workspaceRoot 已在 上面设为 options.workspaceRoot ?? options.projectRoot）。
    const publishScriptEnv = process.env.SEVO_PUBLISH_SCRIPT;
    this.publishScript =
      options.publishScript
      ?? (publishScriptEnv && publishScriptEnv.length > 0 ? publishScriptEnv : undefined)
      ?? path.resolve(resolveWorkspaceRoot(this.workspaceRoot), 'scripts', 'publish-release.sh');
    this.publishExecFileSync = options.publishExecFileSync ?? nodeExecFileSync;
    this.publishCommandCwd = options.publishCommandCwd ?? process.cwd();
    this.llmClient = options.llmClient ?? new LLMProvider(options.llm);
  }

  async dispatchTask(stage: StageId, payload: TaskPayload): Promise<string> {
    if (!this.spawnClient) {
      return this.fallbackTaskId(stage, payload);
    }

    const response = await this.spawnClient.spawn({
      stage,
      payload,
      agentId: this.resolveAgent(stage),
    });

    return response.taskId;
  }

  async collectArtifacts(taskId: string): Promise<ArtifactRef[]> {
    const artifacts: ArtifactRef[] = [];
    const seen = new Set<string>();

    for (const root of this.artifactRoots) {
      const collected = await this.walkArtifacts(root, taskId);
      for (const artifact of collected) {
        if (seen.has(artifact.id)) continue;
        seen.add(artifact.id);
        artifacts.push(artifact);
      }
    }

    return artifacts.sort((a, b) => a.path.localeCompare(b.path));
  }

  notifyGateResult(stage: StageId, verdict: GateVerdict): void {
    const event: GateResultEvent = {
      stage,
      verdict,
      timestamp: new Date().toISOString(),
    };

    this.eventBus.emit(DEFAULT_EVENT_NAME, event);

    if (this.notifications?.feishuEnabled && this.notifier) {
      this.notifier(this.formatGateMessage(stage, verdict));
    }
  }

  getProjectConfig(): ProjectConfig {
    return {
      workspaceRoot: this.workspaceRoot,
      projectRoot: this.projectRoot,
      artifactRoots: [...this.artifactRoots],
      defaultAgentId: this.defaultAgentId,
      stageAgents: this.stageAgents ? { ...this.stageAgents } : undefined,
      notifications: this.notifications ? { ...this.notifications } : undefined,
    };
  }

  async callLlm(messages: ChatMessage[]): Promise<string> {
    return this.llmClient.chat(messages);
  }

  async analyzeRequirements(
    input: RequirementAnalysisRequest,
  ): Promise<RequirementAnalysisResponse> {
    if (!this.requirementAnalyzer) {
      throw new Error('OpenClawAdapter requirementAnalyzer is not configured');
    }
    return this.requirementAnalyzer(input);
  }

  async publish(projectPath: string, version: string): Promise<PublishResult> {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageRaw = await fs.readFile(packageJsonPath, 'utf8');
    const currentVersion = String((JSON.parse(packageRaw) as { version?: string }).version ?? '0.0.0');
    const bump = inferVersionBump(currentVersion, version);
    const rawOutput = this.publishExecFileSync('bash', [this.publishScript, path.basename(projectPath), bump], {
      cwd: this.publishCommandCwd,
      encoding: 'utf8',
    });

    return this.parsePublishResult(String(rawOutput), version);
  }

  async requestReadmeUpdate(request: {
    pipelineId: string;
    projectSlug: string;
    specPath: string;
    readmePath: string;
    missingFrs: string[];
  }): Promise<string | null> {
    const agentId = this.stageAgents?.deploy ?? this.defaultAgentId;
    if (!this.sessionsSpawnClient || !agentId) {
      return null;
    }

    const prompt = [
      `[SEVO README Sync] Pipeline ${request.pipelineId}`,
      `Project: ${request.projectSlug}`,
      `README: ${request.readmePath}`,
      `Spec: ${request.specPath}`,
      `Missing FRs: ${request.missingFrs.join(', ') || 'none'}`,
      'Update README so changed FR capabilities are clearly documented for first-time users.',
    ].join('\n');

    const response = await this.sessionsSpawnClient.spawnSession({
      agentId,
      task: prompt,
      label: `readme-sync-${request.projectSlug}`,
      timeoutSeconds: 1200,
    });

    return response.sessionId;
  }

  async loadProjectConfig(): Promise<ProjectConfig> {
    if (!this.projectConfigPath) {
      return this.getProjectConfig();
    }

    const raw = await fs.readFile(this.projectConfigPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ProjectConfig>;

    return {
      workspaceRoot: parsed.workspaceRoot ?? this.workspaceRoot,
      projectRoot: parsed.projectRoot ?? this.projectRoot,
      artifactRoots: parsed.artifactRoots ?? [...this.artifactRoots],
      defaultAgentId: parsed.defaultAgentId ?? this.defaultAgentId,
      stageAgents: parsed.stageAgents ?? this.stageAgents,
      roleAssignment: parsed.roleAssignment,
      strictRoleMatching: parsed.strictRoleMatching,
      dispatchAuditPath: parsed.dispatchAuditPath,
      notifications: parsed.notifications ?? this.notifications,
    };
  }

  // ── Programmatic Spawn API (AC-19.10) ───────────────────────

  /** Whether this adapter supports programmatic task spawning. */
  supportsSpawn(): boolean {
    return this.sessionsSpawnClient != null;
  }

  /**
   * Spawn a single task via OpenClaw sessions_spawn API (AC-19.10).
   * Falls back to null if sessionsSpawnClient is not configured.
   */
  async spawnTask(
    agentId: string,
    task: string,
    options?: SpawnTaskOptions,
  ): Promise<string | null> {
    if (!this.sessionsSpawnClient) return null;

    const response = await this.sessionsSpawnClient.spawnSession({
      agentId,
      task: options?.roleKnowledge
        ? `${options.roleKnowledge}\n\n---\n\n${task}`
        : task,
      label: options?.label,
      timeoutSeconds: options?.timeoutSeconds,
    });

    return response.sessionId;
  }

  async triggerStage(pipelineId: string, stageId: StageId): Promise<void> {
    const agentId = this.resolveAgent(stageId) ?? this.defaultAgentId;
    if (!agentId) {
      throw new Error(`No agent configured for stage '${stageId}'`);
    }
    const sessionId = await this.spawnTask(agentId, buildTriggerStagePrompt(pipelineId, stageId, this.getProjectConfig()), {
      label: `sevo:${pipelineId}:${stageId}:1`,
      timeoutSeconds: this.stageTimeout(stageId),
    });
    if (!sessionId) {
      await this.dispatchTask(stageId, { taskId: pipelineId, title: `Pipeline ${pipelineId} stage ${stageId}`, initialStage: stageId, stages: [stageId] });
    }
  }

  private stageTimeout(stageId: StageId): number {
    switch (stageId) {
      case 'spec':
      case 'contract':
      case 'architecture-design':
        return 3600;
      case 'implement':
        return 1800;
      case 'review':
      case 'smoke-test':
      case 'ux-acceptance':
      case 'pm-commercial-review':
      case 'regression':
        return 1200;
      default:
        return 600;
    }
  }

  /**
   * Spawn multiple tasks in parallel via OpenClaw sessions_spawn API (AC-19.11).
   * All tasks are dispatched concurrently; returns all session IDs.
   * Falls back to null if sessionsSpawnClient is not configured.
   */
  async spawnParallelTasks(
    tasks: ParallelTaskDescriptor[],
  ): Promise<string[] | null> {
    if (!this.sessionsSpawnClient) return null;

    const results = await Promise.all(
      tasks.map((t) =>
        this.spawnTask(t.agentId, t.task, t.options),
      ),
    );

    // If any spawn failed (returned null), return null for the batch
    if (results.some((r) => r === null)) return null;
    return results as string[];
  }

  private resolveAgent(stage: StageId): string | undefined {
    return this.stageAgents?.[stage] ?? this.defaultAgentId;
  }

  private fallbackTaskId(stage: StageId, payload: TaskPayload): string {
    return `${stage}:${payload.taskId}:${Date.now()}`;
  }

  private async walkArtifacts(root: string, taskId: string): Promise<ArtifactRef[]> {
    try {
      const stat = await fs.stat(root);
      if (!stat.isDirectory()) return [];
    } catch {
      return [];
    }

    const result: ArtifactRef[] = [];
    const stack: string[] = [root];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;

      const entries = await fs.readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);

        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }

        if (!this.matchesTask(entry.name, fullPath, taskId)) {
          continue;
        }

        const fileStat = await fs.stat(fullPath);
        result.push({
          id: `${taskId}:${path.relative(this.projectRoot, fullPath)}`,
          type: this.inferArtifactType(fullPath),
          path: fullPath,
          createdAt: fileStat.mtime.toISOString(),
          metadata: {
            size: fileStat.size,
          },
        });
      }
    }

    return result;
  }

  private matchesTask(fileName: string, fullPath: string, taskId: string): boolean {
    return fileName.includes(taskId) || fullPath.includes(`${path.sep}${taskId}${path.sep}`);
  }

  private inferArtifactType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.md':
        return 'document';
      case '.json':
        return 'structured-data';
      case '.log':
      case '.txt':
        return 'evidence';
      default:
        return ext ? `file:${ext.slice(1)}` : 'file';
    }
  }

  private parsePublishResult(rawOutput: string, version: string): PublishResult {
    const lines = rawOutput.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
    const platforms: PublishResult['platforms'] = [];

    for (const line of lines) {
      if (line.startsWith('npm: ')) {
        platforms.push({ name: 'npm', url: line.slice(5) });
      } else if (line.startsWith('github: ')) {
        platforms.push({ name: 'github', url: line.slice(8) });
      } else if (line.startsWith('main-repo: ')) {
        platforms.push({ name: 'main-repo', url: line.slice(11) });
      } else if (/error/i.test(line)) {
        platforms.push({ name: 'error', error: line });
      }
    }

    return {
      success: platforms.every((platform) => !platform.error),
      version,
      platforms,
    };
  }

  private formatGateMessage(stage: StageId, verdict: GateVerdict): string {
    return `[SEVO] ${stage} gate ${verdict.conclusion} (${verdict.gateId})`;
  }
}

export { DEFAULT_EVENT_NAME as OPENCLAW_GATE_RESULT_EVENT };
