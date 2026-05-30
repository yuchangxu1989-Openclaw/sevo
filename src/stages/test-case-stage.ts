import { mkdir, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import type { ArtifactRef, StageId } from '../types/index.js';
import type { FunctionalRequirement, Stage } from './spec-types.js';
import type {
  TestCase,
  TestCaseDocument,
  TestCaseDocumentMetadata,
  TestCasePriority,
  TestCaseStageInput,
  TestCaseStageOutput,
  TestCaseStageOptions,
} from './test-case-types.js';

export class TestCaseStage implements Stage<TestCaseStageInput, TestCaseStageOutput> {
  readonly stageId: StageId = 'test-case-authoring' as const;
  private readonly now: () => string;

  constructor(private readonly options: TestCaseStageOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async execute(input: TestCaseStageInput): Promise<TestCaseStageOutput> {
    const { specPackage, frPriorities } = input;
    const frs = specPackage.functionalRequirements;

    let testCases: TestCase[];

    if (this.options.adapter.generateTestCases) {
      const response = await this.options.adapter.generateTestCases({
        functionalRequirements: frs,
        frPriorities,
      });

      testCases = response.testCases.map((tc, i) => ({
        id: `TC-${String(i + 1).padStart(3, '0')}`,
        frId: tc.frId,
        acId: tc.acId,
        description: tc.description,
        steps: tc.steps.map((s, si) => ({ order: si + 1, action: s.action, expected: s.expected })),
        expectedResult: tc.expectedResult,
        priority: tc.priority ?? this.resolvePriority(tc.frId, frPriorities),
      }));
    } else {
      // Default: generate one test case per AC, sorted by FR priority
      const sortedFrs = this.sortByPriority(frs, frPriorities);
      let counter = 0;
      testCases = sortedFrs.flatMap((fr) =>
        fr.acceptanceCriteria.map((ac) => {
          counter++;
          return {
            id: `TC-${String(counter).padStart(3, '0')}`,
            frId: fr.id,
            acId: ac.id,
            description: `Verify: ${ac.description}`,
            steps: [{ order: 1, action: `Execute scenario for ${ac.description}`, expected: ac.description }],
            expectedResult: ac.description,
            priority: this.resolvePriority(fr.id, frPriorities),
          } satisfies TestCase;
        }),
      );
    }

    const coverageByFR: Record<string, number> = {};
    for (const tc of testCases) {
      coverageByFR[tc.frId] = (coverageByFR[tc.frId] ?? 0) + 1;
    }

    const timestamp = this.now();
    const metadata: TestCaseDocumentMetadata = {
      generatedAt: timestamp,
      specVersion: specPackage.artifact.id,
      totalTestCases: testCases.length,
      coverageByFR,
    };

    const testCaseDocument: TestCaseDocument = { testCases, metadata };
    const artifact = await this.writeArtifact(input, testCaseDocument, timestamp);

    return { testCaseDocument, metadata, artifact };
  }

  private sortByPriority(
    frs: FunctionalRequirement[],
    frPriorities?: Record<string, TestCasePriority>,
  ): FunctionalRequirement[] {
    const priorityOrder: Record<TestCasePriority, number> = { high: 0, medium: 1, low: 2 };
    const sorted = [...frs];
    if (frPriorities) {
      sorted.sort((a, b) => {
        const pa = priorityOrder[frPriorities[a.id] ?? 'medium'];
        const pb = priorityOrder[frPriorities[b.id] ?? 'medium'];
        return pa - pb;
      });
    }
    return sorted;
  }

  private resolvePriority(frId: string, frPriorities?: Record<string, TestCasePriority>): TestCasePriority {
    return frPriorities?.[frId] ?? 'medium';
  }

  private async writeArtifact(
    input: TestCaseStageInput,
    document: TestCaseDocument,
    timestamp: string,
  ): Promise<ArtifactRef> {
    const basePath = input.artifactBasePath
      ?? path.join(process.cwd(), 'artifacts', 'test-cases');
    await mkdir(basePath, { recursive: true });

    const filePath = path.join(basePath, `${input.taskId}-test-cases.json`);
    await writeFile(filePath, JSON.stringify({ ...document, generatedAt: timestamp }, null, 2), 'utf8');

    return {
      id: `${input.taskId}:test-cases`,
      type: 'test-case-document',
      path: filePath,
      createdAt: timestamp,
      metadata: {
        testCaseCount: document.testCases.length,
        frsCovered: Object.keys(document.metadata.coverageByFR).length,
      },
    };
  }
}
