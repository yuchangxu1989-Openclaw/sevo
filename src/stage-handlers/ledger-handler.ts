/**
 * Stage 14: ledger
 *
 * Aggregates every prior stage's report file into a single
 * docs/ledger.json + docs/ledger.md for archival. The ledger lists each
 * stage's verdict, artifact count, key metrics, and ISO timestamp.
 *
 * If a notification adapter is wired in (lark / feishu via project
 * config), this stage emits a one-line summary file (docs/ledger-notice.txt)
 * that the host's notification plugin can pick up. We don't make outbound
 * network calls from inside the handler — that violates the stranger-ready
 * constraint. The host adapter is responsible for delivery.
 *
 * Verdict is always pass when ledger.json is written successfully.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { StageHandler, StageHandlerResult } from './types.js';
import { ensureDir, makeArtifact, nowIso, readJsonIfExists, writeFileEnsure } from './utils.js';

interface KnownReport {
  filename: string;
  stageId: string;
  verdictKey?: string;
  metricKeys?: string[];
}

const REPORT_FILES: KnownReport[] = [
  { filename: 'product-requirements.json', stageId: 'spec', metricKeys: ['functionalRequirements'] },
  { filename: 'spec-review-gate.json', stageId: 'spec-review-gate', verdictKey: 'verdict' },
  { filename: 'contract-review-gate.json', stageId: 'contract-review-gate', verdictKey: 'verdict' },
  { filename: 'review-report.json', stageId: 'review', verdictKey: 'verdict' },
  { filename: 'review-fix-loop.json', stageId: 'review-fix-loop' },
  { filename: 'regression.json', stageId: 'regression' },
  { filename: 'publish-generalization-gate.json', stageId: 'publish-generalization-gate', verdictKey: 'verdict' },
  { filename: 'deploy.json', stageId: 'deploy', verdictKey: 'verdict' },
  { filename: 'verify.json', stageId: 'verify', verdictKey: 'verdict' },
  { filename: 'endgame-scan.json', stageId: 'endgame-scan', verdictKey: 'verdict' },
];

interface LedgerRow {
  stageId: string;
  verdict: string | null;
  generatedAt: string | null;
  artifactPath: string | null;
  metrics: Record<string, unknown>;
}

function pickMetrics(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keep = [
    'frCount',
    'acCount',
    'contractCount',
    'coveredFrs',
    'missingForFrs',
    'findings',
    'passCount',
    'failCount',
    'testFileCount',
    'matches',
    'scannedFiles',
    'score',
    'usable',
    'total',
    'attempt',
    'maxAttempts',
    'package',
    'publish',
  ];
  for (const k of keep) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

function renderLedgerMarkdown(args: {
  pipelineId: string;
  projectSlug: string;
  generatedAt: string;
  rows: LedgerRow[];
}): string {
  const lines: string[] = [];
  lines.push(`# Ledger — ${args.projectSlug}`);
  lines.push('');
  lines.push(`Pipeline: ${args.pipelineId}`);
  lines.push(`Generated: ${args.generatedAt}`);
  lines.push('');
  lines.push('| Stage | Verdict | Generated At | Artifact |');
  lines.push('| --- | --- | --- | --- |');
  for (const r of args.rows) {
    const verdict = r.verdict ?? '—';
    const ts = r.generatedAt ?? '—';
    const art = r.artifactPath ?? '—';
    lines.push(`| ${r.stageId} | ${verdict} | ${ts} | ${art} |`);
  }
  lines.push('');
  lines.push('## Metrics');
  lines.push('');
  for (const r of args.rows) {
    if (Object.keys(r.metrics).length === 0) continue;
    lines.push(`### ${r.stageId}`);
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(r.metrics, null, 2));
    lines.push('```');
    lines.push('');
  }
  return lines.join('\n');
}

export const ledgerHandler: StageHandler = async (ctx): Promise<StageHandlerResult> => {
  const generatedAt = nowIso(ctx.now);
  const docsDir = path.join(ctx.projectRoot, 'docs');
  ensureDir(docsDir);

  const rows: LedgerRow[] = [];
  for (const def of REPORT_FILES) {
    const filePath = path.join(docsDir, def.filename);
    const exists = fs.existsSync(filePath);
    const data = exists ? readJsonIfExists<Record<string, unknown>>(filePath) : null;
    rows.push({
      stageId: def.stageId,
      verdict: data && def.verdictKey ? String(data[def.verdictKey] ?? '') || null : exists ? 'recorded' : null,
      generatedAt:
        data && typeof data.generatedAt === 'string'
          ? (data.generatedAt as string)
          : data && typeof data.evaluatedAt === 'string'
            ? (data.evaluatedAt as string)
            : data && typeof data.ranAt === 'string'
              ? (data.ranAt as string)
              : null,
      artifactPath: exists ? path.relative(ctx.projectRoot, filePath) : null,
      metrics: data ? pickMetrics(data) : {},
    });
  }

  const overallPass = rows.every(
    (r) => r.verdict === null || r.verdict === 'pass' || r.verdict === 'recorded',
  );
  const ledger = {
    pipelineId: ctx.pipelineId,
    projectSlug: ctx.projectSlug,
    generatedAt,
    overallVerdict: overallPass ? 'pass' : 'block',
    rows,
  };
  const jsonPath = path.join(docsDir, 'ledger.json');
  const mdPath = path.join(docsDir, 'ledger.md');
  writeFileEnsure(jsonPath, JSON.stringify(ledger, null, 2) + '\n');
  writeFileEnsure(
    mdPath,
    renderLedgerMarkdown({
      pipelineId: ctx.pipelineId,
      projectSlug: ctx.projectSlug,
      generatedAt,
      rows,
    }),
  );

  // Drop a notification hint file (host plugin picks it up).
  const noticePath = path.join(docsDir, 'ledger-notice.txt');
  const relativeJsonPath = path.relative(ctx.projectRoot, jsonPath);
  writeFileEnsure(
    noticePath,
    `SEVO pipeline ${ctx.pipelineId} for project ${ctx.projectSlug} ` +
      `wrote ledger at ${relativeJsonPath} (overall=${ledger.overallVerdict}) on ${generatedAt}.\n`,
  );

  return {
    stageId: 'ledger',
    verdict: 'pass',
    artifacts: [
      {
        id: `${ctx.pipelineId}:ledger:json`,
        type: 'ledger-json',
        path: jsonPath,
        createdAt: generatedAt,
        metadata: { overallVerdict: ledger.overallVerdict, rowCount: rows.length },
      },
      {
        id: `${ctx.pipelineId}:ledger:md`,
        type: 'ledger-md',
        path: mdPath,
        createdAt: generatedAt,
      },
      {
        id: `${ctx.pipelineId}:ledger:notice`,
        type: 'ledger-notice',
        path: noticePath,
        createdAt: generatedAt,
      },
    ],
    summary: `Ledger written: ${rows.length} stage row(s), overall=${ledger.overallVerdict}.`,
    issues: [],
    metadata: {
      jsonPath,
      mdPath,
      noticePath,
      overallVerdict: ledger.overallVerdict,
      rowCount: rows.length,
    },
  };
};
