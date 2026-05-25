/**
 * Evaluators module — public API (FR-23, FR-24, FR-25).
 */

// ── Types (FR-23, FR-24, FR-25) ────────────────────────────────
export type {
  EvaluatorConfig,
  EvaluatorRegistry,
  EvaluatorInput,
  EvaluatorDetailItem,
  EvaluatorResult,
  EvaluatorExecution,
  EvaluatorResultSet,
  IsolationLayerStatus,
  IsolationStatus,
  AllowedWritePathsConfig,
  LlmEvaluationResult,
  HybridGateVerdict,
  HybridVerdictItem,
  VerdictSource,
} from './evaluator-types.js';

// ── Evaluator Runner (FR-23) ───────────────────────────────────
export {
  runSingleEvaluator,
  runEvaluators,
  loadEvaluatorRegistry,
  getEvaluatorsDir,
} from './evaluator-runner.js';

// ── Workspace Isolation (FR-24) ────────────────────────────────
export {
  initEvaluatorsDirectory,
  generateAllowedWritePaths,
  generateIsolationPromptInjection,
  setupWorkspaceIsolation,
  isWriteAllowed,
} from './workspace-isolation.js';

// ── Hybrid Gate (FR-25) ────────────────────────────────────────
export {
  evaluateHybridGate,
  generateEvaluatorSummary,
  gateVerdictToLlmResult,
} from './hybrid-gate.js';
export type { HybridGateOptions } from './hybrid-gate.js';

// ── Ratchet Mechanism (FR-26) ──────────────────────────────────
export {
  loadRatchetRegistry,
  isRatchetEnabled,
  loadRatchetState,
  saveRatchetState,
  captureBaseline,
  isImprovement,
  isRegression,
  evaluateRatchet,
  getHighScore,
  meetsRatchetThreshold,
  ratchetResultToArtifact,
  executeRollback,
  createRollbackAuditEvent,
  appendAuditEvent,
  getCurrentGitSha,
} from './ratchet.js';
export type {
  RatchetConfig,
  RatchetRegistry,
  BaselineSnapshot,
  RatchetOutcome,
  RatchetResult,
  RatchetAuditEvent,
  RatchetState,
  RatchetEvaluateOptions,
} from './ratchet.js';
