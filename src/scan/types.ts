import type { LLMProviderConfig } from '../llm/index.js';

export type ScanLevel = 'l1' | 'l2' | 'l3';
export type ScanOverall = 'pass' | 'fail';

export interface ParsedAcceptanceCriterion {
  frId: string;
  acId: string;
  text: string;
}

export interface ParsedFunctionalRequirement {
  frId: string;
  title: string;
  description: string;
  acceptanceCriteria: ParsedAcceptanceCriterion[];
}

export interface ScanCommand {
  command: string;
  cwd?: string;
  timeoutMs?: number;
}

export interface L1ScanInput {
  specPath: string;
  sourceDir: string;
  outputPath?: string;
  frFileMap?: Record<string, string[]>;
  compileCommand?: ScanCommand;
  testCommand?: ScanCommand;
  writeReport?: boolean;
}

export interface L1FrCoverageEntry {
  frId: string;
  status: 'covered' | 'uncovered';
  compilePassed: boolean;
  testsPassed: boolean;
  evidence: { files: string[] };
  reason?: string;
}

export interface CommandCheckResult {
  command: string;
  passed: boolean;
  exitCode: number | null;
  output: string;
}

export interface L1ScanReport {
  level: 'l1';
  pass: boolean;
  timestamp: string;
  entries: L1FrCoverageEntry[];
  compile: CommandCheckResult;
  tests: CommandCheckResult;
}

export interface SemanticScanLogEntry {
  frId: string;
  acId: string;
  prompt: string;
  response: string;
}

export interface L2ScanInput {
  specPath: string;
  sourceDir: string;
  outputPath?: string;
  logPath?: string;
  llm?: LLMProviderConfig;
  llmClient?: { chat(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<string> };
  writeReport?: boolean;
}

export interface L2ACCoverageEntry {
  frId: string;
  acId: string;
  status: 'covered' | 'uncovered' | 'needs-review';
  confidence: number;
  evidence: { file: string; lineRange: [number, number]; testFile?: string };
  rationale?: string;
}

export interface L2ScanReport {
  level: 'l2';
  pass: boolean;
  timestamp: string;
  entries: L2ACCoverageEntry[];
  logs: SemanticScanLogEntry[];
}

export type RuntimeProjectType = 'cli' | 'web' | 'hook' | 'plugin' | 'library';

export interface RuntimeDomainCheck {
  domain: string;
  type?: RuntimeProjectType;
  command?: string;
  cwd?: string;
  timeoutMs?: number;
  url?: string;
  modulePath?: string;
  exportName?: string;
  args?: unknown[];
  eventPayload?: unknown;
  expectedSideEffectPath?: string;
  expectedExitCode?: number;
  outputValidator?: string | RegExp | ((stdout: string) => boolean);
}

export interface L3RuntimeVerifierInput {
  projectType: RuntimeProjectType;
  projectRoot: string;
  checks: RuntimeDomainCheck[];
  outputPath?: string;
  llm?: LLMProviderConfig;
  llmClient?: { chat(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>): Promise<string> };
  writeReport?: boolean;
  /** Optional spec path for AC-level verification. When provided, ACs are parsed and verified against runtime output. */
  specPath?: string;
  /** Optional L2 triage results to locate implementation files per AC. */
  l2Results?: L2ACCoverageEntry[];
}

export interface L3RuntimeEntry {
  domain: string;
  status: 'alive' | 'dead';
  verifyCommand: string;
  actualOutput: string;
  judgment: string;
  expectedExitCode: number;
  actualExitCode: number | null;
  evidence: { exitCode?: number | null; httpStatus?: number; sideEffect?: string };
}

export interface L3ACVerificationEntry {
  frId: string;
  acId: string;
  acText: string;
  implementationFile: string | null;
  satisfied: boolean;
  rationale: string;
}

export interface L3ScanReport {
  level: 'l3';
  pass: boolean;
  timestamp: string;
  entries: L3RuntimeEntry[];
  acVerification?: L3ACVerificationEntry[];
}

export interface TieredScanInput {
  l1?: L1ScanInput;
  l2?: L2ScanInput;
  l3?: L3RuntimeVerifierInput;
  outputPath?: string;
}

export interface TieredScanSummary {
  l1: { pass: boolean; total: number; covered: number };
  l2: { pass: boolean; total: number; covered: number; needsReview: number };
  l3: { pass: boolean; total: number; alive: number };
  overall: ScanOverall;
  timestamp: string;
  blockers: string[];
}

export interface TieredScanReport {
  summary: TieredScanSummary;
  l1?: L1ScanReport;
  l2?: L2ScanReport;
  l3?: L3ScanReport;
}
