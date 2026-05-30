/**
 * PluginAdapter — OpenClaw hook registration & event dispatch (arc42 §5.7).
 *
 * Registers three hooks: before_prompt_build, before_tool_call, subagent_ended.
 * Implements SEVO tag protocol, bridge.js concept (HostAdapter interface),
 * and degradation strategy (CLI-only mode when no host is available).
 *
 * AC-19.10: subagent_ended hook handler programmatically calls host API to
 * dispatch next-stage tasks (instead of injecting prompt text).
 * AC-19.11: Parallel stages are triggered in one batch.
 * AC-19.12: Endgame delivery chain is configurable.
 * AC-19.1: Review pass triggers endgame delivery chain.
 * AC-19.13: Single-agent users get role knowledge injection.
 *
 * Connects ComplianceRouter (before_tool_call) and RoleKnowledgeInjector
 * (before_prompt_build) to the hook lifecycle.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { PipelineEngine } from '../pipeline/pipeline-engine.js';
import type { GateEngine } from '../gate/gate-engine.js';
import { advanceOnComplete } from '../engine/advance-on-complete.js';
import type { StageCompletionOutcome } from '../engine/advance-on-complete.js';
import type { ComplianceRouter, ComplianceTaskContext, ComplianceResult } from '../compliance/index.js';
import type { SevoHostAdapter, SpawnTaskOptions, ParallelTaskDescriptor } from '../adapter/host-adapter.js';
import { buildSpecReadInstruction } from '../adapter/host-adapter.js';
import type { EndgameDeliveryConfig } from '../config.js';
import { DEFAULT_ENDGAME_DELIVERY } from '../config.js';
import { RoleKnowledgeInjector } from '../knowledge/role-knowledge-injector.js';
import { appendAdvanceDecision } from '../engine/advance-decision-log.js';
import { evaluateStageGate } from '../engine/stage-gate-guard.js';
import { formatStageStandardForPrompt, getStageStandard } from '../engine/stage-standards-loader.js';
import { getActivatableStages } from '../pipeline/parallel-branch.js';
import type { StageId, ArtifactRef, PipelineState } from '../types/index.js';
import { handleSpawnTask } from '../gates/llm-intercept/index.js';
import { RoleDispatchBlockedError, RoleTaskMatcher, type RoleMismatchEvent } from '../role-registry/index.js';

// ── SEVO Tag Protocol ───────────────────────────────────────────

/** Format: sevo:<pipelineId>:<stageId>:<attempt> */
export interface SevoTag {
  pipelineId: string;
  stageId: StageId;
  attempt: number;
}

/** Parse a SEVO tag string. Returns null if format is invalid. */
export function parseSevoTag(label: string): SevoTag | null {
  const match = /^sevo:([^:]+):([^:]+):(\d+)$/.exec(label);
  if (!match) return null;
  return {
    pipelineId: match[1]!,
    stageId: match[2]! as StageId,
    attempt: parseInt(match[3]!, 10),
  };
}

/** Create a SEVO tag string from components. */
export function createSevoTag(pipelineId: string, stageId: StageId, attempt: number): string {
  return `sevo:${pipelineId}:${stageId}:${attempt}`;
}

// ── HostAdapter Interface (bridge.js concept) ───────────────────

/**
 * Minimal interface that any host environment must implement
 * to integrate with SEVO's PluginAdapter.
 * This decouples SEVO from any specific runtime (OpenClaw, standalone, etc.)
 */
export interface HostBridge {
  /** Register a hook handler. Returns a dispose function. */
  registerHook(hookName: HookName, handler: HookHandler): () => void;
  /** Get active pipeline IDs from the host's perspective. */
  getActivePipelines(): string[];
  /** Signal stage completion to the pipeline engine. */
  handleStageComplete(pipelineId: string, stageId: StageId, result: StageCompletePayload): void;
  /** Get the current stage for a pipeline. */
  getCurrentStage(pipelineId: string): StageId | null;
  /** Get input artifacts for the current stage. */
  getStageInputArtifacts(pipelineId: string, stageId: StageId): ArtifactRef[];
}

export type HookName = 'before_prompt_build' | 'before_tool_call' | 'subagent_ended' | 'task:spawn';

export type HookHandler = (context: HookContext) => HookResult | Promise<HookResult>;

