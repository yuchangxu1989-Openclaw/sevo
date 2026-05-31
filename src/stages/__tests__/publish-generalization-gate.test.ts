import { describe, expect, it, beforeEach, vi } from 'vitest';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { CommercializationGate } from '../commercialization-gate.js';
import type { CommercializationGateInput } from '../commercialization-gate-types.js';

let tmpDir: string;
const HOME_WORKSPACE_SENTINEL = ['/', 'home', 'maintainer', 'workspace'].join('/');

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sevo-pub-gate-'));
});

function makeInput(overrides?: Partial<CommercializationGateInput>): CommercializationGateInput {
  return {
    taskId: 'pub-gate-001',
    pipelineId: 'pipe-1',
    projectRoot: tmpDir,
    publishTarget: ['npm'],
    userConfirmed: true,
    artifactBasePath: path.join(tmpDir, '.sevo', 'pub-gate-001'),
    ...overrides,
  };
}

async function setupPackageJson(fields?: Record<string, unknown>) {
  const pkg = {
    name: '@test/pkg',
    version: '1.0.0',
    description: 'Test',
    author: 'Test',
    license: 'MIT',
    main: 'dist/index.js',
    scripts: { build: 'tsc', test: 'vitest' },
    ...fields,
  };
  await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify(pkg));
}

async function setupReadme(content?: string) {
  const lines = content ?? Array.from({ length: 60 }, (_, i) => `Line ${i + 1}: This is a test README with enough content.`).join('\n');
  await fs.writeFile(path.join(tmpDir, 'README.md'), `# Test Package\n\n## Quick Start\n\nnpm install @test/pkg\n\n${lines}`);
}

async function setupLicense() {
  await fs.writeFile(path.join(tmpDir, 'LICENSE'), 'MIT License\n\nCopyright 2025');
}

async function setupTsconfig() {
  await fs.writeFile(path.join(tmpDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { outDir: 'dist', target: 'ES2022' },
  }));
}

async function setupGitignore() {
  await fs.writeFile(path.join(tmpDir, '.gitignore'), 'node_modules/\ndist/\n');
}

async function setupCleanProject() {
  await setupPackageJson();
  await setupReadme();
  await setupLicense();
  await setupTsconfig();
  await setupGitignore();
  await fs.writeFile(path.join(tmpDir, '.npmignore'), 'src/\n*.ts\n');
  // Create entry file
  await fs.mkdir(path.join(tmpDir, 'dist'), { recursive: true });
  await fs.writeFile(path.join(tmpDir, 'dist', 'index.js'), 'module.exports = {};');
}

describe('CommercializationGate (backward compat)', () => {
  it('activates only when publishTarget is configured (AC-4.32a/AC-4.32e)', () => {
    expect(CommercializationGate.shouldActivate({ publishTarget: ['npm'] })).toBe(true);
    expect(CommercializationGate.shouldActivate({ publishTarget: [] })).toBe(false);
    expect(CommercializationGate.shouldActivate({})).toBe(false);
  });

  it('skips when user declines (AC-4.32d)', async () => {
    const onSkip = vi.fn(async () => undefined);
    const gate = new CommercializationGate({ now: () => '2025-01-01T00:00:00Z' });
    const output = await gate.execute(makeInput({ userConfirmed: false, onSkip }));

    expect(output.result.skippedReason).toContain('skipped');
    expect(output.legacyResult.conclusion).toBe('skipped');
    expect(onSkip).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'pub-gate-001',
      stageId: 'publish-generalization-gate',
    }));
  });
});

