/**
 * Evaluator type definitions (FR-23, FR-24, FR-25).
 *
 * Defines the standard protocol for executable gate evaluators,
 * workspace isolation status, and hybrid evaluation results.
 */

import type { GateConclusion } from '../types/index.js';

// ── FR-23: Evaluator Standard Protocol ──────────────────────────

/**
 * Evaluator registration in project config.
 * Declared in sevo.config.json: `{ evaluators: { "<stageName>": [...] } }`.
 * `script` is relative to the project's `evaluators/` directory.
 */
export interface EvaluatorConfig {
  /** Human-readable evaluator name (e.g. "test-pass-rate"). */
  name: string;
  /** Script path relative to project `evaluators/` directory. */
  script: string;
  /** Execution timeout in seconds (default: 60). */
  timeout?: number;
}

/**
 * Evaluator registration map: stage name → evaluator list.
 * Evaluators execute in array order per stage.
 */
export type EvaluatorRegistry = Record<string, EvaluatorConfig[]>;

/**
 * Standard JSON input passed to evaluator scripts via stdin.
 * AC-23.2: stdin JSON protocol.
 */
export interface EvaluatorInput {
  /** Pipeline stage name (e.g. "review", "implement"). */
  stage: string;
  /** Paths to stage output artifacts. */
  artifactPaths: string[];
  /** Project metadata (name, config path, etc.). */
  projectMeta: Record<string, unknown>;
}

/**
 * Detail item within an evaluator result.
 * Each rule check produces one detail entry.
 */
export interface EvaluatorDetailItem {
  /** Rule identifier (e.g. "min-coverage", "no-critical-lint"). */
  rule: string;
  /** Whether this specific rule passed. */
  passed: boolean;
  /** Human-readable explanation. */
  message: string;
}

/**
 * Standard JSON output from evaluator scripts via stdout.
 * AC-23.2: stdout JSON protocol.
 */
export interface EvaluatorResult {
  /** Overall evaluator verdict. */
  verdict: 'pass' | 'fail';
  /** Quantitative score (0–100). */
  score: number;
  /** Per-rule detail breakdown. */
  details: EvaluatorDetailItem[];
}

/**
 * Single evaluator execution outcome (includes metadata).
 */
export interface EvaluatorExecution {
  /** Evaluator name from config. */
  name: string;
  /** Script path that was executed. */
  script: string;
  /** Evaluator result (null when status is 'error'). */
  result: EvaluatorResult | null;
  /** Execution status. */
  status: 'completed' | 'error' | 'timeout';
  /** Error message when status is 'error' or 'timeout'. */
  errorMessage?: string;
  /** Execution duration in milliseconds. */
  durationMs: number;
}

/**
 * Aggregated result set from all evaluators for a stage.
 * AC-23.3: any fail → overall fail.
 * AC-23.5: timeout → error, not pass.
 */
export interface EvaluatorResultSet {
  /** Pipeline stage these evaluators ran against. */
  stage: string;
  /** Individual evaluator executions. */
  executions: EvaluatorExecution[];
  /** Overall verdict: 'pass' only if all evaluators pass. */
  overallVerdict: 'pass' | 'fail' | 'error';
  /** Timestamp of evaluation run. */
  evaluatedAt: string;
}

// ── FR-24: Workspace Isolation ──────────────────────────────────

/** Isolation layer status. */
export interface IsolationLayerStatus {
  /** Layer identifier. */
  layer: 'L0' | 'L4' | 'L6';
  /** Whether this layer is active. */
  active: boolean;
  /**
   * Isolation effectiveness level.
   * 'full'    — layer provides real protection against the target threat.
   * 'partial' — layer is technically active but has known gaps
   *             (e.g. same-uid chmod cannot restrict the owner).
   */
  level?: 'full' | 'partial';
  /** Description of what this layer enforces. */
  description: string;
  /** Warning message if layer could not be activated. */
  warning?: string;
}

/**
 * Isolation status report (AC-24.7).
 * Produced during pipeline create / implement stage prep.
 */
export interface IsolationStatus {
  /** Project root path. */
  projectRoot: string;
  /** Evaluators directory path. */
  evaluatorsDir: string;
  /** Per-layer status. */
  layers: IsolationLayerStatus[];
  /** Overall isolation active (at least one layer active). */
  isolated: boolean;
  /** Timestamp of status check. */
  checkedAt: string;
}

/**
 * Allowed write paths configuration for L4 isolation (AC-24.3).
 */
export interface AllowedWritePathsConfig {
  /** Glob patterns the coding agent is allowed to write to. */
  allowedWritePaths: string[];
  /** Glob patterns explicitly denied (evaluators/, docs/). */
  deniedWritePaths: string[];
}

// ── FR-25: Hybrid Evaluation ────────────────────────────────────

/** Source attribution for a verdict item (AC-25.4). */
export type VerdictSource = 'evaluator' | 'llm';

/** Single verdict item with source attribution. */
export interface HybridVerdictItem {
  /** Source of this verdict. */
  source: VerdictSource;
  /** Identifier (evaluator name or "llm-review"). */
  id: string;
  /** Pass or fail. */
  passed: boolean;
  /** Human-readable message. */
  message: string;
  /** Quantitative score when available. */
  score?: number;
}

/**
 * LLM evaluation conclusion (mirrors existing GateVerdict shape).
 * Passed into hybrid gate from the existing gate evaluation flow.
 */
export interface LlmEvaluationResult {
  /** LLM gate conclusion. */
  conclusion: GateConclusion;
  /** Issues found by LLM review. */
  issues: string[];
  /** Whether LLM evaluation was skipped (fast-fail from evaluators). */
  skipped: boolean;
  /** Reason for skipping (when skipped=true). */
  skipReason?: string;
}

/**
 * Hybrid gate verdict combining evaluator + LLM results (FR-25).
 * AC-25.3: any layer fail → overall fail.
 * AC-25.5: no evaluators → pure LLM (backward compatible).
 */
export interface HybridGateVerdict {
  /** Final combined conclusion. */
  conclusion: GateConclusion;
  /** Executable evaluator result set (null if no evaluators mounted). */
  evaluatorResults: EvaluatorResultSet | null;
  /** LLM evaluation result. */
  llmResult: LlmEvaluationResult;
  /** Per-item breakdown with source attribution (AC-25.4). */
  items: HybridVerdictItem[];
  /** Quantitative summary injected into LLM prompt (AC-25.7). */
  evaluatorSummaryForLlm: string;
  /** Timestamp. */
  evaluatedAt: string;
}
