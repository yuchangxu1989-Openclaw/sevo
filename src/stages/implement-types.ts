import type { ArtifactRef } from '../types/index.js';
import type { RatchetResult } from '../evaluators/ratchet.js';
import type { ContractPackage, SubTask, WorkPackage } from './contract-types.js';
import type { AcceptanceCriteria } from './spec-types.js';
import type {
  DebuggingIssue,
  DebuggingMetadata,
  DebuggingPhaseRequest,
  DebuggingPhaseResponse,
} from './debugging-types.js';

// ── Evidence ────────────────────────────────────────────────────

export type EvidenceType = 'test_result' | 'code_change' | 'deviation_note';

export interface ImplementationEvidence {
  type: EvidenceType;
  content: string;
  timestamp: string;
}

// ── Task Execution ──────────────────────────────────────────────

export interface TestResult {
  name: string;
  passed: boolean;
  message?: string;
}

export interface TaskExecution {
  taskId: string;
  workPackageId: string;
  subTaskId?: string;          // links to SubTask.id when executing fine-grained tasks
  targetFiles?: string[];      // precise file paths from SubTask
  estimatedMinutes?: number;   // estimated duration from SubTask
  input: string;
  output: string;
  allowedScope: string[];
  evidence: ImplementationEvidence[];
  testResults: TestResult[];
  /** AC-4.20a: Timestamp when tests were first written/run. */
  testFirstTimestamp?: string;
  /** AC-4.20a: Timestamp when implementation code was written. */
  implTimestamp?: string;
  /** AC-4.20a: Whether TDD order was followed (test before impl). */
  tddOrderFollowed?: boolean;
}

// ── Implementation Bundle ───────────────────────────────────────

export interface ImplementationBundle {
  executions: TaskExecution[];
  summary: string;
  traceability: Map<string, string[]>; // frId → taskIds[]
}

// ── Stage I/O ───────────────────────────────────────────────────

export interface ImplementStageInput {
  taskId: string;
  /** Project root used for ratchet/evaluator integration. Defaults to process.cwd(). */
  projectRoot?: string;
  pipelineId?: string;
  contractPackage: ContractPackage;
  workPackages: WorkPackage[];
  acceptanceCriteria: AcceptanceCriteria[];
  artifactBasePath?: string;
  debuggingIssues?: DebuggingIssue[];
}

export interface ImplementStageOutput {
  implementationBundle: ImplementationBundle;
  metadata: ImplementMetadata;
  artifact: ArtifactRef;
}

export interface ImplementMetadata {
  totalTasksExecuted: number;
  totalTestsPassed: number;
  totalTestsFailed: number;
  allAccepted: boolean;
  hasTests: boolean;
  evidenceGatePassed: boolean;  // AC-4.18: all executions have non-empty evidence
  ratchetResults?: RatchetResult[];
  debugging?: DebuggingMetadata;
  generatedAt: string;
}

// ── Adapter SPI ─────────────────────────────────────────────────

export interface TaskExecutionRequest {
  workPackage: WorkPackage;
  subTask?: SubTask;           // present when executing a fine-grained sub-task
  acceptanceCriteria: AcceptanceCriteria[];
  contractPackage: ContractPackage;
}

export interface TaskExecutionResponse {
  output: string;
  evidence: Array<{ type: EvidenceType; content: string }>;
  testResults: TestResult[];
}

export interface ImplementStageOptions {
  adapter: {
    executeTask?: (request: TaskExecutionRequest) => Promise<TaskExecutionResponse>;
    executeDebuggingPhase?: (request: DebuggingPhaseRequest) => Promise<DebuggingPhaseResponse>;
  };
  now?: () => string;
}