describe('CommercializationGate — Five-Layer Checks (AC-4.32b)', () => {
  // ── Layer 1: Code Cleanliness ──

  it('L1: detects hardcoded paths', async () => {
    await setupCleanProject();
    const srcDir = path.join(tmpDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'config.ts'), `export const root = "${HOME_WORKSPACE_SENTINEL}";`);
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['code-cleanliness'] }));
    const check = items.find((i) => i.id === 'hardcoded-paths');
    expect(check?.status).toBe('fail');
    expect(check?.detail).toContain('src/config.ts');
  });

  it('L1: detects internal agent references', async () => {
    await setupCleanProject();
    const srcDir = path.join(tmpDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'agents.ts'), 'const agent = "dev-01";');
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['code-cleanliness'] }));
    const check = items.find((i) => i.id === 'internal-references');
    expect(check?.status).toBe('fail');
  });

  it('L1: detects debug residuals with dedicated scanners (console.log, TODO)', async () => {
    await setupCleanProject();
    const srcDir = path.join(tmpDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'debug.ts'), 'console.log("debug"); // TODO: remove');
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['code-cleanliness'] }));
    const consoleCheck = items.find((i) => i.id === 'console-log-scanner');
    const todoCheck = items.find((i) => i.id === 'todo-fixme-scanner');
    expect(consoleCheck?.status).toBe('fail');
    expect(todoCheck?.status).toBe('fail');
  });

  it('L1: detects sensitive info patterns', async () => {
    await setupCleanProject();
    const srcDir = path.join(tmpDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'secret.ts'), 'const apiKey = "sk-1234567890abcdef";');
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['code-cleanliness'] }));
    const check = items.find((i) => i.id === 'sensitive-info');
    expect(check?.status).toBe('fail');
  });

  it('L6: detects explicit error handling coverage', async () => {
    await setupCleanProject();
    const srcDir = path.join(tmpDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'io.ts'), 'async function run(p: Promise<void>) { return p.catch(() => undefined); }');
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['error-handling'] }));
    const check = items.find((i) => i.id === 'error-handling-coverage');
    expect(check?.status).toBe('pass');
  });

  it('L6: fails when no explicit error handling exists', async () => {
    await setupCleanProject();
    const srcDir = path.join(tmpDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'io.ts'), 'export async function run() { return true; }');
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['error-handling'] }));
    const check = items.find((i) => i.id === 'error-handling-coverage');
    expect(check?.status).toBe('fail');
  });

  it('L1: warns on hardcoded config values', async () => {
    await setupCleanProject();
    const srcDir = path.join(tmpDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'config-externalized.ts'), 'export const callback = "http://localhost:3000/callback";');
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['code-cleanliness'] }));
    const check = items.find((i) => i.id === 'config-externalization-checker');
    expect(check?.status).toBe('warn');
  });

  it('L1: checks dependency completeness', async () => {
    await setupCleanProject();
    const srcDir = path.join(tmpDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'app.ts'), 'import express from "express";');
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['code-cleanliness'] }));
    const check = items.find((i) => i.id === 'dependency-completeness');
    expect(check?.status).toBe('fail');
    expect(check?.detail).toContain('express');
  });

  // ── Layer 2: Package Integrity ──

  it('L2: fails when package.json missing required fields', async () => {
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({ name: '@test/pkg' }));
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['package-integrity'] }));
    const check = items.find((i) => i.id === 'package-json-fields');
    expect(check?.status).toBe('fail');
    expect(check?.detail).toContain('version');
  });

  it('L2: checks entry file existence', async () => {
    await setupPackageJson({ main: 'dist/index.js' });
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['package-integrity'] }));
    const check = items.find((i) => i.id === 'entry-file-exists');
    expect(check?.status).toBe('warn'); // dist/index.js doesn't exist yet
  });

  it('L2: checks tsconfig.json existence', async () => {
    await setupPackageJson();
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['package-integrity'] }));
    const tscCheck = items.find((i) => i.id === 'tsconfig-exists');
    expect(tscCheck?.status).toBe('warn'); // no tsconfig
  });

  it('L2: checks .gitignore for build output', async () => {
    await setupPackageJson();
    await setupGitignore();
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['package-integrity'] }));
    const check = items.find((i) => i.id === 'gitignore-build-output');
    expect(check?.status).toBe('pass');
  });

  it('L2: checks npm package files config', async () => {
    await setupPackageJson({ files: ['dist/'] });
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['package-integrity'] }));
    const check = items.find((i) => i.id === 'npm-package-files');
    expect(check?.status).toBe('pass');
  });

  it('L2: fails on wildcard or latest dependency versions', async () => {
    await setupPackageJson({
      dependencies: { bad: '*', ok: '^1.0.0' },
      devDependencies: { unstable: 'latest' },
    });
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['package-integrity'] }));
    const check = items.find((i) => i.id === 'dependency-version-safety');
    expect(check?.status).toBe('fail');
    expect(check?.detail).toContain('dependencies.bad@*');
    expect(check?.detail).toContain('devDependencies.unstable@latest');
  });

  it('L2: passes on explicit dependency versions', async () => {
    await setupPackageJson({
      dependencies: { ok: '^1.0.0' },
      devDependencies: { test: '~2.0.0' },
    });
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['package-integrity'] }));
    const check = items.find((i) => i.id === 'dependency-version-safety');
    expect(check?.status).toBe('pass');
  });

  // ── Layer 3: Documentation ──

  it('L3: fails when README.md missing', async () => {
    await setupPackageJson();
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['documentation'] }));
    const check = items.find((i) => i.id === 'documentation-quality');
    expect(check?.status).toBe('fail');
  });

  it('L3: checks README quick start section', async () => {
    await setupReadme();
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['documentation'] }));
    const check = items.find((i) => i.id === 'readme-quick-start');
    expect(check?.status).toBe('pass');
  });

  it('L3: fails when LICENSE missing', async () => {
    await setupPackageJson();
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['documentation'] }));
    const check = items.find((i) => i.id === 'license-exists');
    expect(check?.status).toBe('fail');
  });

  it('L3: warns when CHANGELOG.md missing', async () => {
    await setupPackageJson();
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['documentation'] }));
    const check = items.find((i) => i.id === 'changelog-exists');
    expect(check?.status).toBe('fail');
  });

  // ── Layer 4: Buildability ──

  it('L4: checks build script presence', async () => {
    await setupPackageJson({ scripts: { build: 'tsc', test: 'vitest' } });
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['buildability'] }));
    const check = items.find((i) => i.id === 'build-script');
    expect(check?.status).toBe('pass');
  });

  it('L4: checks test script presence', async () => {
    await setupPackageJson({ scripts: {} });
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['buildability'] }));
    const check = items.find((i) => i.id === 'test-script');
    expect(check?.status).toBe('warn');
  });

  it('L4: checks tsconfig outDir', async () => {
    await setupTsconfig();
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['buildability'] }));
    const check = items.find((i) => i.id === 'tsconfig-outdir');
    expect(check?.status).toBe('pass');
  });

  // ── Layer 5: Out-of-Box ──

  it('L5: skips bin check for non-CLI projects', async () => {
    await setupPackageJson();
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['out-of-box'], isCli: false }));
    const check = items.find((i) => i.id === 'bin-field');
    expect(check?.status).toBe('skip');
  });

  it('L5: fails bin check for CLI projects without bin', async () => {
    await setupPackageJson();
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['out-of-box'], isCli: true }));
    const check = items.find((i) => i.id === 'bin-field');
    expect(check?.status).toBe('fail');
  });

  it('L5: checks npm install guide in README', async () => {
    await setupReadme();
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['out-of-box'] }));
    const check = items.find((i) => i.id === 'npm-install-guide');
    expect(check?.status).toBe('pass');
  });

  // ── Layer 3: New check — Config Documentation (#13) ──

  it('L3: warns when README lacks configuration docs (#13)', async () => {
    await setupPackageJson();
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# Test\n\nJust a basic readme with no setup info.');
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['documentation'] }));
    const check = items.find((i) => i.id === 'config-documentation');
    expect(check?.status).toBe('warn');
  });

  it('L3: passes when README mentions configuration (#13)', async () => {
    await setupPackageJson();
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# Test\n\n## Configuration\n\nSet ENV vars.');
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['documentation'] }));
    const check = items.find((i) => i.id === 'config-documentation');
    expect(check?.status).toBe('pass');
  });

  it('L3: fails when public API is not documented (#13)', async () => {
    await setupPackageJson();
    await setupReadme('## Quick Start\n\nnpm install @test/pkg\n\n## Configuration\n\nSet env vars.');
    await setupLicense();
    await fs.writeFile(path.join(tmpDir, 'CHANGELOG.md'), '# Changelog\n\n## 1.0.0\n- Initial release.\n');
    await fs.mkdir(path.join(tmpDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'src', 'index.ts'), 'export function missingFromDocs() { return true; }');
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['documentation'] }));
    const check = items.find((i) => i.id === 'documentation-quality');
    expect(check?.status).toBe('fail');
    expect(check?.detail).toContain('missingFromDocs');
  });

  // ── Layer 4: New check — CLI Help Entry (#18) ──

  it('L4: skips cli-help-entry when no bin field (#18)', async () => {
    await setupPackageJson();
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['buildability'] }));
    const check = items.find((i) => i.id === 'cli-help-entry');
    expect(check?.status).toBe('skip');
  });

  it('L4: warns when bin file does not exist (#18)', async () => {
    await setupPackageJson({ bin: { mycli: 'dist/cli.js' } });
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['buildability'] }));
    const check = items.find((i) => i.id === 'cli-help-entry');
    expect(check?.status).toBe('warn');
    expect(check?.detail).toContain('dist/cli.js');
    expect(check?.requiresExternalVerification).toBe(true);
  });

  it('L4: passes when bin file exists (#18)', async () => {
    await setupPackageJson({ bin: { mycli: 'dist/cli.js' } });
    await fs.mkdir(path.join(tmpDir, 'dist'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, 'dist', 'cli.js'), '#!/usr/bin/env node\nconsole.log("hello")');
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['buildability'] }));
    const check = items.find((i) => i.id === 'cli-help-entry');
    expect(check?.status).toBe('pass');
  });

  // ── Layer 4: requiresExternalVerification (P1-3) ──

  it('L4: build-script and test-script have requiresExternalVerification flag (P1-3)', async () => {
    await setupPackageJson({ scripts: { build: 'tsc', test: 'vitest' } });
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['buildability'] }));
    const buildCheck = items.find((i) => i.id === 'build-script');
    const testCheck = items.find((i) => i.id === 'test-script');
    expect(buildCheck?.requiresExternalVerification).toBe(true);
    expect(testCheck?.requiresExternalVerification).toBe(true);
  });

  // ── Layer 6: Error handling (#FR-08a-FIX) ──

  it('L6: passes when async functions have visible error handling', async () => {
    await setupCleanProject();
    const srcDir = path.join(tmpDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'io.ts'), 'export async function run() { try { return true; } catch { return false; } }');
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['error-handling'] }));
    const check = items.find((i) => i.id === 'error-handling-coverage');
    expect(check?.status).toBe('pass');
  });

  it('L6: fails when async error handling coverage is too low', async () => {
    await setupCleanProject();
    const srcDir = path.join(tmpDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'io.ts'), 'export async function run() { return true; }');
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['error-handling'] }));
    const check = items.find((i) => i.id === 'error-handling-coverage');
    expect(check?.status).toBe('fail');
  });

  // ── Layer 5: New check — First Use Examples (#20) ──

  it('L5: warns when README has no code blocks (#20)', async () => {
    await setupPackageJson();
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# Test\n\nNo code examples here.');
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['out-of-box'] }));
    const check = items.find((i) => i.id === 'first-use-examples');
    expect(check?.status).toBe('warn');
  });

  it('L5: passes when README has code blocks (#20)', async () => {
    await setupPackageJson();
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# Test\n\n```bash\nnpm install pkg\n```\n');
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['out-of-box'] }));
    const check = items.find((i) => i.id === 'first-use-examples');
    expect(check?.status).toBe('pass');
  });

  // ── Layer 5: New check — External Dependency Guide (#21) ──

  it('L5: skips external-dependency-guide when no peerDependencies (#21)', async () => {
    await setupPackageJson();
    await setupReadme();
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['out-of-box'] }));
    const check = items.find((i) => i.id === 'external-dependency-guide');
    expect(check?.status).toBe('skip');
  });

  it('L5: warns when peerDependencies not mentioned in README (#21)', async () => {
    await setupPackageJson({ peerDependencies: { react: '>=18' } });
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# Test\n\nNo mention of peer deps.');
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['out-of-box'] }));
    const check = items.find((i) => i.id === 'external-dependency-guide');
    expect(check?.status).toBe('warn');
    expect(check?.detail).toContain('react');
  });

  it('L5: passes when peerDependencies are documented in README (#21)', async () => {
    await setupPackageJson({ peerDependencies: { react: '>=18' } });
    await fs.writeFile(path.join(tmpDir, 'README.md'), '# Test\n\nRequires react >= 18.');
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['out-of-box'] }));
    const check = items.find((i) => i.id === 'external-dependency-guide');
    expect(check?.status).toBe('pass');
  });

  // ── P1-2: execute() forces full layers ──

  it('execute() runs all layers even when input.layers is set (AC-4.32b / P1-2)', async () => {
    await setupCleanProject();
    const gate = new CommercializationGate();
    // Pass layers=['documentation'] but execute() should ignore it and run all
    const output = await gate.execute(makeInput({ layers: ['documentation'] }));
    const allItems = Object.values(output.result.layers).flat();
    expect(allItems.length).toBe(27);
    // All 6 layers should have items
    for (const layer of ['code-cleanliness', 'package-integrity', 'documentation', 'error-handling', 'buildability', 'out-of-box'] as const) {
      expect(output.result.layers[layer].length).toBeGreaterThan(0);
    }
  });

  // ── Integration ──

  it('runs all 27 checks across 6 layers (AC-4.32b)', async () => {
    await setupCleanProject();
    const gate = new CommercializationGate();
    const output = await gate.execute(makeInput());
    const allItems = Object.values(output.result.layers).flat();
    expect(allItems.length).toBe(27);
    expect(output.result.summary.totalChecks).toBe(27);
    // Verify all 6 layers present
    expect(Object.keys(output.result.layers)).toEqual(
      expect.arrayContaining(['code-cleanliness', 'package-integrity', 'documentation', 'error-handling', 'buildability', 'out-of-box']),
    );
  });

  it('provides failure details and suggestions (AC-4.32c)', async () => {
    await fs.writeFile(path.join(tmpDir, 'package.json'), JSON.stringify({ name: '@test/pkg' }));
    const gate = new CommercializationGate();
    const output = await gate.execute(makeInput());
    const failedItems = Object.values(output.result.layers).flat().filter((i) => i.status === 'fail');
    expect(failedItems.length).toBeGreaterThan(0);
    for (const item of failedItems) {
      expect(item.detail).toBeTruthy();
      expect(item.suggestion).toBeTruthy();
    }
  });

  it('supports incremental re-run of specific layers (AC-4.32k)', async () => {
    await setupCleanProject();
    const gate = new CommercializationGate();
    const items = gate.runAllChecks(makeInput({ layers: ['documentation'] }));
    expect(items.every((i) => i.layer === 'documentation')).toBe(true);
    expect(items.length).toBe(5);
  });

  it('writes artifact to disk', async () => {
    await setupCleanProject();
    const gate = new CommercializationGate({ now: () => '2025-01-01T00:00:00Z' });
    const output = await gate.execute(makeInput());
    expect(output.artifact.path).toContain('commercialization-gate.json');
    const raw = await fs.readFile(output.artifact.path, 'utf-8');
    const data = JSON.parse(raw) as { result: { passed: boolean } };
    expect(typeof data.result.passed).toBe('boolean');
  });

  it('provides legacy result for backward compatibility', async () => {
    await setupCleanProject();
    const gate = new CommercializationGate();
    const output = await gate.execute(makeInput());
    expect(output.legacyResult).toBeDefined();
    expect(['passed', 'blocked', 'skipped']).toContain(output.legacyResult.conclusion);
    expect(Array.isArray(output.legacyResult.checks)).toBe(true);
  });
});
