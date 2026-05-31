import * as path from 'node:path';

import { ReadmeSyncStage } from '../stages/readme-sync-stage.js';
import type { StageHandler } from './types.js';
import { makeArtifact, nowIso } from './utils.js';
const README_STANDARD_RELATIVE_PATH = 'projects/sevo/docs/readme-standard.md';

export const readmeHandler: StageHandler = async (ctx) => {
  const docsDir = path.join(ctx.projectRoot, 'docs');
  const specPath = path.join(docsDir, 'product-requirements.json');
  const readmePath = path.join(ctx.projectRoot, 'README.md');
  const artifactBasePath = path.join(ctx.projectRoot, 'artifacts', 'readme-sync');

  const changedFRs = Array.isArray(ctx.previousResults?.verify?.metadata?.changedFrs)
    ? (ctx.previousResults?.verify?.metadata?.changedFrs as string[])
    : [];

  const stage = new ReadmeSyncStage({ now: ctx.now });
  const result = await stage.execute({
    taskId: ctx.pipelineId,
    pipelineId: ctx.pipelineId,
    projectSlug: ctx.projectSlug,
    specPath,
    readmePath,
    changedFRs,
    artifactBasePath,
  });
  const updateTask = result.updateTask ? {
    ...result.updateTask,
    description: [result.updateTask.description, `Mandatory standard: ${README_STANDARD_RELATIVE_PATH}`].join(' '),
  } : null;

  const generatedAt = nowIso(ctx.now);
  const reportPath = path.join(docsDir, 'readme-sync.json');
  const report = {
    pipelineId: ctx.pipelineId,
    projectSlug: ctx.projectSlug,
    generatedAt,
    verdict: result.verdict,
    coverage: result.coverage,
    missingFrs: result.missingFrs,
    updateTask,
    ledgerPath: result.artifact.path,
  };

  await import('node:fs').then(({ writeFileSync, mkdirSync }) => {
    mkdirSync(path.dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  });

  return {
    stageId: 'readme',
    verdict: result.verdict,
    artifacts: [
      result.artifact,
      makeArtifact({
        id: `${ctx.pipelineId}:readme-report`,
        type: 'readme-sync-report',
        filePath: reportPath,
        createdAt: generatedAt,
        metadata: {
          missingFrCount: result.missingFrs.length,
          changedFrCount: result.ledgerEntry.changedFRs.length,
        },
      }),
    ],
    summary: result.verdict === 'pass'
      ? `README already covers ${result.coverage.length} changed FR(s).`
      : `README sync blocked: ${result.missingFrs.length} changed FR(s) need documentation updates. Follow ${README_STANDARD_RELATIVE_PATH}.`,
    issues: result.missingFrs.map((frId) => `README missing coverage for ${frId}`),
    metadata: {
      changedFrs: result.ledgerEntry.changedFRs,
      coverage: result.coverage,
      missingFrs: result.missingFrs,
      updateTask,
      ledgerPath: result.artifact.path,
      reportPath,
    },
  };
};
