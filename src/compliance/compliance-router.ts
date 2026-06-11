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
import { classifyByEmbedding, type EmbeddingConfig } from '../embedding/index.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const SCOPE_VECTORS_PATH = resolve(MODULE_DIR, '..', '..', 'data', 'scope-inference-vectors.json');

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

// ── Embedding-based Scope Inference ──────────────────────────────

function labelToTaskScope(label: string | null): TaskScope {
  const base: TaskScope = {
    estimatedFiles: 3,
    estimatedLines: 100,
  };

  switch (label) {
    case 'new-module':
      return { ...base, isNewModule: true, estimatedFiles: 8, estimatedLines: 400 };
    case 'cross-domain':
      return { ...base, affectedDomains: ['domain-1', 'domain-2'], estimatedFiles: 6 };
    case 'data-model':
      return { ...base, hasDataModelChange: true, estimatedFiles: 5 };
    case 'large-change':
      return { ...base, estimatedFiles: 15, estimatedLines: 1000 };
    case 'micro-change':
      return { estimatedFiles: 1, estimatedLines: 20, userExplicitL0: true };
    case 'medium-change':
      return { estimatedFiles: 3, estimatedLines: 150 };
    default:
      return base;
  }
}

// ── ComplianceRouter ────────────────────────────────────────────

export interface ComplianceRouterConfig {
  /** Current compliance mode. Defaults to 'guide'. */
  mode?: ComplianceMode;
  /** Embedding config override. */
  embeddingConfig?: EmbeddingConfig;
}

export class ComplianceRouter {
  private mode: ComplianceMode;
  private embeddingConfig?: EmbeddingConfig;

  constructor(config?: ComplianceRouterConfig) {
    this.mode = config?.mode ?? 'guide';
    this.embeddingConfig = config?.embeddingConfig;
  }

  /**
   * Evaluate whether a task should enter the SEVO pipeline.
   *
   * Decision logic:
   * 1. If mode is 'off', always pass.
   * 2. If task already has a SEVO tag, pass (already orchestrated).
   * 3. Classify the task level (async — uses embedding for scope inference).
   * 4. If mode is 'guide', return guide action with level info.
   * 5. If mode is 'auto-route', return create action with level info.
   */
  async evaluate(taskContext: ComplianceTaskContext): Promise<ComplianceResult> {
    if (this.mode === 'off') {
      return { action: 'pass', reason: 'Compliance mode is off' };
    }

    if (taskContext.hasSevoTag) {
      return { action: 'pass', reason: 'Task already has SEVO tag' };
    }

    const level = await this.classifyLevel(taskContext.description, taskContext.codeStats);

    if (level === 'L0' && this.mode === 'guide') {
      return {
        action: 'pass',
        level,
        reason: 'L0 micro-change, no pipeline guidance needed',
      };
    }

    if (this.mode === 'guide') {
      return {
        action: 'guide',
        level,
        reason: `Task classified as ${level}. Consider running through SEVO pipeline for quality assurance.`,
      };
    }

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
   * If no codeStats are provided, infers scope via embedding cosine similarity.
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

  private async inferScopeFromDescription(description: string): Promise<TaskScope> {
    try {
      const result = await classifyByEmbedding(
        description || '(empty)',
        SCOPE_VECTORS_PATH,
        { config: this.embeddingConfig },
      );
      if (result.matched) {
        return labelToTaskScope(result.label);
      }
    } catch {
      // Embedding unavailable — fall through to default
    }
    return { estimatedFiles: 3, estimatedLines: 100 };
  }
}
