import type { ArtifactRef, StageId } from '../types/index.js';
import type { FunctionalRequirement } from './spec-types.js';

export interface ReadmeSyncStageInput {
  taskId: string;
  pipelineId?: string;
  projectSlug?: string;
  specPath: string;
  readmePath: string;
  changedFRs?: string[];
  artifactBasePath?: string;
}

export interface ReadmeSyncStageOptions {
  now?: () => string;
}

export interface ReadmeCoverageMatch {
  frId: string;
  title: string;
  covered: boolean;
  rationale: string;
}

export interface ReadmeUpdateTask {
  taskId: string;
  title: string;
  description: string;
  missingFrs: Array<Pick<FunctionalRequirement, 'id' | 'title' | 'description' | 'acceptanceCriteria'>>;
  targetPath: string;
}

export interface ReadmeSyncLedgerEntry {
  pipelineId?: string;
  projectSlug?: string;
  checkedAt: string;
  readmePath: string;
  specPath: string;
  changedFRs: string[];
  coverage: ReadmeCoverageMatch[];
  missingFrs: string[];
  updateTask: ReadmeUpdateTask | null;
  verdict: 'pass' | 'block';
}

export interface ReadmeSyncStageOutput {
  stageId: StageId;
  verdict: 'pass' | 'block';
  coverage: ReadmeCoverageMatch[];
  missingFrs: string[];
  updateTask: ReadmeUpdateTask | null;
  ledgerEntry: ReadmeSyncLedgerEntry;
  artifact: ArtifactRef;
}

export interface ReadmeSyncSpecDocument {
  functionalRequirements?: FunctionalRequirement[];
}
