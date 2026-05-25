import type { ArtifactRef, StageId } from '../types/index.js';
import type { FunctionalRequirement, SpecOutput } from './spec-types.js';
import type { DagMetrics } from '../task-dag/index.js';

// ── Sub-Task (AC-4.12a) ─────────────────────────────────────────

export interface SubTask {
  id: string;
  description: string;
  targetFiles: string[];       // precise file paths
  expectedChanges: string;     // expected change description
  estimatedMinutes: number;    // 2-5 minutes granularity
  acIds: string[];             // linked AC identifiers
  dependsOn: string[];         // dependency task ids within same work package (AC-3.10)
  parallel: boolean;           // eligible for concurrent dispatch when dependencies are met (AC-3.10)
}

// ── Contract Package ────────────────────────────────────────────

export interface WorkPackage {
  id: string;
  ratchet?: {
    enabled: boolean;
    timeBudgetSeconds: number;
    baselineMetric: string;
    baselineValue: number;
    higherIsBetter?: boolean;
  };
  frIds: string[];
  description: string;
  dependencies: string[];
  estimatedEffort?: string;
  tasks?: SubTask[];           // optional fine-grained task list (AC-4.12a)
  dependsOn?: string[];        // runtime-computed by analyzeDependencies() from dependencies[]
  parallel?: boolean;          // runtime-computed: true when no dependencies
}

export interface ImplementationBoundary {
  scope: string;
  constraints: string[];
  outOfScope: string[];
}

export interface ParallelismAnalysis extends DagMetrics {
  workPackageId: string;
}

export interface MeceValidationIssue {
  type: 'missing-coverage' | 'overlapping-target' | 'duplicate-task-id' | 'missing-expected-changes';
  workPackageId: string;
  taskIds: string[];
  message: string;
}

export interface ContractPackage {
  architecturePlan: string;
  implementationBoundaries: ImplementationBoundary[];
  workPackages: WorkPackage[];
  deliveryOrder: string[];
  dependencyGraph?: Record<string, string[]>;
  parallelismAnalysis?: ParallelismAnalysis[];
  meceValidationIssues?: MeceValidationIssue[];
}

// ── Stage I/O ───────────────────────────────────────────────────

export interface ContractStageInput {
  taskId: string;
  pipelineId?: string;
  specPackage: SpecOutput;
  artifactBasePath?: string;
}

export interface ContractStageOutput {
  contractPackage: ContractPackage;
  metadata: ContractMetadata;
  artifact: ArtifactRef;
}

export interface ContractMetadata {
  totalWorkPackages: number;
  totalFRsCovered: number;
  generatedAt: string;
  meceValidationPassed: boolean;
  dependencyTaskCount: number;
}

// ── Adapter SPI ─────────────────────────────────────────────────

export interface ContractAnalysisRequest {
  functionalRequirements: FunctionalRequirement[];
  specSummary: string;
}

export interface ContractAnalysisResponse {
  architecturePlan: string;
  workPackages: Array<{
    frIds: string[];
    description: string;
    dependencies: string[];
    estimatedEffort?: string;
    tasks?: Array<{
      id: string;
      description: string;
      targetFiles: string[];
      expectedChanges: string;
      estimatedMinutes: number;
      acIds: string[];
      dependsOn?: string[];
      parallel?: boolean;
    }>;
  }>;
  implementationBoundaries: Array<{
    scope: string;
    constraints: string[];
    outOfScope: string[];
  }>;
}

export interface ContractStageOptions {
  adapter: {
    generateContract?: (request: ContractAnalysisRequest) => Promise<ContractAnalysisResponse>;
  };
  now?: () => string;
}
