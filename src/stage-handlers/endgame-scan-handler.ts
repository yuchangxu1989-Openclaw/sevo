/**
 * Stage 13: endgame-scan
 *
 * Walks the spec FR list and asks the deeper question:
 *   "Is each FR really usable by a stranger right now?"
 *
 * For every FR we collect three signals:
 *   - implFiles: number of source files referencing this FR
 *   - testFiles: number of test files for this FR
 *   - contractFile: whether docs/contracts/<fr>.json exists
 *
 * A FR is "usable" only when all three are present. The output is
 * docs/endgame-scan.json with per-FR scores and an overall percentage.
 *
 * Verdict: pass when usability >= 0.8 (configurable via env), block otherwise.
 * The point is to catch the same gap audit-01 found: code exists in source,
 * but the user-facing flow is broken.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { StageHandler, StageHandlerResult } from './types.js';
import { ensureDir, makeArtifact, nowIso, readJsonIfExists, writeFileEnsure } from './utils.js';

interface SpecJson {
  functionalRequirements?: Array<{
    title?: string;
    description?: string;
    acceptanceCriteria?: string[];
  }>;
}

interface FRRow {
  frId: string;
  title: string;
  acCount: number;
  implFiles: number;
  testFiles: number;
  contract: boolean;
  usable: boolean;
  gaps: string[];
}

const DEFAULT_PASS_THRESHOLD = 0.8;

export const endgameScanHandler: StageHandler = async (ctx): Promise<StageHandlerResult> => {
  const evaluatedAt = nowIso(ctx.now);
  const docsDir = path.join(ctx.projectRoot, 'docs');
  ensureDir(docsDir);

  const spec = readJsonIfExists<SpecJson>(path.join(docsDir, 'product-requirements.json'));
  const frs = spec?.functionalRequirements ?? [];

  const manifest = readJsonIfExists<{ files?: Array<{ frId: string; relPath: string }> }>(
    path.join(ctx.projectRoot, 'src', 'implement-manifest.json'),
  );
  const testPlan = readJsonIfExists<{ files?: Array<{ frId: string; relPath: string }> }>(
    path.join(ctx.projectRoot, 'src', 'tests', '_test-plan.json'),
  );
  const contractIdx = readJsonIfExists<{ contracts?: Array<{ frId: string; relPath: string }> }>(
    path.join(docsDir, 'contracts', '_index.json'),
  );

  const implByFr = new Map<string, number>();
  for (const f of manifest?.files ?? []) {
    if (!f.frId) continue;
    implByFr.set(f.frId, (implByFr.get(f.frId) ?? 0) + 1);
  }
  const testByFr = new Map<string, number>();
  for (const f of testPlan?.files ?? []) {
    testByFr.set(f.frId, (testByFr.get(f.frId) ?? 0) + 1);
  }
  const contractByFr = new Set<string>(
    (contractIdx?.contracts ?? [])
      .filter((c) => fs.existsSync(path.join(ctx.projectRoot, c.relPath)))
      .map((c) => c.frId),
  );

  const rows: FRRow[] = frs.map((fr, i) => {
    const frId = `FR-${String(i + 1).padStart(2, '0')}`;
    const title = fr.title?.trim() || `Requirement ${i + 1}`;
    const acCount = (fr.acceptanceCriteria ?? []).filter((a) => a?.trim()).length;
    const impl = implByFr.get(frId) ?? 0;
    const tests = testByFr.get(frId) ?? 0;
    const contract = contractByFr.has(frId);
    const gaps: string[] = [];
    if (impl === 0) gaps.push('no implementation file');
    if (tests === 0) gaps.push('no test file');
    if (!contract) gaps.push('no contract document');
    return {
      frId,
      title,
      acCount,
      implFiles: impl,
      testFiles: tests,
      contract,
      usable: gaps.length === 0,
      gaps,
    };
  });

  const usable = rows.filter((r) => r.usable).length;
  const total = rows.length;
  const score = total === 0 ? 0 : usable / total;
  const threshold = parseFloat(process.env.SEVO_ENDGAME_THRESHOLD ?? '') || DEFAULT_PASS_THRESHOLD;
  const verdict = total > 0 && score >= threshold ? 'pass' : 'block';

  const reportPath = path.join(docsDir, 'endgame-scan.json');
  const report = {
    pipelineId: ctx.pipelineId,
    projectSlug: ctx.projectSlug,
    evaluatedAt,
    verdict,
    threshold,
    total,
    usable,
    score,
    rows,
  };
  writeFileEnsure(reportPath, JSON.stringify(report, null, 2) + '\n');

  return {
    stageId: 'endgame-scan' as any,
    verdict,
    artifacts: [
      makeArtifact({
        id: `${ctx.pipelineId}:endgame-scan`,
        type: 'endgame-scan-report',
        filePath: reportPath,
        createdAt: evaluatedAt,
        metadata: { verdict, score, usable, total },
      }),
    ],
    summary:
      verdict === 'pass'
        ? `Endgame scan passed: ${usable}/${total} FR usable (score ${(score * 100).toFixed(0)}%).`
        : `Endgame scan blocked: only ${usable}/${total} FR usable (score ${(score * 100).toFixed(0)}% < threshold ${(threshold * 100).toFixed(0)}%).`,
    issues: rows
      .filter((r) => !r.usable)
      .slice(0, 30)
      .map((r) => `${r.frId} ${r.title}: ${r.gaps.join(', ')}`),
    metadata: { score, usable, total, threshold, reportPath },
  };
};
