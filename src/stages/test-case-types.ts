import type { ArtifactRef, StageId } from '../types/index.js';
import type { FunctionalRequirement, SpecOutput } from './spec-types.js';

// ── Test Case Domain ────────────────────────────────────────────

export type TestCasePriority = 'high' | 'medium' | 'low';

export interface TestCaseStep {
  order: number;
  action: string;
  expected?: string;
}

export interface TestCase {
  id: string;
  frId: string;
  acId: string;
  description: string;
  steps: TestCaseStep[];
  expectedResult: string;
  priority: TestCasePriority;
}

export interface TestCaseDocumentMetadata {
  generatedAt: string;
  specVersion: string;
  totalTestCases: number;
  coverageByFR: Record<string, number>;
}

export interface TestCaseDocument {
  testCases: TestCase[];
  metadata: TestCaseDocumentMetadata;
}

// ── Stage I/O ───────────────────────────────────────────────────

export interface TestCaseStageInput {
  taskId: string;
  pipelineId?: string;
  specPackage: SpecOutput;
  artifactBasePath?: string;
  /** Optional priority override per FR id. */
  frPriorities?: Record<string, TestCasePriority>;
}

export interface TestCaseStageOutput {
  testCaseDocument: TestCaseDocument;
  metadata: TestCaseDocumentMetadata;
  artifact: ArtifactRef;
}

// ── Adapter SPI ─────────────────────────────────────────────────

export interface TestCaseGenerationRequest {
  functionalRequirements: FunctionalRequirement[];
  frPriorities?: Record<string, TestCasePriority>;
}

export interface TestCaseGenerationResponse {
  testCases: Array<{
    frId: string;
    acId: string;
    description: string;
    steps: Array<{ action: string; expected?: string }>;
    expectedResult: string;
    priority?: TestCasePriority;
  }>;
}

export interface TestCaseStageOptions {
  adapter: {
    generateTestCases?: (request: TestCaseGenerationRequest) => Promise<TestCaseGenerationResponse>;
  };
  now?: () => string;
}
