/**
 * Stage 4: contract
 *
 * Reads spec FRs and emits docs/contracts/*.json — one contract per FR
 * covering API surface, events, and data shapes (placeholder structure
 * users fill in as implementation proceeds).
 */

import * as path from 'node:path';

import type { StageHandler, StageHandlerResult } from './types.js';
import { testCaseAuthoringHandler } from './test-case-authoring-handler.js';
import {
  ensureDir,
  makeArtifact,
  nowIso,
  readJsonIfExists,
  slugify,
  writeFileEnsure,
} from './utils.js';

interface SpecJson {
  functionalRequirements?: Array<{
    title?: string;
    description?: string;
    acceptanceCriteria?: string[];
  }>;
}

interface ContractDocument {
  pipelineId: string;
  projectSlug: string;
  frId: string;
  title: string;
  generatedAt: string;
  api: {
    cli?: Array<{ command: string; description: string }>;
    functions?: Array<{ name: string; description: string; signature: string }>;
  };
  events: Array<{ name: string; payload: Record<string, string> }>;
  data: Array<{ shape: string; fields: Array<{ name: string; type: string; description: string }> }>;
  acceptanceCriteria: string[];
}

function buildContract(args: {
  pipelineId: string;
  projectSlug: string;
  frId: string;
  title: string;
  description: string;
  acs: string[];
  generatedAt: string;
}): ContractDocument {
  const slug = slugify(args.title);
  return {
    pipelineId: args.pipelineId,
    projectSlug: args.projectSlug,
    frId: args.frId,
    title: args.title,
    generatedAt: args.generatedAt,
    api: {
      cli: [
        {
          command: `${args.projectSlug} ${slug}`,
          description: args.description || `Execute ${args.title}`,
        },
      ],
      functions: [
        {
          name: `${slug.replace(/-([a-z])/g, (_, c) => c.toUpperCase())}`,
          description: args.description || `Implement ${args.title}`,
          signature: `(input: ${args.frId}Input) => Promise<${args.frId}Output>`,
        },
      ],
    },
    events: [
      {
        name: `${args.frId.toLowerCase()}.completed`,
        payload: { frId: 'string', success: 'boolean', timestamp: 'ISO8601' },
      },
    ],
    data: [
      {
        shape: `${args.frId}Input`,
        fields: [{ name: 'request', type: 'unknown', description: 'caller-supplied payload' }],
      },
      {
        shape: `${args.frId}Output`,
        fields: [
          { name: 'success', type: 'boolean', description: 'whether call succeeded' },
          { name: 'artifacts', type: 'string[]', description: 'paths of files written' },
        ],
      },
    ],
    acceptanceCriteria: args.acs,
  };
}

export const contractHandler: StageHandler = async (ctx): Promise<StageHandlerResult> => {
  const generatedAt = nowIso(ctx.now);
  const docsDir = path.join(ctx.projectRoot, 'docs');
  const specJson = readJsonIfExists<SpecJson>(path.join(docsDir, 'product-requirements.json'));
  const frs = specJson?.functionalRequirements ?? [];

  const contractsDir = path.join(docsDir, 'contracts');
  ensureDir(contractsDir);

  if (frs.length === 0) {
    const indexPath = path.join(contractsDir, '_index.json');
    writeFileEnsure(
      indexPath,
      JSON.stringify(
        { pipelineId: ctx.pipelineId, generatedAt, frCount: 0, contracts: [] },
        null,
        2,
      ) + '\n',
    );
    return {
      stageId: 'contract',
      verdict: 'block',
      artifacts: [
        makeArtifact({
          id: `${ctx.pipelineId}:contracts:index`,
          type: 'contract-index',
          filePath: indexPath,
          createdAt: generatedAt,
        }),
      ],
      summary: 'No FR found in spec — cannot author contracts.',
      issues: ['No FR found in spec'],
      metadata: { frCount: 0 },
    };
  }

  const written: Array<{ frId: string; filePath: string }> = [];
  for (let i = 0; i < frs.length; i++) {
    const fr = frs[i];
    if (!fr) continue;
    const frId = `FR-${String(i + 1).padStart(2, '0')}`;
    const title = fr.title?.trim() || `Requirement ${i + 1}`;
    const acs = (fr.acceptanceCriteria ?? []).filter((a) => a?.trim());
    const contract = buildContract({
      pipelineId: ctx.pipelineId,
      projectSlug: ctx.projectSlug,
      frId,
      title,
      description: fr.description?.trim() ?? '',
      acs,
      generatedAt,
    });
    const fileName = `${frId.toLowerCase()}-${slugify(title)}.json`;
    const filePath = path.join(contractsDir, fileName);
    writeFileEnsure(filePath, JSON.stringify(contract, null, 2) + '\n');
    written.push({ frId, filePath });
  }

  const indexPath = path.join(contractsDir, '_index.json');
  writeFileEnsure(
    indexPath,
    JSON.stringify(
      {
        pipelineId: ctx.pipelineId,
        projectSlug: ctx.projectSlug,
        generatedAt,
        frCount: frs.length,
        contracts: written.map((w) => ({
          frId: w.frId,
          relPath: path.relative(ctx.projectRoot, w.filePath),
        })),
      },
      null,
      2,
    ) + '\n',
  );

  const testPlanResult = await testCaseAuthoringHandler(ctx);
  if (testPlanResult.verdict !== 'pass') {
    return {
      stageId: 'contract',
      verdict: testPlanResult.verdict,
      artifacts: [
        makeArtifact({
          id: `${ctx.pipelineId}:contracts:index`,
          type: 'contract-index',
          filePath: indexPath,
          createdAt: generatedAt,
          metadata: { frCount: frs.length },
        }),
        ...written.map((w) =>
          makeArtifact({
            id: `${ctx.pipelineId}:contract:${w.frId}`,
            type: 'contract-document',
            filePath: w.filePath,
            createdAt: generatedAt,
            metadata: { frId: w.frId },
          }),
        ),
        ...testPlanResult.artifacts,
      ],
      summary: `Wrote ${written.length} contract document(s), but test authoring ${testPlanResult.verdict}.`,
      issues: testPlanResult.issues,
      metadata: { frCount: frs.length, indexPath, testPlan: testPlanResult.metadata },
    };
  }

  return {
    stageId: 'contract',
    verdict: 'pass',
    artifacts: [
      makeArtifact({
        id: `${ctx.pipelineId}:contracts:index`,
        type: 'contract-index',
        filePath: indexPath,
        createdAt: generatedAt,
        metadata: { frCount: frs.length },
      }),
      ...written.map((w) =>
        makeArtifact({
          id: `${ctx.pipelineId}:contract:${w.frId}`,
          type: 'contract-document',
          filePath: w.filePath,
          createdAt: generatedAt,
          metadata: { frId: w.frId },
        }),
      ),
      ...testPlanResult.artifacts,
    ],
    summary: `Wrote ${written.length} contract document(s) and test plan for ${frs.length} FR.`,
    issues: [],
    metadata: { frCount: frs.length, indexPath, testPlan: testPlanResult.metadata },
  };
};
