/**
 * Ratchet Mechanism (FR-26).
 *
 * Prevents quality regression during performance optimization and refactoring tasks.
 * Scores can only go up, never down. If an optimization attempt produces worse metrics
 * than the baseline, changes are automatically rolled back via `git reset --hard`.
 *
 * AC-26.1: Project config enables ratchet per work-package with time budget, baseline metric, baseline value.
 * AC-26.2: Baseline snapshot (git SHA + metric value) recorded before Implement stage.
 * AC-26.3: Improvement → keep & commit; regression → git reset --hard to baseline SHA.
 * AC-26.4: Time budget exhausted without improvement → rollback, not pipeline failure.
 * AC-26.5: Ratchet result written to Stage Record and Ledger evidence chain.
 * AC-26.6: When disabled, Implement stage behaves identically to FR-05.
 * AC-26.7: Metric comparison uses executable evaluator (FR-23) scores, not LLM judgment.
 * AC-26.8: Audit event recorded before git reset, including reason, baseline SHA, discarded changes summary.
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ArtifactRef } from '../types/index.js';
import type { EvaluatorResult } from './evaluator-types.js';

// ── Configuration Types ─────────────────────────────────────────

/**
 * Ratchet configuration for a single work-package or FR.
 * Declared in sevo.config.json: `{ ratchet: { "<workPackageId>": RatchetConfig } }`.
 *
 * AC-26.1: Config includes time budget, baseline metric name, and baseline value.
 */
export interface RatchetConfig {
  /** Whether ratchet mode is active for this work-package. */
  enabled: boolean;
  /** Maximum seconds allowed for the optimization attempt. */
  timeBudgetSeconds: number;
  /** Name of the metric to track (e.g. "test-execution-time", "bundle-size"). */
  baselineMetric: string;
  /** Baseline metric value. Lower-is-better by default; set `higherIsBetter` to invert. */
  baselineValue: number;
  /** If true, higher scores mean improvement (e.g. throughput). Default: false (lower is better). */
  higherIsBetter?: boolean;
}

/**
 * Ratchet configuration registry: work-package ID → config.
 */
export type RatchetRegistry = Record<string, RatchetConfig>;

// ── Baseline Snapshot ───────────────────────────────────────────

/**
 * Baseline snapshot captured before optimization begins.
 * AC-26.2: Records git commit SHA + baseline metric value.
 */
export interface BaselineSnapshot {
  /** Git commit SHA at baseline. */
  commitSha: string;
  /** Metric name being tracked. */
  metricName: string;
  /** Metric value at baseline. */
  metricValue: number;
  /** Timestamp when snapshot was taken. */
  capturedAt: string;
}

// ── Ratchet Result ──────────────────────────────────────────────

/** Outcome of the ratchet comparison. */
export type RatchetOutcome =
  | 'improved'       // Metric improved → changes kept
  | 'regressed'      // Metric worsened → rolled back
  | 'budget-expired' // Time budget exhausted without improvement → rolled back
  | 'unchanged';     // Metric identical → changes kept (no regression)

/**
 * Full ratchet execution result.
 * AC-26.5: Written to Stage Record and Ledger evidence chain.
 */
export interface RatchetResult {
  /** Work-package ID this ratchet applies to. */
  workPackageId: string;
  /** Baseline snapshot. */
  baseline: BaselineSnapshot;
  /** Post-optimization metric value (null if evaluator failed). */
  optimizedValue: number | null;
  /** Whether changes were kept or rolled back. */
  outcome: RatchetOutcome;
  /** Whether a git reset was performed. */
  rolledBack: boolean;
  /** Reason for rollback (when applicable). */
  rollbackReason?: string;
  /** SHA that was rolled back to (when applicable). */
  rollbackTargetSha?: string;
  /** Summary of discarded changes (when rolled back). */
  discardedChangesSummary?: string;
  /** Execution duration in milliseconds. */
  durationMs: number;
  /** Timestamp of ratchet evaluation. */
  evaluatedAt: string;
}

/**
 * Audit event emitted before a git reset.
 * AC-26.8: Must be recorded before the destructive operation.
 */
export interface RatchetAuditEvent {
  type: 'ratchet-rollback';
  workPackageId: string;
  baselineSha: string;
  currentSha: string;
  baselineValue: number;
  optimizedValue: number | null;
  reason: string;
  discardedChangesSummary: string;
  timestamp: string;
}

// ── Ratchet State Persistence ───────────────────────────────────

