/**
 * ComplianceRouter — routes unorchestrated dev tasks based on compliance mode.
 *
 * Three modes (arc42 §5.5):
 *   - guide:      inject a prompt hint suggesting SEVO, don't create pipeline
 *   - auto-route: automatically classify + create pipeline
 *   - off:        no intervention
 *
 * Called exclusively by PluginAdapter (before_tool_call hook).
 * Does NOT depend on PipelineEngine — returns a decision that the caller acts on.
 */

import type { TaskLevel, TaskScope } from '../types/index.js';
import { classifyLevel } from '../router/level-classifier.js';
import { LLMProvider } from '../llm/index.js';
import type { LLMProviderConfig } from '../llm/index.js';

// ── Types ───────────────────────────────────────────────────────

/** Compliance mode (spec §FR-13, arc42 §5.5). */
export type ComplianceMode = 'guide' | 'auto-route' | 'off';

/** Task context passed to evaluate(). */
export interface ComplianceTaskContext {
  /** Task description / title from the spawn call. */
  description: string;
  /** Optional label from the spawn call. */
  label?: string;
  /** Whether the task already has a SEVO tag (sevo:<id>:<stage>:<attempt>). */
  hasSevoTag?: boolean;
  /** Optional code statistics for more accurate level classification. */
  codeStats?: TaskScope;
}

/** Result of compliance evaluation. */
export type ComplianceAction = 'pass' | 'guide' | 'create';

export interface ComplianceResult {
  /** What the caller should do. */
  action: ComplianceAction;
  /** Classified level (only set when action is 'guide' or 'create'). */
  level?: TaskLevel;
  /** Human-readable reason for the decision. */
  reason: string;
}

// ── LLM Scope Inference ────────────────────────────────────────

const SCOPE_INFERENCE_SYSTEM_PROMPT = `You are a task scope analyzer for a software development pipeline.
Given a task description, determine:
1. isNewModule: Is this creating a brand new module/system from scratch?
2. hasDataModelChange: Does this involve database schema changes, data model migrations, or data structure modifications?
3. hasGovernanceChange: Does this involve changes to permissions, security policies, or governance rules?
4. hasReleaseTargetChange: Does this involve changes to deployment targets or release configurations?
5. isCrossDomain: Does this affect multiple distinct modules/domains?
6. affectedDomains: If cross-domain, list the domain names.
7. estimatedFiles: Estimated number of files that will be changed (1-50).
8. estimatedLines: Estimated number of lines that will be changed (1-5000).

Respond ONLY with a JSON object, no markdown fences, no explanation:
{"isNewModule":false,"hasDataModelChange":false,"hasGovernanceChange":false,"hasReleaseTargetChange":false,"isCrossDomain":false,"affectedDomains":[],"estimatedFiles":3,"estimatedLines":100}`;

function parseTaskScopeFromLLM(raw: string): TaskScope {
  // Strip markdown fences if present
  const cleaned = raw.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
  const parsed = JSON.parse(cleaned);

  const estimatedFiles = typeof parsed.estimatedFiles === 'number' ? parsed.estimatedFiles : 3;
  const estimatedLines = typeof parsed.estimatedLines === 'number' ? parsed.estimatedLines : 100;
  const affectedDomains = parsed.isCrossDomain && Array.isArray(parsed.affectedDomains)
    ? parsed.affectedDomains
    : undefined;
  const isNewModule = Boolean(parsed.isNewModule);
  const hasDataModelChange = Boolean(parsed.hasDataModelChange);
  const hasGovernanceChange = Boolean(parsed.hasGovernanceChange);
  const hasReleaseTargetChange = Boolean(parsed.hasReleaseTargetChange);

  // L0 must be explicitly opted-in (FR-2 AC3). When the LLM has semantically
  // judged this as a micro-change (single file, <50 lines, no risky flags),
  // treat that judgement as the explicit opt-in so historical L0 routing
  // through ComplianceRouter still works.
  const looksMicro =
    estimatedFiles <= 1 &&
    estimatedLines < 50 &&
    (affectedDomains?.length ?? 0) <= 1 &&
    !isNewModule &&
    !hasDataModelChange &&
    !hasGovernanceChange &&
    !hasReleaseTargetChange;

  return {
    estimatedFiles,
    estimatedLines,
    affectedDomains,
    isNewModule,
    hasDataModelChange,
    hasGovernanceChange,
    hasReleaseTargetChange,
    userExplicitL0: looksMicro || undefined,
  };
}