export interface HookContext {
  hookName: HookName;
  /** For before_tool_call: the tool being called */
  toolName?: string;
  /** For before_tool_call: tool call arguments */
  toolArgs?: Record<string, unknown>;
  /** For subagent_ended: the label of the completed subagent */
  label?: string;
  /** For subagent_ended: host-reported task status */
  status?: string;
  /** For subagent_ended: process exit code when available */
  exitCode?: number;
  /** For subagent_ended: timeout marker when available */
  timedOut?: boolean;
  /** For subagent_ended: structured result when available */
  result?: unknown;
  /** For subagent_ended: completed artifacts when available */
  artifacts?: ArtifactRef[];
  /** For subagent_ended: explicit failure reason when available */
  failureReason?: string;
  /** For subagent_ended: the output/result */
  output?: string;
  /** For before_prompt_build: current prompt context */
  promptContext?: Record<string, unknown>;
}

export interface HookResult {
  /** Prompt text to inject (before_prompt_build) */
  promptInjection?: string;
  /** Modified tool args (before_tool_call) */
  modifiedArgs?: Record<string, unknown>;
  /** Whether to proceed with the original action */
  proceed: boolean;
  /** Advisory message for the host */
  advisory?: string;
}

export interface StageCompletePayload {
  outcome: StageCompletionOutcome;
  artifacts: ArtifactRef[];
  failureReason?: string;
}

// ── PluginAdapter ───────────────────────────────────────────────

export interface PluginAdapterOptions {
  bridge?: HostBridge;
  complianceRouter?: ComplianceRouter;
  knowledgeInjector?: RoleKnowledgeInjector;
  /** If true, operate in CLI-only mode (no hook registration). */
  cliOnly?: boolean;
  /** Host adapter for programmatic task spawning (AC-19.10). */
  hostAdapter?: SevoHostAdapter;
  /** Pipeline engine used for advance-on-complete state transitions. */
  pipelineEngine?: PipelineEngine;
  /** Gate engine used by advanceOnComplete for gate-stage verdict evaluation. */
  gateEngine?: GateEngine;
  /** Read current persisted pipeline state for stage-gate checks and dispatch. */
  getPipelineState?: (pipelineId: string) => PipelineState | null;
  /** Endgame delivery chain configuration (AC-19.12). */
  endgameDelivery?: Partial<EndgameDeliveryConfig>;
  /** Whether this is a single-agent environment (AC-19.13). */
  singleAgent?: boolean;
  /** Base path containing pipelines/<id>/events.jsonl for decision logging. */
  pipelineBasePath?: string;
}

/**
 * PluginAdapter orchestrates SEVO's integration with a host environment.
 *
 * In hosted mode (bridge provided): registers hooks, injects prompts, handles events.
 * In CLI-only mode (no bridge): provides direct method access without hooks.
 *
 * AC-19.10: When hostAdapter.supportsSpawn() is true, subagent_ended triggers
 * programmatic dispatch via hostAdapter.spawnTask/spawnParallelTasks.
 * When supportsSpawn() is false, falls back to prompt injection (backward compat).
 */
export class PluginAdapter {
  private readonly bridge: HostBridge | null;
  private readonly complianceRouter: ComplianceRouter | null;
  private readonly knowledgeInjector: RoleKnowledgeInjector;
  private readonly cliOnly: boolean;
  private readonly hostAdapter: SevoHostAdapter | null;
  private readonly endgameConfig: EndgameDeliveryConfig;
  private readonly singleAgent: boolean;
  private readonly pipelineEngine: PipelineEngine | null;
  private readonly gateEngine: GateEngine | null;
  private readonly getPipelineState: ((pipelineId: string) => PipelineState | null) | null;
  private readonly pipelineBasePath: string | null;
  private readonly disposers: Array<() => void> = [];
  private registered = false;

  constructor(options: PluginAdapterOptions = {}) {
    this.bridge = options.bridge ?? null;
    this.complianceRouter = options.complianceRouter ?? null;
    this.knowledgeInjector = options.knowledgeInjector ?? new RoleKnowledgeInjector();
    this.cliOnly = options.cliOnly ?? (options.bridge == null);
    this.hostAdapter = options.hostAdapter ?? null;
    this.endgameConfig = { ...DEFAULT_ENDGAME_DELIVERY, ...options.endgameDelivery };
    this.singleAgent = options.singleAgent ?? false;
    this.pipelineEngine = options.pipelineEngine ?? null;
    this.gateEngine = options.gateEngine ?? null;
    this.getPipelineState = options.getPipelineState ?? null;
    this.pipelineBasePath = options.pipelineBasePath ?? null;
  }

