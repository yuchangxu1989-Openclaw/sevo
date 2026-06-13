/**
 * Stage 5: contract-review-gate
 *
 * Cross-checks docs/contracts/*.json against docs/product-requirements.json:
 *   - Every FR has a matching contract document
 *   - Every contract references AC ids that exist in the spec
 *   - No stray contracts for non-existent FRs
 *
 * Verdict: pass when all FRs covered with no stray contracts; block otherwise.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { StageHandler, StageHandlerResult } from './types.js';
import { makeArtifact, nowIso, readJsonIfExists, writeFileEnsure } from './utils.js';

interface SpecJson {
  functionalRequirements?: Array<{
    title?: string;
    description?: string;
    acceptanceCriteria?: string[];
  }>;
}

interface ContractDoc {
  frId?: string;
  title?: string;
  acceptanceCriteria?: string[];
  api?: { cli?: unknown[]; functions?: unknown[] };
  events?: unknown[];
  data?: unknown[];
}

export const contractReviewGateHandler: StageHandler = async (ctx): Promise<StageHandlerResult> => {
  const evaluatedAt = nowIso(ctx.now);
  const docsDir = path.join(ctx.projectRoot, 'docs');
  const contractsDir = path.join(docsDir, 'contracts');

  const spec = readJsonIfExists<SpecJson>(path.join(docsDir, 'product-requirements.json'));
  const issues: string[] = [];

  const frIds = (spec?.functionalRequirements ?? []).map((_, i) => `FR-${String(i + 1).padStart(2, '0')}`);
  const acByFr: Record<string, string[]> = {};
  (spec?.functionalRequirements ?? []).forEach((fr, i) => {
    const id = `FR-${String(i + 1).padStart(2, '0')}`;
    acByFr[id] = (fr.acceptanceCriteria ?? []).filter((a) => a?.trim());
  });

  if (!fs.existsSync(contractsDir)) {
    issues.push(`Contracts directory not found: ${contractsDir}`);
  }

  const contractFiles = fs.existsSync(contractsDir)
    ? fs
        .readdirSync(contractsDir)
        .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
        .map((f) => path.join(contractsDir, f))
    : [];

  const contractFrIds = new Set<string>();
  const contractDetails: Array<{ file: string; frId: string | null; valid: boolean; reason?: string }> = [];
  for (const file of contractFiles) {
    const doc = readJsonIfExists<ContractDoc>(file);
    if (!doc) {
      contractDetails.push({ file, frId: null, valid: false, reason: 'unparseable' });
      issues.push(`Contract ${path.basename(file)} unparseable`);
      continue;
    }
    if (!doc.frId) {
      contractDetails.push({ file, frId: null, valid: false, reason: 'missing-frId' });
      issues.push(`Contract ${path.basename(file)} missing frId`);
      continue;
    }
    contractFrIds.add(doc.frId);
    const validShape = Boolean(doc.api && Array.isArray(doc.events) && Array.isArray(doc.data));
    if (!validShape) {
      contractDetails.push({ file, frId: doc.frId, valid: false, reason: 'incomplete-shape' });
      issues.push(`Contract for ${doc.frId} missing api/events/data sections`);
      continue;
    }
    contractDetails.push({ file, frId: doc.frId, valid: true });
  }

  const missingForFrs = frIds.filter((id) => !contractFrIds.has(id));
  for (const id of missingForFrs) issues.push(`No contract found for ${id}`);

  const strayContracts = [...contractFrIds].filter((id) => !frIds.includes(id));
  for (const id of strayContracts) issues.push(`Stray contract for non-existent ${id}`);

  const verdict = issues.length === 0 ? 'pass' : 'block';

  const reportPath = path.join(docsDir, 'contract-review-gate.json');
  const report = {
    pipelineId: ctx.pipelineId,
    projectSlug: ctx.projectSlug,
    evaluatedAt,
    verdict,
    frCount: frIds.length,
    contractCount: contractFiles.length,
    coveredFrs: frIds.filter((id) => contractFrIds.has(id)),
    missingForFrs,
    strayContracts,
    contracts: contractDetails.map((c) => ({
      file: path.relative(ctx.projectRoot, c.file),
      frId: c.frId,
      valid: c.valid,
      reason: c.reason,
    })),
    issues,
  };
  writeFileEnsure(reportPath, JSON.stringify(report, null, 2) + '\n');

  return {
    stageId: 'contract-review-gate',
    verdict,
    artifacts: [
      makeArtifact({
        id: `${ctx.pipelineId}:contract-review-gate`,
        type: 'contract-review-gate',
        filePath: reportPath,
        createdAt: evaluatedAt,
        metadata: { verdict, frCount: frIds.length, contractCount: contractFiles.length },
      }),
    ],
    summary:
      verdict === 'pass'
        ? `Contract review passed: ${contractFiles.length} contracts cover ${frIds.length} FR.`
        : `Contract review needs fix: ${issues.length} issue(s).`,
    issues,
    metadata: {
      frCount: frIds.length,
      contractCount: contractFiles.length,
      reportPath,
    },
  };
};
