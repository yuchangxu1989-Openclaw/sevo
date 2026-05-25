import type { ArtifactRef, ProjectConfig } from '../types/index.js';
import type { SpecOutput } from './spec-types.js';

export interface ArchitectureApiDefinition {
  path: string;
  method: string;
  requestSchema: string;
  responseSchema: string;
  errorCodes: Array<{ code: string; httpStatus: number }>;
}

export interface ArchitectureDataModel {
  name: string;
  fields: Array<{ name: string; type: string; required: boolean }>;
}

export interface ArchitectureModuleInteraction {
  from: string;
  to: string;
  protocol: string;
}

export interface ArchitectureDesignInput {
  taskId: string;
  pipelineId?: string;
  specPackage: SpecOutput;
  uxDesignDocument?: ArtifactRef;
  projectConfig: ProjectConfig;
  artifactBasePath?: string;
}

export interface ArchitectureDesignOutput {
  designDocument: ArtifactRef;
  apiDefinitions: ArchitectureApiDefinition[];
  dataModels: ArchitectureDataModel[];
  moduleInteractions: ArchitectureModuleInteraction[];
  authorRole: 'sa';
}

export interface ArchitectureDesignGenerationRequest {
  specPackage: SpecOutput;
  uxDesignDocument?: ArtifactRef;
  projectConfig: ProjectConfig;
}

export interface ArchitectureDesignGenerationResponse {
  apiDefinitions: ArchitectureApiDefinition[];
  dataModels: ArchitectureDataModel[];
  moduleInteractions: ArchitectureModuleInteraction[];
  markdown?: string;
}

export interface ArchitectureDesignStageOptions {
  adapter?: {
    generateArchitectureDesign?: (
      request: ArchitectureDesignGenerationRequest,
    ) => Promise<ArchitectureDesignGenerationResponse>;
  };
  now?: () => string;
}