/**
 * Persisted ratchet state for a project.
 * Stored in `<projectRoot>/.sevo/ratchet-state.json`.
 */
export interface RatchetState {
  /** Historical best scores per work-package per metric. */
  highScores: Record<string, Record<string, number>>;
  /** Baseline snapshots for active ratchet sessions. */
  activeBaselines: Record<string, BaselineSnapshot>;
  /** Completed ratchet results (append-only log). */
  history: RatchetResult[];
  /** Last updated timestamp. */
  updatedAt: string;
}

// ── Core Functions ──────────────────────────────────────────────

const RATCHET_STATE_FILE = '.sevo/ratchet-state.json';

/** Strict pattern for a full-length hex SHA-1 (40 hex chars). */
const SHA_PATTERN = /^[0-9a-f]{40}$/i;

/**
 * Validate that a string is a well-formed 40-character hex SHA.
 * Prevents command injection when SHAs are passed to git CLI commands.
 * Throws if validation fails — callers must not proceed to execSync.
 */
function assertValidSha(value: string, label: string): void {
  if (!SHA_PATTERN.test(value)) {
    throw new Error(
      `Invalid git SHA for ${label}: expected 40-char hex string, got "${value.slice(0, 80)}". ` +
      'Possible ratchet-state.json tampering — aborting to prevent command injection.',
    );
  }
}

/**
 * Load ratchet registry from project config.
 * Returns empty registry if not configured (AC-26.6: no side effects when disabled).
 */
