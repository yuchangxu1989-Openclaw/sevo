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

export interface DispatchRecord {
  taskId: string;
  stage: StageId;
  payload: TaskPayload;
  dispatchedAt: string;
}

export class StandaloneAdapter implements SevoHostAdapter, PublishAdapter {
  private readonly projectConfig: ProjectConfig;
  private readonly dispatches: DispatchRecord[] = [];
  private readonly artifactsByTaskId: Map<string, ArtifactRef[]> = new Map();
  private readonly gateNotifications: Array<{
    stage: StageId;
    verdict: GateVerdict;
    timestamp: string;
  }> = [];
  private readonly requirementAnalyzer?: (
    input: RequirementAnalysisRequest,
  ) => Promise<RequirementAnalysisResponse>;
  private readonly llmClient: { chat(messages: ChatMessage[]): Promise<string> };

  constructor(
    projectConfig: ProjectConfig,
    options?: {
      requirementAnalyzer?: (
        input: RequirementAnalysisRequest,
      ) => Promise<RequirementAnalysisResponse>;
      llm?: LLMProviderConfig;
      llmClient?: { chat(messages: ChatMessage[]): Promise<string> };
    },
  ) {
    this.projectConfig = {
      ...projectConfig,
      artifactRoots: projectConfig.artifactRoots ? [...projectConfig.artifactRoots] : undefined,
      stageAgents: projectConfig.stageAgents ? { ...projectConfig.stageAgents } : undefined,
      notifications: projectConfig.notifications ? { ...projectConfig.notifications } : undefined,
    };
    this.requirementAnalyzer = options?.requirementAnalyzer;
    this.llmClient = options?.llmClient ?? new LLMProvider(options?.llm);
  }

  async dispatchTask(stage: StageId, payload: TaskPayload): Promise<string> {
    const taskId = `${stage}:${payload.taskId}:${this.dispatches.length + 1}`;
    this.dispatches.push({
      taskId,
      stage,
      payload,
      dispatchedAt: new Date().toISOString(),
    });
    return taskId;
  }

  async collectArtifacts(taskId: string): Promise<ArtifactRef[]> {
    return [...(this.artifactsByTaskId.get(taskId) ?? [])];
  }

  notifyGateResult(stage: StageId, verdict: GateVerdict): void {
    this.gateNotifications.push({
      stage,
      verdict,
      timestamp: new Date().toISOString(),
    });
  }

  getProjectConfig(): ProjectConfig {
    return {
      ...this.projectConfig,
      artifactRoots: this.projectConfig.artifactRoots ? [...this.projectConfig.artifactRoots] : undefined,
      stageAgents: this.projectConfig.stageAgents ? { ...this.projectConfig.stageAgents } : undefined,
      notifications: this.projectConfig.notifications ? { ...this.projectConfig.notifications } : undefined,
    };
  }

  async callLlm(messages: ChatMessage[]): Promise<string> {
    return this.llmClient.chat(messages);
  }

  async analyzeRequirements(
    input: RequirementAnalysisRequest,
  ): Promise<RequirementAnalysisResponse> {
    if (!this.requirementAnalyzer) {
      throw new Error('StandaloneAdapter requirementAnalyzer is not configured');
    }
    return this.requirementAnalyzer(input);
  }

  async publish(projectPath: string, version: string): Promise<PublishResult> {
    const currentVersion = await import('node:fs/promises')
      .then(({ readFile }) => readFile(`${projectPath}/package.json`, 'utf8'))
      .then((raw) => String((JSON.parse(raw) as { version?: string }).version ?? '0.0.0'));
    const bump = inferVersionBump(currentVersion, version);
    process.stdout.write(`bash scripts/publish-release.sh ${this.projectConfig.projectRoot.split('/').pop() ?? 'project'} ${bump}\n`);

    return {
      success: true,
      version,
      platforms: [
        { name: 'stdout', url: `command://publish-release/${bump}` },
      ],
    };
  }

  registerArtifacts(taskId: string, artifacts: ArtifactRef[]): void {
    this.artifactsByTaskId.set(taskId, [...artifacts]);
  }

  getDispatches(): readonly DispatchRecord[] {
    return this.dispatches;
  }

  getGateNotifications(): ReadonlyArray<{
    stage: StageId;
    verdict: GateVerdict;
    timestamp: string;
  }> {
    return this.gateNotifications;
  }

  // ── Programmatic Spawn API (AC-19.10, AC-19.13 standalone mode) ───

  /** Standalone mode does not support programmatic spawning. */
  supportsSpawn(): boolean {
    return false;
  }

  async triggerStage(pipelineId: string, stageId: StageId): Promise<void> {
    const agentId = this.projectConfig.stageAgents?.[stageId] ?? this.projectConfig.defaultAgentId ?? 'standalone';
    await this.spawnTask(agentId, buildTriggerStagePrompt(pipelineId, stageId, this.getProjectConfig()), {
      label: `sevo:${pipelineId}:${stageId}:1`,
      timeoutSeconds: 600,
    });
  }

  /**
   * In standalone mode, output task instruction to stdout (AC-19.13).
   * Returns a synthetic task ID for tracking.
   */
  async spawnTask(
    agentId: string,
    task: string,
    options?: SpawnTaskOptions,
  ): Promise<string | null> {
    const taskId = `standalone:${agentId}:${Date.now()}`;
    const instruction = {
      type: 'sevo:spawn-task',
      taskId,
      agentId,
      task: options?.roleKnowledge
        ? `${options.roleKnowledge}\n\n---\n\n${task}`
        : task,
      label: options?.label,
      timeoutSeconds: options?.timeoutSeconds,
    };
    // Output to stdout for external orchestrator consumption
    process.stdout.write(JSON.stringify(instruction) + '\n');
    return taskId;
  }

  /**
   * In standalone mode, output all parallel task instructions to stdout (AC-19.11).
   */
  async spawnParallelTasks(
    tasks: ParallelTaskDescriptor[],
  ): Promise<string[] | null> {
    const ids: string[] = [];
    for (const t of tasks) {
      const id = await this.spawnTask(t.agentId, t.task, t.options);
      if (id) ids.push(id);
    }
    return ids.length > 0 ? ids : null;
  }
}
