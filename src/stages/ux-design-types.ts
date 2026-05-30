import type { ArtifactRef, ProjectConfig } from '../types/index.js';
import type { SpecOutput } from './spec-types.js';

export interface UxDesignPage {
  pageId: string;
  title: string;
  layout: string;
  components: string[];
}

export interface UxNavigationItem {
  path: string;
  label: string;
  children?: UxNavigationItem[];
}

export interface UxOperationFlow {
  flowId: string;
  name: string;
  steps: string[];
}

export interface UxInteractionDesignInput {
  taskId: string;
  pipelineId?: string;
  specPackage: SpecOutput;
  projectConfig: ProjectConfig;
  artifactBasePath?: string;
}

export interface UxInteractionDesignOutput {
  designDocument: ArtifactRef;
  pages: UxDesignPage[];
  navigationStructure: UxNavigationItem[];
  operationFlows: UxOperationFlow[];
  authorRole: 'ux';
  pmReviewStatus: 'pending' | 'approved' | 'rejected';
}

export interface UxDesignGenerationRequest {
  specPackage: SpecOutput;
  projectConfig: ProjectConfig;
}

export interface UxDesignGenerationResponse {
  pages: UxDesignPage[];
  navigationStructure: UxNavigationItem[];
  operationFlows: UxOperationFlow[];
  markdown?: string;
}

export interface UxInteractionDesignStageOptions {
  adapter?: {
    generateUxDesign?: (request: UxDesignGenerationRequest) => Promise<UxDesignGenerationResponse>;
  };
  now?: () => string;
}