  /**
   * Register all three hooks with the host bridge.
   * No-op in CLI-only mode.
   */
  register(): void {
    if (this.cliOnly || !this.bridge || this.registered) return;

    this.disposers.push(
      this.bridge.registerHook('before_prompt_build', (ctx) => this.handleBeforePromptBuild(ctx)),
    );
    this.disposers.push(
      this.bridge.registerHook('before_tool_call', (ctx) => this.handleBeforeToolCall(ctx)),
    );
    this.disposers.push(
      this.bridge.registerHook('subagent_ended', (ctx) => this.handleSubagentEnded(ctx)),
    );
    this.disposers.push(
      this.bridge.registerHook('task:spawn', (ctx) => this.handleTaskSpawn(ctx)),
    );

    this.registered = true;
  }

  /** Unregister all hooks. */
  dispose(): void {
    for (const dispose of this.disposers) {
      dispose();
    }
    this.disposers.length = 0;
    this.registered = false;
  }

  /** Whether hooks are currently registered. */
  isRegistered(): boolean {
    return this.registered;
  }

  /** Whether operating in CLI-only (degraded) mode. */
  isCliOnly(): boolean {
    return this.cliOnly;
  }

  // ── Hook Handlers ───────────────────────────────────────────

  /**
   * before_prompt_build: Inject SEVO Auto-Advance directive + stage principles.
   * Connects RoleKnowledgeInjector to inject role knowledge.
   */
  handleBeforePromptBuild(context: HookContext): HookResult {
    if (!this.bridge) {
      return { proceed: true };
    }

    const activePipelines = this.bridge.getActivePipelines();
    if (activePipelines.length === 0) {
      return { proceed: true };
    }

    const injections: string[] = [];

    for (const pipelineId of activePipelines) {
      const currentStage = this.bridge.getCurrentStage(pipelineId);
      if (!currentStage) continue;

      // Inject role knowledge for the current stage
      const principles = this.knowledgeInjector.getPrinciples(currentStage);
      if (principles) {
        injections.push(`[SEVO Stage Principles — ${currentStage}]\n${principles}`);
      }

      // Inject auto-advance directive
      injections.push(
        `[SEVO Auto-Advance] Pipeline ${pipelineId} is at stage "${currentStage}". ` +
        `Dispatch the next task for this stage using label: ${createSevoTag(pipelineId, currentStage, 1)}`
      );
    }

    return {
      proceed: true,
      promptInjection: injections.length > 0 ? injections.join('\n\n') : undefined,
    };
  }

  /**
   * before_tool_call: Block sessions_spawn calls that involve code changes
   * unless they carry a valid SEVO tag or are sevo:create commands.
   *
   * Enforcement strategy (hardened 2026-05-17):
   * 1. Non sessions_spawn → pass through.
   * 2. Already tagged with sevo:<id>:<stage>:<attempt> → proceed.
   * 3. Label/task is a sevo:create command → proceed (prevent dead loop).
   * 4. If ComplianceRouter is configured → evaluate; block on guide/create.
   * 5. Fallback heuristic: if task description indicates code file changes → block.
   * 6. Otherwise → proceed (pure query/audit/research tasks).
   */
  async handleBeforeToolCall(context: HookContext): Promise<HookResult> {
    const { toolName, toolArgs } = context;

    // Only intercept sessions_spawn calls
    if (toolName !== 'sessions_spawn') {
      return { proceed: true };
    }

    const args = toolArgs ?? {};
    const label = (args['label'] as string) ?? '';
    const task = (args['task'] as string) ?? '';

    // If already tagged with SEVO pipeline tag, just proceed
    if (parseSevoTag(label)) {
      const gate = this.evaluateSpawnStageGate(label);
      if (!gate.proceed) return gate;
      return { proceed: true };
    }

    // Allow sevo:create commands through (prevent dead loop)
    if (label.startsWith('sevo:create') || task.includes('sevo:create')) {
      return { proceed: true };
    }

    // ComplianceRouter check for unmanaged tasks
    if (this.complianceRouter) {
      const taskContext: ComplianceTaskContext = {
        description: task || label,
        label,
      };

      const complianceResult = await this.complianceRouter.evaluate(taskContext);

      if (complianceResult.action === 'pass') {
        return { proceed: true };
      }

      // guide or create → BLOCK the spawn, advise to use sevo:create
      return {
        proceed: false,
        advisory: `[SEVO Intercept] Task blocked — code changes require SEVO pipeline. ` +
          `Use \`sevo:create <project-slug>\` to start a pipeline. ` +
          `Reason: ${complianceResult.reason}`,
      };
    }

    // Fallback heuristic when ComplianceRouter is not configured:
    // Block if task description indicates code file changes.
    if (this.looksLikeCodeChangeTask(task, label)) {
      return {
        proceed: false,
        advisory: `[SEVO Intercept] Task blocked — detected code change intent without SEVO tag. ` +
          `Use \`sevo:create <project-slug>\` to start a pipeline.`,
      };
    }

    return { proceed: true };
  }