export function loadRatchetRegistry(projectRoot: string): RatchetRegistry {
  const sevoConfigPath = path.join(projectRoot, 'sevo.config.json');
  if (fs.existsSync(sevoConfigPath)) {
    try {
      const raw = fs.readFileSync(sevoConfigPath, 'utf8');
      const config = JSON.parse(raw) as { ratchet?: RatchetRegistry };
      return config.ratchet ?? {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Check if ratchet is enabled for a given work-package.
 * AC-26.6: Returns false when not configured → no impact on normal flow.
 */
export function isRatchetEnabled(registry: RatchetRegistry, workPackageId: string): boolean {
  const config = registry[workPackageId];
  return config?.enabled === true;
}

/**
 * Load persisted ratchet state from disk.
 */
export function loadRatchetState(projectRoot: string): RatchetState {
  const statePath = path.join(projectRoot, RATCHET_STATE_FILE);
  if (fs.existsSync(statePath)) {
    try {
      const raw = fs.readFileSync(statePath, 'utf8');
      return JSON.parse(raw) as RatchetState;
    } catch {
      // Corrupted state → start fresh
    }
  }
  return {
    highScores: {},
    activeBaselines: {},
    history: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Persist ratchet state to disk.
 */
export function saveRatchetState(projectRoot: string, state: RatchetState): void {
  const statePath = path.join(projectRoot, RATCHET_STATE_FILE);
  const dir = path.dirname(statePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
}

/**
 * Get the current git HEAD SHA for a project.
 */
export function getCurrentGitSha(projectRoot: string): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: projectRoot, encoding: 'utf8' }).trim();
  } catch {
    throw new Error(`Failed to get git SHA in ${projectRoot}. Is this a git repository?`);
  }
}

/**
 * Get a short summary of changes between two SHAs.
 */
function getChangesSummary(projectRoot: string, fromSha: string, toSha: string): string {
  assertValidSha(fromSha, 'getChangesSummary.fromSha');
  assertValidSha(toSha, 'getChangesSummary.toSha');
  try {
    const diffStat = execSync(`git diff --stat ${fromSha}..${toSha}`, {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 10_000,
    }).trim();
    return diffStat || 'No file changes detected';
  } catch {
    return 'Unable to generate diff summary';
  }
}

/**
 * Capture a baseline snapshot before optimization begins.
 * AC-26.2: Records git commit SHA + metric value.
 */
export function captureBaseline(
  projectRoot: string,
  workPackageId: string,
  config: RatchetConfig,
): BaselineSnapshot {
  const commitSha = getCurrentGitSha(projectRoot);
  const snapshot: BaselineSnapshot = {
    commitSha,
    metricName: config.baselineMetric,
    metricValue: config.baselineValue,
    capturedAt: new Date().toISOString(),
  };

  // Persist baseline to state
  const state = loadRatchetState(projectRoot);
  state.activeBaselines[workPackageId] = snapshot;

  // Update high score if this is the first entry
  if (!state.highScores[workPackageId]) {
    state.highScores[workPackageId] = {};
  }
  if (state.highScores[workPackageId][config.baselineMetric] === undefined) {
    state.highScores[workPackageId][config.baselineMetric] = config.baselineValue;
  }

  saveRatchetState(projectRoot, state);
  return snapshot;
}

/**
 * Determine if the optimized value is an improvement over baseline.
 * AC-26.7: Uses numeric comparison, not LLM judgment.
 */
export function isImprovement(
  baselineValue: number,
  optimizedValue: number,
  higherIsBetter: boolean,
): boolean {
  if (higherIsBetter) {
    return optimizedValue > baselineValue;
  }
  return optimizedValue < baselineValue;
}

/**
 * Determine if the optimized value is a regression from baseline.
 */
export function isRegression(
  baselineValue: number,
  optimizedValue: number,
  higherIsBetter: boolean,
): boolean {
  if (higherIsBetter) {
    return optimizedValue < baselineValue;
  }
  return optimizedValue > baselineValue;
}

/**
 * Execute git reset --hard to baseline SHA.
 * AC-26.8: Audit event must be recorded BEFORE calling this function.
 */
export function executeRollback(projectRoot: string, targetSha: string): void {
  assertValidSha(targetSha, 'executeRollback.targetSha');
  execSync(`git reset --hard ${targetSha}`, {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 30_000,
  });
}

/**
 * Create an audit event for a rollback operation.
 * AC-26.8: Recorded before the destructive git reset.
 */
export function createRollbackAuditEvent(
  workPackageId: string,
  baseline: BaselineSnapshot,
  currentSha: string,
  optimizedValue: number | null,
  reason: string,
  discardedChangesSummary: string,
): RatchetAuditEvent {
  return {
    type: 'ratchet-rollback',
    workPackageId,
    baselineSha: baseline.commitSha,
    currentSha,
    baselineValue: baseline.metricValue,
    optimizedValue,
    reason,
    discardedChangesSummary,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Append an audit event to the project's ratchet audit log.
 */
export function appendAuditEvent(projectRoot: string, event: RatchetAuditEvent): void {
  const auditPath = path.join(projectRoot, '.sevo', 'ratchet-audit.jsonl');
  const dir = path.dirname(auditPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.appendFileSync(auditPath, JSON.stringify(event) + '\n', 'utf8');
}

/**
 * Convert a RatchetResult into an ArtifactRef for Ledger evidence chain.
 * AC-26.5: Ratchet results are part of the evidence chain.
 */
export function ratchetResultToArtifact(
  projectRoot: string,
  result: RatchetResult,
): ArtifactRef {
  // Write result to a file for artifact reference
  const artifactDir = path.join(projectRoot, '.sevo', 'ratchet-results');
  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }
  const filename = `ratchet-${result.workPackageId}-${Date.now()}.json`;
  const artifactPath = path.join(artifactDir, filename);
  fs.writeFileSync(artifactPath, JSON.stringify(result, null, 2), 'utf8');

  return {
    id: `ratchet-${result.workPackageId}-${result.evaluatedAt}`,
    type: 'ratchet-result',
    path: artifactPath,
    createdAt: result.evaluatedAt,
    metadata: {
      workPackageId: result.workPackageId,
      outcome: result.outcome,
      rolledBack: result.rolledBack,
    },
  };
}

// ── Main Evaluation Entry Point ─────────────────────────────────

export interface RatchetEvaluateOptions {
  /** Project root directory. */
  projectRoot: string;
  /** Work-package ID to evaluate. */
  workPackageId: string;
  /** Evaluator result from FR-23 executable evaluator. AC-26.7: score source. */
  evaluatorResult: EvaluatorResult;
  /** Whether the time budget was exhausted. */
  timeBudgetExhausted?: boolean;
}

/**
 * Evaluate ratchet for a work-package after optimization attempt.
 *
 * Flow:
 * 1. Load baseline snapshot and ratchet config.
 * 2. Compare evaluator score against baseline (AC-26.7).
 * 3. If improved → keep changes, update high score.
 * 4. If regressed or budget expired → record audit event (AC-26.8), then git reset (AC-26.3).
 * 5. Persist result to state and return for Stage Record inclusion (AC-26.5).
 */
export function evaluateRatchet(options: RatchetEvaluateOptions): RatchetResult {
  const { projectRoot, workPackageId, evaluatorResult, timeBudgetExhausted } = options;
  const startTime = Date.now();

  const registry = loadRatchetRegistry(projectRoot);
  const config = registry[workPackageId];

  if (!config || !config.enabled) {
    // AC-26.6: Not enabled → no-op result
    return {
      workPackageId,
      baseline: { commitSha: '', metricName: '', metricValue: 0, capturedAt: '' },
      optimizedValue: null,
      outcome: 'unchanged',
      rolledBack: false,
      durationMs: Date.now() - startTime,
      evaluatedAt: new Date().toISOString(),
    };
  }

  const state = loadRatchetState(projectRoot);
  const baseline = state.activeBaselines[workPackageId];

  if (!baseline) {
    throw new Error(
      `No baseline snapshot found for work-package "${workPackageId}". ` +
      'Call captureBaseline() before starting the optimization attempt.',
    );
  }

  const higherIsBetter = config.higherIsBetter ?? false;
  const optimizedValue = evaluatorResult.score;
  const currentSha = getCurrentGitSha(projectRoot);

  let outcome: RatchetOutcome;
  let rolledBack = false;
  let rollbackReason: string | undefined;
  let discardedChangesSummary: string | undefined;

  if (timeBudgetExhausted && !isImprovement(baseline.metricValue, optimizedValue, higherIsBetter)) {
    // AC-26.4: Budget expired without improvement → rollback, not pipeline failure
    outcome = 'budget-expired';
    rollbackReason = `Time budget (${config.timeBudgetSeconds}s) exhausted without metric improvement. ` +
      `Baseline: ${baseline.metricValue}, Current: ${optimizedValue}`;
  } else if (isRegression(baseline.metricValue, optimizedValue, higherIsBetter)) {
    // AC-26.3: Regression → rollback
    outcome = 'regressed';
    rollbackReason = `Metric "${config.baselineMetric}" regressed from ${baseline.metricValue} to ${optimizedValue}`;
  } else if (isImprovement(baseline.metricValue, optimizedValue, higherIsBetter)) {
    // AC-26.3: Improvement → keep
    outcome = 'improved';
  } else {
    // Equal → keep (no regression)
    outcome = 'unchanged';
  }

  // Execute rollback if needed
  if (outcome === 'regressed' || outcome === 'budget-expired') {
    discardedChangesSummary = getChangesSummary(projectRoot, baseline.commitSha, currentSha);

    // AC-26.8: Record audit event BEFORE git reset
    const auditEvent = createRollbackAuditEvent(
      workPackageId,
      baseline,
      currentSha,
      optimizedValue,
      rollbackReason!,
      discardedChangesSummary,
    );
    appendAuditEvent(projectRoot, auditEvent);

    // AC-26.3: Execute git reset --hard
    executeRollback(projectRoot, baseline.commitSha);
    rolledBack = true;
  }

  // Update high scores on improvement
  if (outcome === 'improved') {
    if (!state.highScores[workPackageId]) {
      state.highScores[workPackageId] = {};
    }
    const currentHigh = state.highScores[workPackageId][config.baselineMetric];
    if (currentHigh === undefined || isImprovement(currentHigh, optimizedValue, higherIsBetter)) {
      state.highScores[workPackageId][config.baselineMetric] = optimizedValue;
    }
  }

  const result: RatchetResult = {
    workPackageId,
    baseline,
    optimizedValue,
    outcome,
    rolledBack,
    rollbackReason,
    rollbackTargetSha: rolledBack ? baseline.commitSha : undefined,
    discardedChangesSummary,
    durationMs: Date.now() - startTime,
    evaluatedAt: new Date().toISOString(),
  };

  // Persist result to state history
  state.history.push(result);
  delete state.activeBaselines[workPackageId];
  saveRatchetState(projectRoot, state);

  return result;
}

/**
 * Get the historical high score for a work-package metric.
 * Used by gate checks to enforce the ratchet: new scores must meet or exceed this.
 */
export function getHighScore(
  projectRoot: string,
  workPackageId: string,
  metricName: string,
): number | undefined {
  const state = loadRatchetState(projectRoot);
  return state.highScores[workPackageId]?.[metricName];
}

/**
 * Check if a new score meets the ratchet threshold (does not regress from historical high).
 * Returns true if the score is acceptable (equal or better than high score).
 */
export function meetsRatchetThreshold(
  projectRoot: string,
  workPackageId: string,
  metricName: string,
  newScore: number,
  higherIsBetter: boolean,
): boolean {
  const highScore = getHighScore(projectRoot, workPackageId, metricName);
  if (highScore === undefined) {
    // No history → any score is acceptable
    return true;
  }
  // Must not regress from high score
  return !isRegression(highScore, newScore, higherIsBetter);
}
