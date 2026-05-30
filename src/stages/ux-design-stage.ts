import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import type { ArtifactRef, StageId } from '../types/index.js';
import type { Stage } from './spec-types.js';
import type {
  UxDesignGenerationResponse,
  UxInteractionDesignInput,
  UxInteractionDesignOutput,
  UxInteractionDesignStageOptions,
  UxNavigationItem,
  UxOperationFlow,
  UxDesignPage,
} from './ux-design-types.js';

export class UxInteractionDesignStage implements Stage<UxInteractionDesignInput, UxInteractionDesignOutput> {
  readonly stageId: StageId = 'ux-interaction-design' as const;
  private readonly now: () => string;

  constructor(private readonly options: UxInteractionDesignStageOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async execute(input: UxInteractionDesignInput): Promise<UxInteractionDesignOutput> {
    const response = await this.generateDesign(input);
    const timestamp = this.now();
    const artifact = await this.writeArtifact(input, response, timestamp);

    return {
      designDocument: artifact,
      pages: response.pages,
      navigationStructure: response.navigationStructure,
      operationFlows: response.operationFlows,
      authorRole: 'ux',
      pmReviewStatus: 'pending',
    };
  }

  private async generateDesign(input: UxInteractionDesignInput): Promise<UxDesignGenerationResponse> {
    if (this.options.adapter?.generateUxDesign) {
      return this.options.adapter.generateUxDesign({
        specPackage: input.specPackage,
        projectConfig: input.projectConfig,
      });
    }

    const pages: UxDesignPage[] = [
      {
        pageId: 'main-flow',
        title: input.specPackage.summary || 'Core user flow',
        layout: 'Single-page core task layout with clear entry, action area, status feedback, and result area.',
        components: ['entry point', 'primary action', 'status feedback', 'result summary'],
      },
    ];
    const navigationStructure: UxNavigationItem[] = [
      { path: '/', label: 'Home' },
    ];
    const operationFlows: UxOperationFlow[] = [
      {
        flowId: 'core-task',
        name: 'Open page and complete core task',
        steps: [
          'Open the entry page',
          'Read the task context and available action',
          'Run the primary action',
          'Confirm the status feedback and final result',
        ],
      },
    ];

    return { pages, navigationStructure, operationFlows };
  }

  private async writeArtifact(
    input: UxInteractionDesignInput,
    response: UxDesignGenerationResponse,
    timestamp: string,
  ): Promise<ArtifactRef> {
    const basePath = input.artifactBasePath
      ?? path.join(input.projectConfig.projectRoot, 'docs', 'ux');
    await mkdir(basePath, { recursive: true });

    const filePath = path.join(basePath, `${input.taskId}-ux-design.md`);
    await writeFile(filePath, response.markdown ?? this.renderMarkdown(input, response, timestamp), 'utf8');

    return {
      id: `${input.taskId}:ux-interaction-design`,
      type: 'ux-interaction-design-document',
      path: filePath,
      createdAt: timestamp,
      metadata: {
        authorRole: 'ux',
        pmReviewStatus: 'pending',
        pageCount: response.pages.length,
        flowCount: response.operationFlows.length,
      },
    };
  }

  private renderMarkdown(
    input: UxInteractionDesignInput,
    response: UxDesignGenerationResponse,
    timestamp: string,
  ): string {
    const pages = response.pages
      .map((page) => [
        `### ${page.title}`,
        `- Page ID: ${page.pageId}`,
        `- Layout: ${page.layout}`,
        `- Components: ${page.components.join(', ') || 'none'}`,
      ].join('\n'))
      .join('\n\n');

    const navigation = response.navigationStructure
      .map((item) => `- ${item.label}: ${item.path}`)
      .join('\n');

    const flows = response.operationFlows
      .map((flow) => [
        `### ${flow.name}`,
        `- Flow ID: ${flow.flowId}`,
        ...flow.steps.map((step, index) => `${index + 1}. ${step}`),
      ].join('\n'))
      .join('\n\n');

    return [
      `# ${input.taskId} UX Interaction Design`,
      '',
      `Generated at: ${timestamp}`,
      `Spec artifact: ${input.specPackage.artifact.path}`,
      '',
      '## Pages',
      pages || '- None',
      '',
      '## Navigation',
      navigation || '- None',
      '',
      '## Operation Flows',
      flows || '- None',
      '',
      '## Review',
      '- Author role: ux',
      '- PM review status: pending',
      '',
    ].join('\n');
  }
}
