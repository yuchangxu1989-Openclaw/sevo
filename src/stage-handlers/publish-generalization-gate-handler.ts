/**
 * Stage 10: publish-generalization-gate
 *
 * Scans the project tree for hard-coded paths that would break a stranger
 * trying to install the npm package on a fresh machine. Anything matching
 * the following is flagged:
 *
 *   maintainer OpenClaw workspace   — workspace-specific
 *   /home/<specific-user>/          — developer machine
 *   /Users/<specific-user>/         — macOS dev machines
 *   localhost:<port>                — only allowed in tests/dev configs
 *   ou_[a-f0-9]{32}                 — Lark openid (PII)
 *   sk-[a-zA-Z0-9]{16,}             — API keys
 *
 * Verdict:
 *   pass — zero hard-coded leaks
 *   block — at least one match outside docs/
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { StageHandler, StageHandlerResult } from './types.js';
import { ensureDir, makeArtifact, nowIso, writeFileEnsure } from './utils.js';

interface Match {
  pattern: string;
  file: string;
  line: number;
  preview: string;
}

const PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'workspace-root', re: /\/root\/\.openclaw\//g },
  { name: 'home-user', re: /\/home\/[a-z][a-z0-9_-]*\//gi },
  { name: 'macos-user', re: /\/Users\/[a-z][a-z0-9_-]*\//gi },
  { name: 'lark-openid', re: /\bou_[a-f0-9]{32,}\b/g },
  { name: 'sk-api-key', re: /\bsk-[A-Za-z0-9]{16,}\b/g },
];

const SCAN_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.yml',
  '.yaml',
  '.sh',
]);

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'tmp', '.next', '.cache']);
const SKIP_FILE_PATTERNS = [/\.test\.(ts|tsx|js)$/, /\.spec\.(ts|tsx|js)$/, /__tests__\//];

function* walk(dir: string): IterableIterator<string> {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walk(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

export const publishGeneralizationGateHandler: StageHandler = async (
  ctx,
): Promise<StageHandlerResult> => {
  const evaluatedAt = nowIso(ctx.now);
  const reportDir = path.join(ctx.projectRoot, 'docs');
  ensureDir(reportDir);

  const matches: Match[] = [];
  let scannedFiles = 0;

  for (const file of walk(ctx.projectRoot)) {
    const ext = path.extname(file);
    if (!SCAN_EXTENSIONS.has(ext)) continue;
    if (SKIP_FILE_PATTERNS.some((re) => re.test(file))) continue;
    scannedFiles++;
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (text.length > 1024 * 1024) continue; // skip files >1 MB

    for (const { name, re } of PATTERNS) {
      const localRe = new RegExp(re.source, re.flags);
      let m: RegExpExecArray | null;
      while ((m = localRe.exec(text)) !== null) {
        const before = text.slice(0, m.index);
        const line = (before.match(/\n/g) ?? []).length + 1;
        const lineStart = before.lastIndexOf('\n') + 1;
        const lineEnd = text.indexOf('\n', m.index);
        const preview = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd).trim();
        matches.push({
          pattern: name,
          file: path.relative(ctx.projectRoot, file),
          line,
          preview: preview.slice(0, 200),
        });
        if (!localRe.global) break;
      }
    }
  }

  const reportPath = path.join(reportDir, 'publish-generalization-gate.json');
  const verdict = matches.length === 0 ? 'pass' : 'block';
  const report = {
    pipelineId: ctx.pipelineId,
    projectSlug: ctx.projectSlug,
    evaluatedAt,
    verdict,
    scannedFiles,
    matches,
  };
  writeFileEnsure(reportPath, JSON.stringify(report, null, 2) + '\n');

  return {
    stageId: 'publish-generalization-gate',
    verdict,
    artifacts: [
      makeArtifact({
        id: `${ctx.pipelineId}:publish-gen-gate`,
        type: 'publish-generalization-gate',
        filePath: reportPath,
        createdAt: evaluatedAt,
        metadata: { matches: matches.length, scannedFiles, verdict },
      }),
    ],
    summary:
      verdict === 'pass'
        ? `Generalization gate passed: 0 hard-coded leaks across ${scannedFiles} files.`
        : `Generalization gate blocked: ${matches.length} hard-coded leak(s).`,
    issues: matches.slice(0, 20).map((m) => `${m.pattern} ${m.file}:${m.line} — ${m.preview}`),
    metadata: { matches: matches.length, scannedFiles, reportPath },
  };
};
