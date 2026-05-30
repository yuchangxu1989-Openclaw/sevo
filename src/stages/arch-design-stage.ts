import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import type { ArtifactRef, StageId } from '../types/index.js';
import type { Stage } from './spec-types.js';
import type {
  ArchitectureApiDefinition,
  ArchitectureDataModel,
  ArchitectureDesignGenerationResponse,
  ArchitectureDesignInput,
  ArchitectureDesignOutput,
  ArchitectureDesignStageOptions,
  ArchitectureModuleInteraction,
} from './arch-design-types.js';

export class ArchitectureDesignStage implements Stage<ArchitectureDesignInput, ArchitectureDesignOutput> {
  readonly stageId: StageId = 'architecture-design' as const;
  private readonly now: () => string;

  constructor(private readonly options: ArchitectureDesignStageOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async execute(input: ArchitectureDesignInput): Promise<ArchitectureDesignOutput> {
    const response = await this.generateDesign(input);
    const timestamp = this.now();
    const artifact = await this.writeArtifact(input, response, timestamp);

    return {
      designDocument: artifact,
      apiDefinitions: response.apiDefinitions,
      dataModels: response.dataModels,
      moduleInteractions: response.moduleInteractions,
      authorRole: 'sa',
    };
  }

  private async generateDesign(input: ArchitectureDesignInput): Promise<ArchitectureDesignGenerationResponse> {
    if (this.options.adapter?.generateArchitectureDesign) {
      return this.options.adapter.generateArchitectureDesign({
        specPackage: input.specPackage,
        uxDesignDocument: input.uxDesignDocument,
        projectConfig: input.projectConfig,
      });
    }

    const apiDefinitions: ArchitectureApiDefinition[] = [];
    const dataModels: ArchitectureDataModel[] = [];
    const moduleInteractions: ArchitectureModuleInteraction[] = [
      { from: 'pipeline', to: 'stage-runner', protocol: 'internal-call' },
    ];

    return { apiDefinitions, dataModels, moduleInteractions };
  }

  private async writeArtifact(
    input: ArchitectureDesignInput,
    response: ArchitectureDesignGenerationResponse,
    timestamp: string,
  ): Promise<ArtifactRef> {
    const basePath = input.artifactBasePath
      ?? path.join(input.projectConfig.projectRoot, 'docs', 'architecture');
    await mkdir(basePath, { recursive: true });

    const filePath = path.join(basePath, `${input.taskId}-arch-design.md`);
    await writeFile(filePath, response.markdown ?? this.renderMarkdown(input, response, timestamp), 'utf8');

    return {
      id: `${input.taskId}:architecture-design`,
      type: 'architecture-design-document',
      path: filePath,
      createdAt: timestamp,
      metadata: {
        authorRole: 'sa',
        apiDefinitionCount: response.apiDefinitions.length,
        dataModelCount: response.dataModels.length,
        moduleInteractionCount: response.moduleInteractions.length,
        uxDesignDocument: input.uxDesignDocument?.path,
      },
    };
  }

  private renderMarkdown(
    input: ArchitectureDesignInput,
    response: ArchitectureDesignGenerationResponse,
    timestamp: string,
  ): string {
    const apis = response.apiDefinitions
      .map((api) => [
        `### ${api.method.toUpperCase()} ${api.path}`,
        `- Request: ${api.requestSchema}`,
        `- Response: ${api.responseSchema}`,
        `- Errors: ${api.errorCodes.map((e) => `${e.code}(${e.httpStatus})`).join(', ') || 'none'}`,
      ].join('\n'))
      .join('\n\n');

    const models = response.dataModels
      .map((model) => [
        `### ${model.name}`,
        ...model.fields.map((field) => `- ${field.name}: ${field.type}${field.required ? ' required' : ' optional'}`),
      ].join('\n'))
      .join('\n\n');

    const interactions = response.moduleInteractions
      .map((item) => `- ${item.from} → ${item.to} via ${item.protocol}`)
      .join('\n');

    return [
      `# ${input.taskId} Architecture Design`,
      '',
      `Generated at: ${timestamp}`,
      `Spec artifact: ${input.specPackage.artifact.path}`,
      input.uxDesignDocument ? `UX design reference: ${input.uxDesignDocument.path}` : 'UX design reference: none',
      '',
      '## API Definitions',
      apis || '- None',
      '',
      '## Data Models',
      models || '- None',
      '',
      '## Module Interactions',
      interactions || '- None',
      '',
      '## Ownership',
      '- Author role: sa',
      '',
    ].join('\n');
  }
}
