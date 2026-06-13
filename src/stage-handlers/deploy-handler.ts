/**
 * Stage 11: deploy
 *
 * Pure orchestration recorder. Real publish (npm/GitHub/independent repo)
 * always happens through workspace/scripts/publish-release.sh because
 * that script handles cross-platform sync. This stage:
 *
 *   1. Verifies package.json and version exist.
 *   2. Records deploy intent + computed bump in docs/deploy.json.
 *   3. Optionally invokes the publish script when ctx.metadata.executeDeploy
 *      is set, capturing exit code + tail of output. Default is dry-run.
 *
 * Verdict:
 *   pass — package.json valid, intent recorded
 *   block — package.json missing or version invalid
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type { StageHandler, StageHandlerResult } from './types.js';
import { ensureDir, makeArtifact, nowIso, readJsonIfExists, writeFileEnsure } from './utils.js';

interface PackageJson {
  name?: string;
  version?: string;
  bin?: string | Record<string, string>;
  files?: string[];
}

function parseVersion(v: string): { major: number; minor: number; patch: number } | null {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m || !m[1] || !m[2] || !m[3]) return null;
  return { major: parseInt(m[1], 10), minor: parseInt(m[2], 10), patch: parseInt(m[3], 10) };
}

function computeNextBump(current: string, kind: 'patch' | 'minor' | 'major'): string {
  const v = parseVersion(current);
  if (!v) return '0.0.1';
  if (kind === 'major') return `${v.major + 1}.0.0`;
  if (kind === 'minor') return `${v.major}.${v.minor + 1}.0`;
  return `${v.major}.${v.minor}.${v.patch + 1}`;
}

export const deployHandler: StageHandler = async (ctx): Promise<StageHandlerResult> => {
  const ranAt = nowIso(ctx.now);
  const docsDir = path.join(ctx.projectRoot, 'docs');
  ensureDir(docsDir);

  const pkgCandidates = [
    path.join(ctx.projectRoot, 'package.json'),
    path.join(ctx.workspaceRoot, 'package.json'),
  ];
  const pkgPath = pkgCandidates.find((candidate) => fs.existsSync(candidate)) ?? pkgCandidates[0]!;
  const pkg = readJsonIfExists<PackageJson>(pkgPath);

  const issues: string[] = [];
  if (!pkg) issues.push(`package.json not found at ${pkgPath}`);
  if (!pkg?.name) issues.push('package.json missing "name" field');
  if (!pkg?.version || !parseVersion(pkg.version)) {
    issues.push(`package.json version "${pkg?.version ?? ''}" is not a valid semver`);
  }

  const bumpKind = (ctx.previousResults?.['deploy']?.metadata?.bumpKind as
    | 'patch'
    | 'minor'
    | 'major'
    | undefined) ?? 'patch';

  const nextVersion = pkg?.version ? computeNextBump(pkg.version, bumpKind) : '0.0.1';

  // Optional real publish via workspace publish-release.sh.
  // Only runs when caller explicitly opts in, so default flow is safe.
  const executeDeploy =
    process.env.SEVO_STAGE_EXECUTE_DEPLOY === '1' ||
    process.env.SEVO_DEPLOY_EXECUTE === '1';

  const publishScriptCandidates = [
    path.join(ctx.workspaceRoot, 'scripts', 'publish-release.sh'),
    path.join(ctx.workspaceRoot, '..', 'scripts', 'publish-release.sh'),
  ];
  const publishScript = publishScriptCandidates.find((p) => fs.existsSync(p));

  let publishResult: {
    executed: boolean;
    script?: string;
    exitCode?: number;
    stdoutTail?: string;
    stderrTail?: string;
  } = { executed: false };

  if (issues.length === 0 && executeDeploy && publishScript) {
    const child = spawnSync('bash', [publishScript, ctx.projectSlug, bumpKind], {
      cwd: ctx.workspaceRoot,
      env: process.env,
      encoding: 'utf-8',
      timeout: 120_000,
    });
    publishResult = {
      executed: true,
      script: publishScript,
      exitCode: child.status ?? -1,
      stdoutTail: ((child.stdout as unknown as string) ?? '').slice(-4096),
      stderrTail: ((child.stderr as unknown as string) ?? '').slice(-4096),
    };
    if (publishResult.exitCode !== 0) {
      issues.push(`publish-release.sh exited with ${publishResult.exitCode}`);
    }
  }

  const verdict = issues.length === 0 ? 'pass' : 'block';

  const reportPath = path.join(docsDir, 'deploy.json');
  const report = {
    pipelineId: ctx.pipelineId,
    projectSlug: ctx.projectSlug,
    ranAt,
    verdict,
    package: {
      name: pkg?.name ?? null,
      currentVersion: pkg?.version ?? null,
      proposedVersion: nextVersion,
      bumpKind,
    },
    publish: publishResult,
    issues,
  };
  writeFileEnsure(reportPath, JSON.stringify(report, null, 2) + '\n');

  return {
    stageId: 'deploy',
    verdict,
    artifacts: [
      makeArtifact({
        id: `${ctx.pipelineId}:deploy`,
        type: 'deploy-report',
        filePath: reportPath,
        createdAt: ranAt,
        metadata: {
          verdict,
          executed: publishResult.executed,
          currentVersion: pkg?.version,
          proposedVersion: nextVersion,
        },
      }),
    ],
    summary:
      verdict === 'pass'
        ? publishResult.executed
          ? `Deploy executed: ${pkg?.name}@${nextVersion} (exit ${publishResult.exitCode}).`
          : `Deploy intent recorded: ${pkg?.name} ${pkg?.version} -> ${nextVersion} (dry-run).`
        : `Deploy needs fix: ${issues.length} issue(s).`,
    issues,
    metadata: {
      proposedVersion: nextVersion,
      bumpKind,
      executed: publishResult.executed,
      reportPath,
    },
  };
};
