/**
 * Stage Handler Types — P0-2 stage real-output layer.
 *
 * Each pipeline stage has a handler that produces real artifacts on disk.
 * Handlers are pure-ish: they take a context (project paths, LLM client,
 * previous stage outputs) and return a StageHandlerResult with file paths
 * and a verdict (pass/block/fail).
 *
 * This layer is invoked by the PipelineEngine when a stage becomes active.
 * It is NOT the orchestrator — it is the per-stage "do real work" logic.
 */

import type { ArtifactRef, StageId } from '../types/index.js';

export type StageVerdict = 'pass' | 'block' | 'fail';

/** Common context passed to every stage handler. */
export interface StageHandlerContext {
  /** Pipeline instance id (used in artifact ids and event logs). */
  pipelineId: string;
  /** Project slug (e.g. "hello-world"). */
  projectSlug: string;
  /** Absolute path to the SEVO workspace root (where projects/ lives). */
  workspaceRoot: string;
  /** Absolute path to the project root (workspaceRoot/projects/<slug>). */
  projectRoot: string;
  /** FR description supplied at pipeline creation. May be empty for L0. */
  frDescription?: string;
  /**
   * Optional LLM client. If absent, handlers fall back to deterministic
   * generation (real output, but with placeholder content) so tests pass
   * without network access.
   */
  llm?: {
    chat(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<string>;
  };
  /** Now() injection for deterministic timestamps in tests. */
  now?: () => string;
  /**
   * Previous stage handler outputs keyed by stageId. Stages that need
   * upstream artifacts (e.g. test-case-authoring needs spec FRs) read
   * from here.
   */
  previousResults?: Partial<Record<StageId, StageHandlerResult>>;
}

/** What a stage handler returns. */
export interface StageHandlerResult {
  stageId: StageId;
  verdict: StageVerdict;
  /** Files written to disk (always present, even on block/fail). */
  artifacts: ArtifactRef[];
  /** Human-readable summary written to events.jsonl. */
  summary: string;
  /** Issues that caused block/fail. Empty when verdict='pass'. */
  issues: string[];
  /** Free-form metadata each stage may attach (FR ids, test counts, etc.). */
  metadata?: Record<string, unknown>;
}

/** Stage handler signature. */
export type StageHandler = (ctx: StageHandlerContext) => Promise<StageHandlerResult>;