  /**
   * Heuristic: does the task/label suggest code file modifications?
   * Used as fallback when ComplianceRouter is not available.
   */
  private looksLikeCodeChangeTask(task: string, label: string): boolean {
    const combined = `${task} ${label}`.toLowerCase();

    // Indicators of code change intent
    const codeChangePatterns = [
      /\b(fix|implement|refactor|add|create|write|update|modify|patch|rewrite)\b.*\b(code|file|module|component|function|class|method|endpoint|api|handler|service|plugin|hook|test)\b/,
      /\b(src|lib|components|pages|routes|controllers|services|models|utils|helpers)\//,
      /\.(ts|js|tsx|jsx|py|rs|go|java|rb|php|vue|svelte)\b/,
      /\b(implement|coding|develop|scaffold)\b/,
      /\bbuild\b.*\.(ts|js|tsx|jsx|json|py|rs|go|java)\b/,
      /\bgenerate\b.*\.(ts|js|tsx|jsx|json|py|rs|go|java)\b/,
      /\bfix[-_].*\b/,  // labels like fix-readme-honesty, fix-p0-sevo-*
    ];

    return codeChangePatterns.some(pattern => pattern.test(combined));
  }

  /**
   * subagent_ended: Parse SEVO tag from label, signal stage completion
   * to PipelineEngine via bridge, then programmatically dispatch next stage (AC-19.10).
   *
   * Dispatch strategy:
   * 1. If hostAdapter.supportsSpawn() → programmatic dispatch via API
   * 2. Otherwise → prompt injection fallback (backward compatible)
   *
   * AC-19.1: If completed stage is 'review' with outcome 'passed',
   * triggers the endgame delivery chain.
   * AC-19.11: If next stages are parallel, dispatches all at once.
   */
  async handleSubagentEnded(context: HookContext): Promise<HookResult> {
    const { label, output } = context;
    if (!label || !this.bridge) {
      return { proceed: true };
    }

    const tag = parseSevoTag(label);
    if (!tag) {
      return { proceed: true };
    }

    const completion = this.extractCompletionPayload(context);

    if (this.pipelineEngine && this.pipelineBasePath) {
      const advanceResult = await advanceOnComplete(
        {
          pipelineId: tag.pipelineId,
          stageId: tag.stageId,
          outcome: completion.outcome,
          output,
          artifacts: completion.artifacts,
          failureReason: completion.failureReason,
          sevoOutcome: completion.outcome,
        },
        {
          basePath: this.pipelineBasePath,
          engine: this.pipelineEngine,
          adapter: this.hostAdapter,
          gateEngine: this.gateEngine,
          getPipelineState: this.getPipelineState ?? undefined,
        },
      );

      if (advanceResult.outcome === 'passed') {
        await this.handlePostAdvanceDispatch(tag, advanceResult.triggeredStages);
      }

      return {
        proceed: true,
        advisory: `[SEVO] Stage ${tag.stageId} completed for pipeline ${tag.pipelineId} with outcome ${advanceResult.outcome}.`,
      };
    }

    // Backward-compatible bridge path when the core PipelineEngine is not wired.
    this.bridge.handleStageComplete(tag.pipelineId, tag.stageId, completion);

    if (completion.outcome !== 'passed') {
      return {
        proceed: true,
        advisory: `[SEVO] Stage ${tag.stageId} completed for pipeline ${tag.pipelineId} with outcome ${completion.outcome}.`,
      };
    }

    // AC-19.10: Programmatic dispatch if host adapter supports it
    if (this.hostAdapter && this.hostAdapter.supportsSpawn?.()) {
      const advisory = await this.handlePostAdvanceDispatch(tag);
      return {
        proceed: true,
        advisory: advisory ?? `[SEVO] Stage ${tag.stageId} completed for pipeline ${tag.pipelineId}. Next stage dispatched programmatically.`,
      };
    }

    // Fallback: prompt injection (backward compatible, no programmatic spawn)
    return {
      proceed: true,
      advisory: `[SEVO] Stage ${tag.stageId} completed for pipeline ${tag.pipelineId}`,
    };
  }

