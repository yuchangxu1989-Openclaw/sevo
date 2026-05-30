import type { ArtifactRef } from '../types/index.js';

// ── PDCA Check Types (FR-20: PDCA 自动 Check) ──────────────────

/** Severity level for a liveness goal. */
export type PdcaSeverity = 'P0' | 'P1' | 'P2';

/** A single SMART goal entry in the liveness config. */
export interface PdcaLivenessGoal {
  /** Unique identifier for this goal. */
  id: string;
  /** Human-readable description. */
  description: string;
  /** Measurable metric (what to verify). */
  metric: string;
  /** Probe command — built-in function call or custom shell command. */
  probe: string;
  /** Severity: P0 = blocking, P1 = warning, P2 = informational. */
  severity: PdcaSeverity;
}

/** A project section in the liveness config. */
export interface PdcaLivenessProject {
  name: string;
  goals: PdcaLivenessGoal[];
}

/** Root structure of pdca-liveness-config.json (AC-20.1). */
export interface PdcaLivenessConfig {
  version?: string;
  description?: string;
  projects: PdcaLivenessProject[];
}

/** Result of a single probe execution (AC-20.2). */
export interface PdcaProbeResult {
  goalId: string;
  project: string;
  status: 'PASS' | 'FAIL' | 'INCONCLUSIVE' | 'SKIP';
  reason: string;
  severity: PdcaSeverity;
  executedAt: string;
  /** AC-20.7: Confidence score for LLM probes (0.0-1.0). */
  confidence?: number;
}

/** Summary report from a PDCA Check run (AC-20.2). */
export interface PdcaCheckReport {
  totalGoals: number;
  passCount: number;
  failCount: number;
  p0Failures: string[];
  p1Failures: string[];
  entries: PdcaProbeResult[];
  executedAt: string;
}

/** Task created for P0 failures (AC-20.4). */
export interface PdcaFailureTask {
  goalId: string;
  project: string;
  severity: PdcaSeverity;
  reason: string;
  description: string;
  /** Related FR identifier extracted from goalId (e.g. "FR-20"). */
  relatedFr?: string;
}

/** Adapter for creating tasks on failure (AC-20.4). */
export interface PdcaTaskAdapter {
  createTask(task: PdcaFailureTask): Promise<void>;
}

/** Options for PdcaCheckRunner. */
export interface PdcaCheckRunnerOptions {
  /** Override clock for testing. */
  now?: () => string;
  /** Custom shell executor for testing. */
  execCommand?: (cmd: string) => Promise<{ stdout: string; exitCode: number }>;
  /** Path to openclaw.json for hook checks. */
  openclawConfigPath?: string;
  /** AC-20.7: LLM probe executor for semantic quality checks. */
  llmProbe?: (probeName: string, context: LlmProbeContext) => Promise<LlmProbeResult>;
}

/** AC-20.7: Context passed to an LLM probe function. */
export interface LlmProbeContext {
  goalId: string;
  project: string;
  metric: string;
  description: string;
}

/** AC-20.7: Result from an LLM probe execution. */
export interface LlmProbeResult {
  /** Confidence score from 0.0 to 1.0. */
  confidence: number;
  /** Human-readable judgment text. */
  judgment: string;
  /** Threshold below which result is INCONCLUSIVE (default 0.7). */
  threshold?: number;
}

/** Output of the PDCA Check stage. */
export interface PdcaCheckOutput {
  report: PdcaCheckReport;
  markdown: string;
  tasksCreated: PdcaFailureTask[];
  artifact?: ArtifactRef;
}