// ── ComplianceRouter ────────────────────────────────────────────

export interface ComplianceRouterConfig {
  /** Current compliance mode. Defaults to 'guide'. */
  mode?: ComplianceMode;
  /** LLM provider configuration for semantic scope inference. */
  llm?: LLMProviderConfig;
}

export class ComplianceRouter {
  private mode: ComplianceMode;
  private llm: LLMProvider;

  constructor(config?: ComplianceRouterConfig) {
    this.mode = config?.mode ?? 'guide';
    this.llm = new LLMProvider(config?.llm);
  }

  /**
   * Evaluate whether a task should enter the SEVO pipeline.
   *
   * Decision logic:
   * 1. If mode is 'off', always pass.
   * 2. If task already has a SEVO tag, pass (already orchestrated).
   * 3. Classify the task level (async — uses LLM for scope inference).
   * 4. If mode is 'guide', return guide action with level info.
   * 5. If mode is 'auto-route', return create action with level info.
   */
  async evaluate(taskContext: ComplianceTaskContext): Promise<ComplianceResult> {
    // Off mode: no intervention
    if (this.mode === 'off') {
      return { action: 'pass', reason: 'Compliance mode is off' };
    }

    // Already orchestrated: skip
    if (taskContext.hasSevoTag) {
      return { action: 'pass', reason: 'Task already has SEVO tag' };
    }

    // Classify the task
    const level = await this.classifyLevel(taskContext.description, taskContext.codeStats);

    // L0 tasks don't need full pipeline guidance
    if (level === 'L0' && this.mode === 'guide') {
      return {
        action: 'pass',
        level,
        reason: 'L0 micro-change, no pipeline guidance needed',
      };
    }

    // Guide mode: suggest but don't create
    if (this.mode === 'guide') {
      return {
        action: 'guide',
        level,
        reason: `Task classified as ${level}. Consider running through SEVO pipeline for quality assurance.`,
      };
    }

    // Auto-route mode: create pipeline
    return {
      action: 'create',
      level,
      reason: `Task classified as ${level}. Auto-routing into SEVO pipeline.`,
    };
  }

  /**
   * Classify a task's level based on description and optional code stats.
   *
   * Uses the existing level-classifier from the Router module.
   * If no codeStats are provided, infers scope via LLM semantic analysis.
   */
  async classifyLevel(description: string, codeStats?: TaskScope): Promise<TaskLevel> {
    const scope = codeStats ?? await this.inferScopeFromDescription(description);
    const { level } = classifyLevel(scope);
    return level;
  }

  /** Get the current compliance mode. */
  getMode(): ComplianceMode {
    return this.mode;
  }

  /** Update the compliance mode at runtime. */
  setMode(mode: ComplianceMode): void {
    this.mode = mode;
  }

  // ── Private ─────────────────────────────────────────────────

  /**
   * Infer a TaskScope from a task description using LLM semantic analysis.
   * The LLM evaluates the description and returns structured scope metadata.
   */
  private async inferScopeFromDescription(description: string): Promise<TaskScope> {
    const response = await this.llm.chat([
      { role: 'system', content: SCOPE_INFERENCE_SYSTEM_PROMPT },
      { role: 'user', content: description || '(empty task description)' },
    ]);

    return parseTaskScopeFromLLM(response);
  }
}