  /**
   * task:spawn: Evaluate whether a spawn request should be allowed.
   * Delegates to handleSpawnTask from the LLM intercept gate.
   * Returns allowed: false to block task dispatch.
   */
  async handleTaskSpawn(context: HookContext): Promise<HookResult> {
    const { toolArgs } = context;
    const label = (toolArgs?.['label'] as string) ?? '';
    const task = (toolArgs?.['task'] as string) ?? '';

    const result = await handleSpawnTask({ label, taskText: task });

    if (!result.allowed) {
      return {
        proceed: false,
        advisory: result.message ?? '[SEVO] Task spawn blocked by LLM intercept gate.',
      };
    }

    const gate = this.evaluateSpawnStageGate(label);
    if (!gate.proceed) return gate;

    return { proceed: true };
  }

  // ── Programmatic Dispatch (AC-19.10, AC-19.11) ─────────────

  private extractCompletionPayload(context: HookContext): StageCompletePayload {
    const ctx = context as unknown as Record<string, unknown>;
    const event = this.asRecord(ctx['event']);
    const result = this.asRecord(context.result) ?? this.asRecord(event?.['result']);
    const status = this.firstString(context.status, event?.['status'], result?.['status']).toLowerCase();
    const output = this.firstString(context.output, event?.['output'], result?.['output'], result?.['message']);
    const exitCode = this.firstNumber(context.exitCode, event?.['exitCode'], result?.['exitCode']);
    const timedOut = context.timedOut === true
      || event?.['timedOut'] === true
      || result?.['timedOut'] === true
      || ['timed_out', 'timeout', 'timedout'].includes(status)
      || /\b(timed out|timeout)\b/i.test(output);
    const failed = !timedOut && (
      ['failed', 'failure', 'error', 'errored', 'cancelled', 'canceled'].includes(status)
      || (exitCode != null && exitCode !== 0)
      || output.includes('[SEVO:FAILED]')
    );
    const outcome: StageCompletionOutcome = timedOut ? 'timed_out' : failed ? 'failed' : 'passed';
    const artifacts = this.extractArtifacts(context, event, result);
    return {
      outcome,
      artifacts,
      failureReason: outcome === 'passed'
        ? undefined
        : this.firstString(context.failureReason, event?.['failureReason'], result?.['failureReason'])
          || (outcome === 'timed_out' ? 'Stage timed out' : output.slice(0, 500) || 'Stage failed'),
    };
  }

  private async handlePostAdvanceDispatch(tag: SevoTag, triggeredStages?: StageId[]): Promise<string | undefined> {
    if (!this.hostAdapter || !this.hostAdapter.supportsSpawn?.()) return undefined;

    // AC-19.1: Check if review passed → trigger endgame delivery chain
    if (tag.stageId === 'review' && this.endgameConfig.enabled) {
      await this.triggerEndgameChain(tag.pipelineId);
      return `[SEVO] Stage ${tag.stageId} completed for pipeline ${tag.pipelineId}. Endgame delivery chain triggered programmatically.`;
    }

    if (tag.stageId === 'deploy') {
      await this.runEndgameLivenessVerification(tag.pipelineId);
    }

    // advanceOnComplete already triggers stages through hostAdapter.triggerStage when available.
    // Keep legacy spawn dispatch only for bridge-only hosts that do not wire PipelineEngine.
    if (!triggeredStages) {
      await this.dispatchNextStages(tag.pipelineId, tag.stageId);
    }

    return `[SEVO] Stage ${tag.stageId} completed for pipeline ${tag.pipelineId}. Next stage dispatched programmatically.`;
  }

