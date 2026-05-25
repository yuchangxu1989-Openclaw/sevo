/**
 * Pipeline Interceptor — FR-35 enforcement of full R&D activity pipeline coverage.
 *
 * Responsibilities:
 * - AC-35.1: Intercept spawn requests that modify spec files of registered projects
 * - AC-35.2: Validate active pipeline exists for implement/review/publish stage tasks
 * - AC-35.3: Detect manual step-by-step dispatch bypassing the pipeline
 * - AC-35.7: Use LLM semantic analysis (not keyword matching) for intent detection
 *
 * This module is consumed by the PluginAdapter or host-level hooks to enforce
 * that all R&D activities for registered projects go through SEVO pipelines.
 */

import type { LLMProviderConfig, ChatMessage } from '../llm/index.js';
import { LLMProvider } from '../llm/index.js';
import type { PipelineInstance, PipelineInstanceStatus } from '../types/index.js';

// ── Types ───────────────────────────────────────────────────────

/** A registered project that SEVO manages. */
export interface RegisteredProject {
  /** Project slug (e.g., 'sevo', 'kivo'). */
  slug: string;
  /** File path patterns belonging to this project (glob-like prefixes). */
  pathPrefixes: string[];
  /** Spec file paths for this project. */
  specPaths?: string[];
}

/** Context of a spawn request to be evaluated. */
export interface SpawnInterceptContext {
  /** The label assigned to the spawn (may be empty). */
  label: string;
  /** The task prompt / description. */
  taskPrompt: string;
  /** Target agent ID. */
  agentId: string;
  /** File paths mentioned or targeted (if extractable). */
  targetFiles?: string[];
}

/** Intercept decision. */
export type InterceptAction = 'pass' | 'block';

/** Result of intercept evaluation. */
export interface InterceptResult {
  action: InterceptAction;
  /** Rule that triggered the intercept. */
  ruleId?: string;
  /** Human-readable message for the user. */
  message?: string;
  /** Confidence score from LLM analysis (0-1). */
  confidence?: number;
  /** Reasoning from the LLM. */
  reasoning?: string;
  /** Suggested command to resolve the block. */
  suggestion?: string;
  /** Project slug that was matched. */
  matchedProject?: string;
}

/** Store interface for querying active pipeline instances. */
export interface PipelineInstanceStore {
  /** List all instances for a project slug. */
  listByProject(projectSlug: string): PipelineInstance[];
}

/** Dispatch guard event for audit trail (AC-35.7). */
export interface InterceptAuditEvent {
  timestamp: string;
  label: string;
  agentId: string;
  action: InterceptAction;
  ruleId: string;
  confidence: number;
  reasoning: string;
  matchedProject?: string;
}

// ── LLM Semantic Analysis Prompt (AC-35.7) ──────────────────────

const INTERCEPT_ANALYSIS_SYSTEM_PROMPT = `You are a software development activity classifier for the SEVO pipeline governance system.

Given a task prompt (and optionally a label and target files), determine:
1. Does this task involve R&D activity for a registered project?
2. What type of R&D activity is it?

R&D activities include:
- Modifying spec/requirements files (product-requirements.md, arc42, ADRs)
- Implementing new features or fixing bugs in project source code
- Reviewing/auditing code or architecture
- Publishing/deploying project artifacts
- Writing or modifying tests for the project
- Refactoring project code

NOT R&D activities (should pass through):
- Pure research/investigation tasks that don't modify project files
- Infrastructure maintenance unrelated to registered projects
- Documentation that isn't a spec file (e.g., README updates, blog posts)
- Configuration changes to the host environment (not project config)
- Audit/review tasks (these are part of the pipeline, not bypassing it)

Registered projects and their path prefixes will be provided.

Respond ONLY with a JSON object (no markdown fences):
{
  "isRdActivity": true/false,
  "activityType": "spec-modification" | "implementation" | "review" | "publish" | "test" | "refactor" | "other",
  "matchedProject": "<project-slug or null>",
  "confidence": 0.0-1.0,
  "reasoning": "<brief explanation>"
}`;

