/**
 * Project directory initializer (spec §3.6, FR-12 step 5).
 *
 * Creates or completes the standard project directory structure.
 * Existing files/dirs are never overwritten (AC-4.60).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { DirectoryInitResult } from '../types/index.js';

// ── Standard structure (spec §3.6) ──────────────────────────────

const STANDARD_DIRS: readonly string[] = [
  'docs',
  'docs/architecture',
  'docs/architecture/decisions',
  'docs/test-cases',
  'src',
  'tests',
  'skill',
  'reports',
  'artifacts',
];

/** Placeholder files — key is relative path, value is a template function. */
const STANDARD_FILES: ReadonlyArray<{
  rel: string;
  content: (slug: string) => string;
}> = [
  { rel: 'README.md', content: (s) => `# ${s}\n` },
  { rel: 'LICENSE', content: () => '' },
  {
    rel: 'package.json',
    content: (s) =>
      JSON.stringify({ name: s, version: '0.0.0', private: true }, null, 2) + '\n',
  },
  {
    rel: 'tsconfig.json',
    content: () =>
      JSON.stringify({ compilerOptions: { strict: true } }, null, 2) + '\n',
  },
  { rel: 'docs/product-requirements.md', content: () => '# Product Requirements\n' },
  {
    rel: 'docs/architecture/arc42-architecture.md',
    content: () => '# Architecture\n',
  },
];

// ── Public API ──────────────────────────────────────────────────

/**
 * Ensure the project directory matches the §3.6 standard structure.
 *
 * - Missing directories are created.
 * - Missing placeholder files are created.
 * - Existing directories and files are left untouched (AC-4.60).
 */
export function initProjectDirectory(
  workspaceRoot: string,
  projectSlug: string,
): DirectoryInitResult {
  const projectRoot = path.join(workspaceRoot, 'projects', projectSlug);

  const createdDirs: string[] = [];
  const existingDirs: string[] = [];
  const createdFiles: string[] = [];
  const existingFiles: string[] = [];

  // Ensure project root exists
  fs.mkdirSync(projectRoot, { recursive: true });

  // Directories
  for (const dir of STANDARD_DIRS) {
    const full = path.join(projectRoot, dir);
    if (fs.existsSync(full)) {
      existingDirs.push(dir);
    } else {
      fs.mkdirSync(full, { recursive: true });
      createdDirs.push(dir);
    }
  }

  // Placeholder files
  for (const { rel, content } of STANDARD_FILES) {
    const full = path.join(projectRoot, rel);
    if (fs.existsSync(full)) {
      existingFiles.push(rel);
    } else {
      // Parent dir should already exist from the dirs step, but be safe
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content(projectSlug), 'utf-8');
      createdFiles.push(rel);
    }
  }

  return {
    projectRoot,
    createdDirs,
    existingDirs,
    createdFiles,
    existingFiles,
    complete: true,
  };
}