  private extractArtifacts(
    context: HookContext,
    event?: Record<string, unknown>,
    result?: Record<string, unknown>,
  ): ArtifactRef[] {
    const candidates = [context.artifacts, event?.['artifacts'], result?.['artifacts']];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate.filter(this.isArtifactRef);
    }
    return [];
  }

  private isArtifactRef(value: unknown): value is ArtifactRef {
    if (!value || typeof value !== 'object') return false;
    const record = value as Record<string, unknown>;
    return typeof record['id'] === 'string'
      && typeof record['type'] === 'string'
      && typeof record['path'] === 'string'
      && typeof record['createdAt'] === 'string';
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : undefined;
  }

  private firstString(...values: unknown[]): string {
    for (const value of values) {
      if (typeof value === 'string') return value;
    }
    return '';
  }

  private firstNumber(...values: unknown[]): number | undefined {
    for (const value of values) {
      if (typeof value === 'number') return value;
    }
    return undefined;
  }

  /**
   * Dispatch next activatable stages after a stage completes.
   * If multiple stages are activatable (parallel fork), dispatches all at once (AC-19.11).
   */
  private async dispatchNextStages(pipelineId: string, completedStage: StageId): Promise<void> {
    if (!this.hostAdapter || !this.getPipelineState) return;

    const state = this.getPipelineState(pipelineId);
    if (!state) return;

    const activatable = getActivatableStages(state);
    if (activatable.length === 0) return;

    const config = this.hostAdapter.getProjectConfig();
    const defaultAgent = config.defaultAgentId ?? 'cc';

    if (activatable.length === 1) {
      // Single next stage
      const nextStage = activatable[0]!;
      const agentId = config.stageAgents?.[nextStage] ?? defaultAgent;
      const spawnOptions = this.buildSpawnOptions(pipelineId, nextStage);
      const roleEvent = this.validateStageDispatch(agentId, nextStage, pipelineId);
      if (roleEvent?.action === 'warning') {
        spawnOptions.roleWarning = roleEvent.reason;
      }

      await this.hostAdapter.spawnTask?.(
        agentId,
        this.buildStageTaskPrompt(pipelineId, nextStage, roleEvent),
        spawnOptions,
      );
    } else {
      // AC-19.11: Multiple parallel stages — dispatch all at once
      const tasks: ParallelTaskDescriptor[] = activatable.map((stageId) => {
        const agentId = config.stageAgents?.[stageId] ?? defaultAgent;
        const options = this.buildSpawnOptions(pipelineId, stageId);
        const roleEvent = this.validateStageDispatch(agentId, stageId, pipelineId);
        if (roleEvent?.action === 'warning') options.roleWarning = roleEvent.reason;
        return {
          agentId,
          task: this.buildStageTaskPrompt(pipelineId, stageId, roleEvent),
          options,
        };
      });

      await this.hostAdapter.spawnParallelTasks?.(tasks);
    }
  }


  private async runEndgameLivenessVerification(pipelineId: string): Promise<void> {
    if (!this.hostAdapter?.runPdcaLivenessCheck) return;
    const result = await this.hostAdapter.runPdcaLivenessCheck(pipelineId);
    if (result.blocked) {
      const reason = `PDCA liveness P0 failed: ${(result.p0Failures ?? []).join(', ')}`;
      await this.hostAdapter.markPipelineBlocked?.(pipelineId, reason);
      await this.hostAdapter.notifyUser?.(`[SEVO] Pipeline ${pipelineId} blocked before final gap scan. ${reason}`);
    } else if ((result.p1Failures ?? []).length > 0) {
      await this.hostAdapter.notifyUser?.(`[SEVO] Pipeline ${pipelineId} liveness warnings: ${(result.p1Failures ?? []).join(', ')}`);
    }
  }

  /**
   * Endgame Delivery Chain (AC-19.1, AC-19.12).
   * Triggered when review passes. Dispatches: README → bump → publish → gap scan.
   * Each step is configurable via endgameDelivery config.
   */
  private async triggerEndgameChain(pipelineId: string): Promise<void> {
    if (!this.hostAdapter) return;

    const config = this.hostAdapter.getProjectConfig();
    const defaultAgent = config.defaultAgentId ?? 'cc';

    const chain: Array<{ step: string; enabled: boolean; task: string }> = [
      {
        step: 'readme',
        enabled: this.endgameConfig.autoReadme,
        task: `[SEVO Endgame] Pipeline ${pipelineId}: Generate/update README.md with installation, usage, and API documentation.`,
      },
      {
        step: 'readme-honesty',
        enabled: this.endgameConfig.autoReadmeHonesty ?? true,
        task: this.buildReadmeHonestyTask(pipelineId),
      },
      {
        step: 'publish',
        enabled: this.endgameConfig.autoPublish,
        task: `[SEVO Endgame] Pipeline ${pipelineId}: Bump version and publish package (npm publish / platform deploy).`,
      },
      {
        step: 'gap-scan',
        enabled: this.endgameConfig.autoGapScan,
        task: `[SEVO Endgame] Pipeline ${pipelineId}: Run terminal gap scan — compare spec FRs against implementation, report unimplemented items.`,
      },
    ];

    // Dispatch enabled steps sequentially (each depends on previous)
    // The first step is dispatched now; subsequent steps will be triggered
    // by their own subagent_ended events via the pipeline state machine.
    const firstEnabled = chain.find((s) => s.enabled);
    if (!firstEnabled) return;

    const label = createSevoTag(pipelineId, 'deploy' as StageId, 1);
    await this.hostAdapter.spawnTask?.(defaultAgent, firstEnabled.task, {
      label,
      timeoutSeconds: 1200,
      roleKnowledge: this.singleAgent
        ? this.knowledgeInjector.getPrinciples('deploy' as StageId)
        : undefined,
    });
  }

  /**
   * Build the task prompt for README honesty verification (B10).
   * Extracts CLI commands from README backticks and verifies each is real.
   */
  private buildReadmeHonestyTask(pipelineId: string): string {
    const cliBin = this.endgameConfig.readmeHonestyCliBin;
    const binClause = cliBin
      ? `The CLI binary name is "${cliBin}".`
      : `Derive the CLI binary name from the project's package.json "bin" field.`;

    return (
      `[SEVO Endgame] Pipeline ${pipelineId}: README honesty check (B10). ` +
      `${binClause} ` +
      `Extract all backtick-quoted commands that start with the CLI binary from README.md. ` +
      `For each unique subcommand, run \`npx <cli_bin> <subcommand> --help\` to verify it exists. ` +
      `If any command is not recognized, FAIL this step and report which commands are fake. ` +
      `This blocks publish until all documented commands are real.`
    );
  }

  /** Build spawn options for a stage dispatch, including role knowledge for single-agent (AC-19.13). */
  private buildSpawnOptions(pipelineId: string, stageId: StageId): SpawnTaskOptions {
    const label = createSevoTag(pipelineId, stageId, 1);
    return {
      label,
      timeoutSeconds: this.getStageTimeout(stageId),
      // AC-19.13: Inject role knowledge for single-agent users
      roleKnowledge: this.singleAgent
        ? this.knowledgeInjector.getPrinciples(stageId)
        : undefined,
    };
  }

  /** Build a task prompt for dispatching a stage. */
  private buildStageTaskPrompt(pipelineId: string, stageId: StageId, roleEvent?: RoleMismatchEvent | null): string {
    const warning = roleEvent?.action === 'warning'
      ? ` Role degradation warning: ${roleEvent.reason}. You are the single available agent, so explicitly cover the ${roleEvent.requiredRole} responsibilities before producing artifacts.`
      : '';
    const config = this.hostAdapter?.getProjectConfig();
    const standard = formatStageStandardForPrompt(
      stageId,
      getStageStandard(stageId, { projectRoot: config?.projectRoot ?? process.cwd() }),
    );
    const specGateCheck = stageId === 'spec-review-gate'
      ? '\n\n[SEVO Spec Review Gate]\nKeep the required user-layer section order before 功能需求. The four-section semantic judgment is performed by SpecSectionsRule LLM gate.'
      : '';
    const specReadInstruction = config
      ? buildSpecReadInstruction(pipelineId, stageId, config)
      : '';
    return [
      specReadInstruction,
      `[SEVO Auto-Advance] Pipeline ${pipelineId}: Execute stage "${stageId}". Follow SEVO stage principles and produce required artifacts.${warning}`,
      standard,
      specGateCheck,
    ].filter((part) => part.trim().length > 0).join('\n\n');
  }

  private evaluateSpawnStageGate(label: string): HookResult {
    const tag = parseSevoTag(label);
    if (!tag || !this.getPipelineState) return { proceed: true };
    const result = evaluateStageGate(this.getPipelineState(tag.pipelineId), {
      pipelineId: tag.pipelineId,
      targetStage: tag.stageId,
      label,
    });
    if (result.pass) return { proceed: true };
    if (result.decision && this.pipelineBasePath) {
      appendAdvanceDecision(this.pipelineBasePath, result.decision);
    }
    return {
      proceed: false,
      advisory: `[SEVO Stage Gate] ${result.reason ?? 'Task stage is not active.'}`,
    };
  }

  private validateStageDispatch(agentId: string, stageId: StageId, pipelineId: string): RoleMismatchEvent | null {
    const config = this.hostAdapter?.getProjectConfig();
    if (!config?.roleAssignment) return null;

    const agentIds = this.collectConfiguredAgentIds(config.stageAgents, config.defaultAgentId, config.roleAssignment.agentRoles);
    const matcher = new RoleTaskMatcher({
      agentRoles: config.roleAssignment.agentRoles,
      namingPatterns: config.roleAssignment.namingPatterns,
      stageRoles: config.roleAssignment.stageRoles,
      multiAgent: this.singleAgent ? false : agentIds.length > 1,
      strictRoleMatching: config.strictRoleMatching === true,
      fallbackAgentId: config.roleAssignment.fallbackAgentId ?? config.defaultAgentId ?? agentIds[0],
      agentIds,
    });
    const result = matcher.match({
      agentId,
      stageId,
      taskLabel: createSevoTag(pipelineId, stageId, 1),
      taskDescription: `Pipeline ${pipelineId} stage ${stageId}`,
    });
    if (!result.mismatchEvent) return null;

    this.appendDispatchAudit(config.dispatchAuditPath, result.mismatchEvent);
    if (!result.allowed) {
      throw new RoleDispatchBlockedError(result.mismatchEvent);
    }
    return result.mismatchEvent;
  }

  private collectConfiguredAgentIds(
    stageAgents?: Partial<Record<StageId, string>>,
    defaultAgentId?: string,
    agentRoles?: Record<string, unknown>,
  ): string[] {
    return [...new Set([
      ...Object.keys(agentRoles ?? {}),
      ...Object.values(stageAgents ?? {}).filter((value): value is string => Boolean(value)),
      ...(defaultAgentId ? [defaultAgentId] : []),
    ])];
  }

  private appendDispatchAudit(configuredPath: string | undefined, event: RoleMismatchEvent): void {
    const auditPath = configuredPath ?? path.join(process.cwd(), 'dispatch-audit.jsonl');
    fs.mkdirSync(path.dirname(auditPath), { recursive: true });
    fs.appendFileSync(auditPath, JSON.stringify(event) + '\n', 'utf8');
  }

  /** Get appropriate timeout for a stage. */
  private getStageTimeout(stageId: StageId): number {
    switch (stageId) {
      case 'spec':
      case 'contract':
        return 3600;
      case 'implement':
        return 1800;
      case 'review':
      case 'smoke-test':
      case 'ux-acceptance':
      case 'pm-commercial-review':
        return 1200;
      default:
        return 600;
    }
  }

  // ── Direct API (CLI-only mode or programmatic access) ───────

  /**
   * Directly inject principles for a stage (bypasses hook system).
   * Useful in CLI-only mode.
   */
  injectPrinciples(stageId: StageId): string {
    return this.knowledgeInjector.getPrinciples(stageId);
  }

  /**
   * Directly evaluate compliance for a task context.
   * Useful in CLI-only mode.
   */
  async evaluateCompliance(taskContext: ComplianceTaskContext): Promise<ComplianceResult | null> {
    if (!this.complianceRouter) return null;
    return await this.complianceRouter.evaluate(taskContext);
  }

  /**
   * Create a SEVO tag for a given pipeline stage.
   */
  createTag(pipelineId: string, stageId: StageId, attempt: number = 1): string {
    return createSevoTag(pipelineId, stageId, attempt);
  }

  /**
   * Parse a SEVO tag from a label string.
   */
  parseTag(label: string): SevoTag | null {
    return parseSevoTag(label);
  }
}
