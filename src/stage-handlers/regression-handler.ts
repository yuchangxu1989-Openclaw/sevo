/**
 * Stage 9: regression
 *
 * Runs `vitest run` (or `npx vitest run`) inside the project root and
 * captures pass/fail counts plus stdout/stderr to docs/regression.json.
 *
 * Verdict:
 *   pass — exit code 0
 *   fail — non-zero exit (pipeline must rollback)
 */

import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { StageHandler, StageHandlerResult } from './types.js';
import { ensureDir, makeArtifact, nowIso, writeFileEnsure } from './utils.js';

interface RegressionResult {
  pipelineId: string;
  projectSlug: string;
  ranAt: string;
  command: string;
  exitCode: number;
  durationMs: number;
  stdoutTailKb: string;
  stderrTailKb: string;
  passCount: number;
  failCount: number;
  testFileCount: number;
}

function detectVitest(projectRoot: string, workspaceRoot: string): { cmd: string; args: string[] } | null {
  const candidates = [
    path.join(projectRoot, 'node_modules', '.bin', 'vitest'),
    path.join(workspaceRoot, 'node_modules', '.bin', 'vitest'),
  ];
  for (const localBin of candidates) {
    if (fs.existsSync(localBin)) {
      return { cmd: localBin, args: ['run', '--reporter=default'] };
    }
  }
  // No local vitest. Avoid `npx vitest` because it fetches over the network
  // and stalls handlers in offline / fresh environments. Caller must install
  // vitest as a project dependency to run regression.
  return null;
}

function tail(text: string, kb: number): string {
  const max = kb * 1024;
  if (text.length <= max) return text;
  return text.slice(text.length - max);
}

function sanitizePaths(text: string, ctx: { projectRoot: string; workspaceRoot: string }): string {
  return text
    .replaceAll(ctx.projectRoot, '<projectRoot>')
    .replaceAll(ctx.workspaceRoot, '<workspaceRoot>');
}

function parseVitestSummary(stdout: string): { pass: number; fail: number; testFiles: number } {
  // Vitest prints lines like:
  //   Test Files  3 passed (3)
  //   Tests       12 passed (12)
  // Or with failures:
  //   Tests       4 failed | 8 passed (12)
  const tests = stdout.match(/Tests\s+([^\n]+)/);
  let pass = 0;
  let fail = 0;
  if (tests && tests[1]) {
    const passMatch = tests[1].match(/(\d+)\s+passed/);
    const failMatch = tests[1].match(/(\d+)\s+failed/);
    if (passMatch && passMatch[1]) pass = parseInt(passMatch[1], 10);
    if (failMatch && failMatch[1]) fail = parseInt(failMatch[1], 10);
  }
  const tf = stdout.match(/Test Files\s+(?:.*?)(\d+)\s+passed/);
  const testFiles = tf && tf[1] ? parseInt(tf[1], 10) : 0;
  return { pass, fail, testFiles };
}

export const regressionHandler: StageHandler = async (ctx): Promise<StageHandlerResult> => {
  const ranAt = nowIso(ctx.now);
  const docsDir = path.join(ctx.projectRoot, 'docs');
  ensureDir(docsDir);

  const detected = detectVitest(ctx.projectRoot, ctx.workspaceRoot);
  if (!detected) {
    const reportPath = path.join(docsDir, 'regression.json');
    const remediation = 'Install vitest as a dev dependency in your project: npm install --save-dev vitest';
    writeFileEnsure(
      reportPath,
      JSON.stringify(
        {
          pipelineId: ctx.pipelineId,
          ranAt,
          error: 'vitest binary not found',
          remediation,
          searchedPaths: [
            path.join(ctx.projectRoot, 'node_modules', '.bin', 'vitest'),
            path.join(ctx.workspaceRoot, 'node_modules', '.bin', 'vitest'),
          ],
          exitCode: -1,
        },
        null,
        2,
      ) + '\n',
    );
    return {
      stageId: 'regression',
      verdict: 'fail',
      artifacts: [
        makeArtifact({
          id: `${ctx.pipelineId}:regression`,
          type: 'regression-report',
          filePath: reportPath,
          createdAt: ranAt,
        }),
      ],
      summary: `vitest not available — regression cannot run. Fix: ${remediation}`,
      issues: [
        'vitest binary not found in node_modules/.bin',
        `Remediation: ${remediation}`,
      ],
      metadata: { exitCode: -1, remediation },
    };
  }

  const opts: SpawnSyncOptions = {
    cwd: ctx.projectRoot,
    env: { ...process.env, CI: '1' },
    encoding: 'utf-8',
    timeout: 60_000,
  };
  const start = Date.now();
  const child = spawnSync(detected.cmd, detected.args, opts);
  const durationMs = Date.now() - start;
  const stdout = (child.stdout as unknown as string) ?? '';
  const stderr = (child.stderr as unknown as string) ?? '';
  const exitCode = child.status ?? -1;
  const sanitizedStdout = sanitizePaths(stdout, ctx);
  const sanitizedStderr = sanitizePaths(stderr, ctx);

  const summary = parseVitestSummary(sanitizedStdout + '\n' + sanitizedStderr);

  const result: RegressionResult = {
    pipelineId: ctx.pipelineId,
    projectSlug: ctx.projectSlug,
    ranAt,
    command: `vitest ${detected.args.join(' ')}`,
    exitCode,
    durationMs,
    stdoutTailKb: tail(sanitizedStdout, 16),
    stderrTailKb: tail(sanitizedStderr, 16),
    passCount: summary.pass,
    failCount: summary.fail,
    testFileCount: summary.testFiles,
  };

  const reportPath = path.join(docsDir, 'regression.json');
  writeFileEnsure(reportPath, JSON.stringify(result, null, 2) + '\n');

  const verdict: 'pass' | 'fail' = exitCode === 0 ? 'pass' : 'fail';

  return {
    stageId: 'regression',
    verdict,
    artifacts: [
      makeArtifact({
        id: `${ctx.pipelineId}:regression`,
        type: 'regression-report',
        filePath: reportPath,
        createdAt: ranAt,
        metadata: { exitCode, passCount: summary.pass, failCount: summary.fail },
      }),
    ],
    summary:
      verdict === 'pass'
        ? `Regression passed: ${summary.pass} tests in ${summary.testFiles} file(s).`
        : `Regression failed: exit ${exitCode}, ${summary.fail} test failure(s).`,
    issues: verdict === 'pass' ? [] : [`Regression failed with exit ${exitCode}`],
    metadata: {
      exitCode,
      passCount: summary.pass,
      failCount: summary.fail,
      testFileCount: summary.testFiles,
      reportPath,
    },
  };
};