// ── Pipeline Interceptor ────────────────────────────────────────

export interface PipelineInterceptorConfig {
  /** Registered projects to enforce. */
  projects: RegisteredProject[];
  /** LLM provider configuration. */
  llm?: LLMProviderConfig;
  /** Pipeline instance store for active pipeline checks. */
  store?: PipelineInstanceStore;
  /** Minimum confidence threshold for blocking (default: 0.7). */
  confidenceThreshold?: number;
}

/**
 * PipelineInterceptor evaluates spawn requests and determines whether
 * they should be blocked because they bypass the SEVO pipeline.
 *
 * Uses LLM semantic analysis (AC-35.7) — no keyword matching or regex.
 */
export class PipelineInterceptor {
  private readonly projects: RegisteredProject[];
  private readonly llm: LLMProvider;
  private readonly store: PipelineInstanceStore | null;
  private readonly confidenceThreshold: number;

  constructor(config: PipelineInterceptorConfig) {
    this.projects = config.projects;
    this.llm = new LLMProvider(config.llm);
    this.store = config.store ?? null;
    this.confidenceThreshold = config.confidenceThreshold ?? 0.7;
  }

  /**
   * Evaluate a spawn request for pipeline compliance.
   *
   * Decision flow:
   * 1. If label starts with 'sevo:', pass (already in pipeline).
   * 2. If label starts with 'exempt:', pass (manual exemption).
   * 3. Use LLM to analyze whether the task is an R&D activity for a registered project.
   * 4. If R&D activity detected with sufficient confidence:
   *    a. AC-35.1: If spec modification → block, suggest pipeline
   *    b. AC-35.2: If implement/review/publish and no active pipeline → block
   *    c. AC-35.3: If any R&D activity without sevo: prefix → block
   */
  async evaluate(context: SpawnInterceptContext): Promise<InterceptResult> {
    // ── Fast-path exemptions ──
    if (this.isSevoManaged(context.label)) {
      return { action: 'pass', ruleId: 'exempt.sevo_label' };
    }

    if (this.isManuallyExempt(context.label)) {
      return { action: 'pass', ruleId: 'exempt.manual' };
    }

    // ── LLM semantic analysis (AC-35.7) ──
    const analysis = await this.analyzeIntent(context);

    if (!analysis.isRdActivity || analysis.confidence < this.confidenceThreshold) {
      return {
        action: 'pass',
        ruleId: 'analysis.not_rd_activity',
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
      };
    }

    const matchedProject = analysis.matchedProject;
    if (!matchedProject) {
      return {
        action: 'pass',
        ruleId: 'analysis.no_project_match',
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
      };
    }

    // ── AC-35.1: Spec modification detection ──
    if (analysis.activityType === 'spec-modification') {
      return {
        action: 'block',
        ruleId: 'fr35.spec_modification',
        message: `检测到对项目 "${matchedProject}" 的 spec 文件修改意图。该项目已注册 SEVO 流水线，spec 修改必须通过流水线进行。`,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
        suggestion: `sevo:create ${matchedProject}`,
        matchedProject,
      };
    }

    // ── AC-35.2: Active pipeline validation for stage tasks ──
    if (['implementation', 'review', 'publish'].includes(analysis.activityType)) {
      const hasActivePipeline = this.hasActivePipeline(matchedProject);
      if (!hasActivePipeline) {
        return {
          action: 'block',
          ruleId: 'fr35.no_active_pipeline',
          message: `项目 "${matchedProject}" 需要活跃的 SEVO pipeline，请先执行 sevo:create ${matchedProject}`,
          confidence: analysis.confidence,
          reasoning: analysis.reasoning,
          suggestion: `sevo:create ${matchedProject}`,
          matchedProject,
        };
      }
    }

    // ── AC-35.3: Manual step-by-step dispatch detection ──
    // Task is R&D activity for a registered project but label doesn't have sevo: prefix
    return {
      action: 'block',
      ruleId: 'fr35.manual_dispatch_detected',
      message: `检测到对项目 "${matchedProject}" 的研发活动（${analysis.activityType}），但未通过 SEVO 流水线派发。请使用流水线管理此任务。`,
      confidence: analysis.confidence,
      reasoning: analysis.reasoning,
      suggestion: `sevo:create ${matchedProject}`,
      matchedProject,
    };
  }

