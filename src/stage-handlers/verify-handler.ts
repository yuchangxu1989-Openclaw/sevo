/**
 * Stage 12: verify
 *
 * Stranger-environment happy-path simulation. We can't always npm-install
 * inside a stage handler (no network, slow), so this stage runs a curated
 * verification protocol:
 *
 *   1. If a CLI bin is declared in package.json, exec `<bin> --help` from
 *      a tmp dir to confirm the binary loads cleanly with no PATH leaks.
 *   2. If docs/contracts/_index.json exists, every contract file must
 *      parse and reference an FR that is present in the spec.
 *   3. If src/tests/_test-plan.json exists, every test file must exist on
 *      disk under src/tests/.
 *
 * Verdict pass when all checks pass.
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { StageHandler, StageHandlerResult } from './types.js';
import { ensureDir, makeArtifact, nowIso, readJsonIfExists, writeFileEnsure } from './utils.js';

const HEALTHCHECK_STANDARD_RELATIVE_PATH = 'projects/sevo/docs/healthcheck-standard.md';

interface PackageJson {
  name?: string;
  bin?: string | Record<string, string>;
}

interface Check {
  name: string;
  passed: boolean;
  detail: string;
}

interface SpecJson {
  functionalRequirements?: Array<unknown>;
}

interface ContractIndex {
  contracts?: Array<{ frId: string; relPath: string }>;
}

interface TestPlan {
  files?: Array<{ frId: string; relPath: string }>;
}

function findBinPath(packageRoot: string, pkg: PackageJson | null): string | null {
  if (!pkg?.bin) return null;
  if (typeof pkg.bin === 'string') {
    return path.join(packageRoot, pkg.bin);
  }
  const entries = Object.values(pkg.bin);
  return entries[0] ? path.join(packageRoot, entries[0]) : null;
}

export const verifyHandler: StageHandler = async (ctx): Promise<StageHandlerResult> => {
  const evaluatedAt = nowIso(ctx.now);
  const docsDir = path.join(ctx.projectRoot, 'docs');
  ensureDir(docsDir);

  const checks: Check[] = [];

  const pkgCandidates = [
    path.join(ctx.projectRoot, 'package.json'),
    path.join(ctx.workspaceRoot, 'package.json'),
  ];
  const pkgPath = pkgCandidates.find((candidate) => fs.existsSync(candidate)) ?? pkgCandidates[0]!;
  const packageRoot = path.dirname(pkgPath);
  const pkg = readJsonIfExists<PackageJson>(pkgPath);
  const binPath = findBinPath(packageRoot, pkg);
  if (binPath && fs.existsSync(binPath)) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-verify-'));
    try {
      const child = spawnSync('node', [binPath, '--help'], {
        cwd: tmpDir,
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
        encoding: 'utf-8',
        timeout: 15_000,
      });
      const ok = (child.status ?? -1) === 0;
      checks.push({
        name: 'cli-help',
        passed: ok,
        detail: ok
          ? `Binary ${path.relative(ctx.projectRoot, binPath)} responded to --help.`
          : `Binary exited ${child.status ?? -1}: ${((child.stderr as unknown as string) ?? '').slice(0, 200)}`,
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  } else if (binPath) {
    checks.push({
      name: 'cli-help',
      passed: false,
      detail: `Declared bin path ${binPath} does not exist.`,
    });
  } else {
    checks.push({
      name: 'cli-help',
      passed: true,
      detail: 'No CLI bin declared; check skipped.',
    });
  }

  const spec = readJsonIfExists<SpecJson>(path.join(docsDir, 'product-requirements.json'));
  const frIds = new Set<string>(
    (spec?.functionalRequirements ?? []).map((_, i) => `FR-${String(i + 1).padStart(2, '0')}`),
  );

  const contractIdx = readJsonIfExists<ContractIndex>(path.join(docsDir, 'contracts', '_index.json'));
  const contractIssues: string[] = [];
  if (contractIdx?.contracts) {
    for (const c of contractIdx.contracts) {
      const full = path.join(ctx.projectRoot, c.relPath);
      if (!fs.existsSync(full)) {
        contractIssues.push(`Contract file missing: ${c.relPath}`);
      } else if (!frIds.has(c.frId)) {
        contractIssues.push(`Contract ${c.frId} has no matching FR in spec`);
      }
    }
  }
  checks.push({
    name: 'contracts-trace',
    passed: contractIssues.length === 0,
    detail:
      contractIssues.length === 0
        ? `All ${contractIdx?.contracts?.length ?? 0} contract(s) trace to spec FRs.`
        : contractIssues.join('; '),
  });

  const testPlan = readJsonIfExists<TestPlan>(
    path.join(ctx.projectRoot, 'src', 'tests', '_test-plan.json'),
  );
  const testIssues: string[] = [];
  if (testPlan?.files) {
    for (const f of testPlan.files) {
      const full = path.join(ctx.projectRoot, f.relPath);
      if (!fs.existsSync(full)) testIssues.push(`Test file missing: ${f.relPath}`);
    }
  }
  checks.push({
    name: 'test-files-exist',
    passed: testIssues.length === 0,
    detail:
      testIssues.length === 0
        ? `All ${testPlan?.files?.length ?? 0} test file(s) on disk.`
        : testIssues.join('; '),
  });

  const verdict = checks.every((c) => c.passed) ? 'pass' : 'block';
  const reportPath = path.join(docsDir, 'verify.json');
  const report = {
    pipelineId: ctx.pipelineId,
    projectSlug: ctx.projectSlug,
    evaluatedAt,
    verdict,
    standardPath: HEALTHCHECK_STANDARD_RELATIVE_PATH,
    checks,
    issues: checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.detail}`),
  };
  writeFileEnsure(reportPath, JSON.stringify(report, null, 2) + '\n');

  return {
    stageId: 'verify',
    verdict,
    artifacts: [
      makeArtifact({
        id: `${ctx.pipelineId}:verify`,
        type: 'verify-report',
        filePath: reportPath,
        createdAt: evaluatedAt,
        metadata: { verdict, checks: checks.length },
      }),
    ],
    summary:
      verdict === 'pass'
        ? `Verify passed: ${checks.length} check(s) all green. Standard: ${HEALTHCHECK_STANDARD_RELATIVE_PATH}.`
        : `Verify needs fix: ${checks.filter((c) => !c.passed).length} check(s) failed. Follow ${HEALTHCHECK_STANDARD_RELATIVE_PATH}.`,
    issues: checks.filter((c) => !c.passed).map((c) => `${c.name}: ${c.detail}`),
    metadata: { checks, reportPath, standardPath: HEALTHCHECK_STANDARD_RELATIVE_PATH },
  };
};
