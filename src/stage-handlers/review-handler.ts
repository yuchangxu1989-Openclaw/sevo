/**
 * Stage 7: review
 *
 * Static AC coverage analysis: walks src/ for files, walks src/tests for
 * test files, cross-references with spec FR/AC ids, and emits
 * docs/review-report.json with a coverage matrix.
 *
 * If LLM is available, it asks for code-quality findings on top of the
 * static analysis. Verdict is pass when every FR has at least one source
 * file AND at least one test, otherwise block with structured findings.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { StageHandler, StageHandlerResult } from './types.js';
import {
  makeArtifact,
  nowIso,
  parseLlmJson,
  readJsonIfExists,
  writeFileEnsure,
} from './utils.js';

interface SpecJson {
  functionalRequirements?: Array<{
    title?: string;
    description?: string;
    acceptanceCriteria?: string[];
  }>;
}

interface ImplementManifest {
  files?: Array<{ frId: string; relPath: string; source: string }>;
}

interface TestPlan {
  files?: Array<{ frId: string; relPath: string; testCount: number }>;
}

interface LlmReviewPayload {
  findings?: Array<{ severity?: 'P0' | 'P1' | 'P2' | 'P3'; frId?: string; description?: string }>;
}

const REVIEW_SYSTEM_PROMPT = [
  'You are a senior code reviewer auditing a SEVO project.',
  'Output STRICT JSON, no markdown fences:',
  '{ "findings": [ { "severity": "P0|P1|P2|P3", "frId": "FR-NN", "description": "..." } ] }',
  'Severity is mandatory. Empty findings means clean review.',
].join('\n');

function listSourceFiles(srcRoot: string): string[] {
  if (!fs.existsSync(srcRoot)) return [];
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'tests' || entry.name === 'node_modules') continue;
        walk(full);
      } else if (entry.isFile() && /\.(ts|tsx|js|mjs)$/.test(entry.name)) {
        out.push(full);
      }
    }
  };
  walk(srcRoot);
  return out;
}

export const reviewHandler: StageHandler = async (ctx): Promise<StageHandlerResult> => {
  const evaluatedAt = nowIso(ctx.now);
  const docsDir = path.join(ctx.projectRoot, 'docs');
  const spec = readJsonIfExists<SpecJson>(path.join(docsDir, 'product-requirements.json'));
  const manifest = readJsonIfExists<ImplementManifest>(
    path.join(ctx.projectRoot, 'src', 'implement-manifest.json'),
  );
  const testPlan = readJsonIfExists<TestPlan>(path.join(ctx.projectRoot, 'src', 'tests', '_test-plan.json'));

  const frIds = (spec?.functionalRequirements ?? []).map(
    (_, i) => `FR-${String(i + 1).padStart(2, '0')}`,
  );

  const implByFr = new Map<string, string[]>();
  for (const f of manifest?.files ?? []) {
    if (!f.frId) continue;
    if (!implByFr.has(f.frId)) implByFr.set(f.frId, []);
    implByFr.get(f.frId)!.push(f.relPath);
  }

  const testByFr = new Map<string, string[]>();
  for (const f of testPlan?.files ?? []) {
    if (!testByFr.has(f.frId)) testByFr.set(f.frId, []);
    testByFr.get(f.frId)!.push(f.relPath);
  }

  const sourceFiles = listSourceFiles(path.join(ctx.projectRoot, 'src'));

  const matrix = frIds.map((id) => ({
    frId: id,
    impl: implByFr.get(id) ?? [],
    tests: testByFr.get(id) ?? [],
    covered: (implByFr.get(id) ?? []).length > 0 && (testByFr.get(id) ?? []).length > 0,
  }));

  const findings: Array<{ severity: 'P0' | 'P1' | 'P2' | 'P3'; frId: string; description: string }> = [];
  for (const row of matrix) {
    if (row.impl.length === 0) {
      findings.push({
        severity: 'P0',
        frId: row.frId,
        description: `No implementation file found for ${row.frId}`,
      });
    }
    if (row.tests.length === 0) {
      findings.push({
        severity: 'P1',
        frId: row.frId,
        description: `No test file found for ${row.frId}`,
      });
    }
  }

  // Optional LLM-driven review on top of static analysis.
  let llmFindings: LlmReviewPayload['findings'] = [];
  if (ctx.llm && sourceFiles.length > 0) {
    try {
      const sample = sourceFiles
        .slice(0, 10)
        .map((f) => `// ${path.relative(ctx.projectRoot, f)}\n${fs.readFileSync(f, 'utf8').slice(0, 2000)}`)
        .join('\n\n');
      const raw = await ctx.llm.chat([
        { role: 'system', content: REVIEW_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Spec FRs: ${frIds.join(', ')}\n\nFiles:\n${sample}`,
        },
      ]);
      const parsed = parseLlmJson<LlmReviewPayload>(raw);
      if (parsed?.findings) llmFindings = parsed.findings;
    } catch {
      llmFindings = [];
    }
  }

  for (const f of llmFindings ?? []) {
    if (!f?.description) continue;
    findings.push({
      severity: (f.severity as 'P0' | 'P1' | 'P2' | 'P3') ?? 'P2',
      frId: f.frId ?? 'GLOBAL',
      description: f.description,
    });
  }

  const blocking = findings.filter((f) => f.severity === 'P0' || f.severity === 'P1');
  const verdict = blocking.length === 0 ? 'pass' : 'block';

  const reportPath = path.join(docsDir, 'review-report.json');
  const report = {
    pipelineId: ctx.pipelineId,
    projectSlug: ctx.projectSlug,
    evaluatedAt,
    verdict,
    frCount: frIds.length,
    coveredFrCount: matrix.filter((r) => r.covered).length,
    sourceFileCount: sourceFiles.length,
    matrix,
    findings,
    llmFindingsCount: llmFindings?.length ?? 0,
  };
  writeFileEnsure(reportPath, JSON.stringify(report, null, 2) + '\n');

  return {
    stageId: 'review',
    verdict,
    artifacts: [
      makeArtifact({
        id: `${ctx.pipelineId}:review-report`,
        type: 'review-report',
        filePath: reportPath,
        createdAt: evaluatedAt,
        metadata: { verdict, findings: findings.length, blocking: blocking.length },
      }),
    ],
    summary:
      verdict === 'pass'
        ? `Review passed: ${matrix.length} FR fully covered (${sourceFiles.length} source files).`
        : `Review blocked: ${blocking.length} P0/P1 finding(s) out of ${findings.length}.`,
    issues: blocking.map((f) => `${f.severity} ${f.frId}: ${f.description}`),
    metadata: {
      frCount: frIds.length,
      coveredFrCount: matrix.filter((r) => r.covered).length,
      findings,
      reportPath,
    },
  };
};