  /**
   * Build an audit event from an intercept result (AC-35.7).
   */
  buildAuditEvent(context: SpawnInterceptContext, result: InterceptResult): InterceptAuditEvent {
    return {
      timestamp: new Date().toISOString(),
      label: context.label,
      agentId: context.agentId,
      action: result.action,
      ruleId: result.ruleId ?? 'unknown',
      confidence: result.confidence ?? 0,
      reasoning: result.reasoning ?? '',
      matchedProject: result.matchedProject,
    };
  }

  // ── Private helpers ─────────────────────────────────────────

  private isSevoManaged(label: string): boolean {
    return label.startsWith('sevo:') || label.startsWith('sevo-');
  }

  private isManuallyExempt(label: string): boolean {
    return label.startsWith('exempt:');
  }

  /**
   * Check if a project has an active pipeline instance (AC-35.2).
   */
  private hasActivePipeline(projectSlug: string): boolean {
    if (!this.store) {
      // No store available — cannot validate, pass through
      return true;
    }

    const instances = this.store.listByProject(projectSlug);
    const activeStatuses: PipelineInstanceStatus[] = ['created', 'active', 'paused'];
    return instances.some((inst) => activeStatuses.includes(inst.status));
  }

  /**
   * Use LLM to semantically analyze the spawn intent (AC-35.7).
   */
  private async analyzeIntent(context: SpawnInterceptContext): Promise<LLMAnalysisResult> {
    const projectList = this.projects
      .map((p) => `- ${p.slug}: paths=[${p.pathPrefixes.join(', ')}], specs=[${(p.specPaths ?? []).join(', ')}]`)
      .join('\n');

    const userMessage = [
      `Registered projects:\n${projectList}`,
      `\nTask label: "${context.label}"`,
      `Target agent: "${context.agentId}"`,
      context.targetFiles?.length
        ? `Target files: ${context.targetFiles.join(', ')}`
        : '',
      `\nTask prompt:\n${context.taskPrompt}`,
    ].filter(Boolean).join('\n');

    const messages: ChatMessage[] = [
      { role: 'system', content: INTERCEPT_ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ];

    try {
      const response = await this.llm.chat(messages);
      return this.parseLLMResponse(response);
    } catch {
      // LLM failure — fail open (pass through)
      return {
        isRdActivity: false,
        activityType: 'other',
        matchedProject: null,
        confidence: 0,
        reasoning: 'LLM analysis failed, defaulting to pass-through',
      };
    }
  }

  private parseLLMResponse(raw: string): LLMAnalysisResult {
    try {
      const cleaned = raw.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return {
        isRdActivity: Boolean(parsed.isRdActivity),
        activityType: parsed.activityType ?? 'other',
        matchedProject: parsed.matchedProject ?? null,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
        reasoning: parsed.reasoning ?? '',
      };
    } catch {
      return {
        isRdActivity: false,
        activityType: 'other',
        matchedProject: null,
        confidence: 0,
        reasoning: 'Failed to parse LLM response',
      };
    }
  }
}

/** Internal type for LLM analysis result. */
interface LLMAnalysisResult {
  isRdActivity: boolean;
  activityType: string;
  matchedProject: string | null;
  confidence: number;
  reasoning: string;
}
