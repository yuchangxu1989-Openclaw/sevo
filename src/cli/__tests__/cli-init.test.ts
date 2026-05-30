/**
 * sevo init tests — onboarding + environment detection (FR-14 / FR-16).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  detectHostAdapter,
  detectProjectProfile,
  generateSevoConfigTemplate,
  inspectEnvironment,
  inspectBinary,
} from '../cmd-init.js';
import { mergeConfig } from '../../config.js';

describe('sevo init environment detection', () => {
  let tmpDir: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-init-'));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects standalone host by default', () => {
    delete process.env.OPENCLAW_SESSION_ID;
    delete process.env.OPENCLAW_WORKSPACE;
    expect(detectHostAdapter(tmpDir)).toBe('standalone');
  });

  it('detects openclaw host from environment marker', () => {
    process.env.OPENCLAW_SESSION_ID = 'sess-123';
    expect(detectHostAdapter(tmpDir)).toBe('openclaw');
  });

  it('detects monorepo project with existing CI', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        name: 'mono',
        private: true,
        workspaces: ['packages/*'],
        packageManager: 'pnpm@9.0.0',
      }),
    );
    fs.mkdirSync(path.join(tmpDir, '.github', 'workflows'), { recursive: true });

    const profile = detectProjectProfile(tmpDir);
    expect(profile.kind).toBe('monorepo');
    expect(profile.packageManager).toBe('pnpm');
    expect(profile.hasCi).toBe(true);
    expect(profile.ciProviders).toContain('GitHub Actions');
  });

  it('detects single-package project from package.json', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ name: 'single', packageManager: 'npm@10.0.0' }),
    );

    const profile = detectProjectProfile(tmpDir);
    expect(profile.kind).toBe('single-package');
    expect(profile.packageManager).toBe('npm');
    expect(profile.hasPackageJson).toBe(true);
  });

  it('inspects environment with node, npm, git, and vitest checks', () => {
    const inspection = inspectEnvironment(tmpDir, 'standalone');
    expect(inspection.adapter).toBe('standalone');
    expect(inspection.tools.map((tool) => tool.name)).toEqual(['node', 'npm', 'git', 'vitest']);
    expect(inspection.tools.find((tool) => tool.name === 'node')?.version).toMatch(/^v/);
    expect(inspection.tools.find((tool) => tool.name === 'vitest')?.ok).toBe(false);
    expect(inspection.tools.find((tool) => tool.name === 'vitest')?.message).toMatch(/npm install --save-dev vitest/);
    expect(inspection.project.kind).toBe('generic');
  });

  it('reports vitest as ok when node_modules/.bin/vitest exists', () => {
    fs.mkdirSync(path.join(tmpDir, 'node_modules', '.bin'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'node_modules', '.bin', 'vitest'), '#!/usr/bin/env node\n');
    const inspection = inspectEnvironment(tmpDir, 'standalone');
    expect(inspection.tools.find((tool) => tool.name === 'vitest')?.ok).toBe(true);
  });

  it('reports missing command from inspectBinary', () => {
    const result = inspectBinary('definitely-not-a-real-binary-sevo');
    expect(result.ok).toBe(false);
    expect(result.version).toBe('not found');
  });

  it('generates sevo.config.ts template with detected metadata', () => {
    const config = mergeConfig({
      projectName: 'demo-project',
      adapter: 'standalone',
    });
    const inspection = inspectEnvironment(tmpDir, 'standalone');
    const template = generateSevoConfigTemplate('demo-project', config, inspection);

    expect(template).toContain('export default');
    expect(template).toContain('demo-project');
    expect(template).toContain('Host adapter: standalone');
    expect(template).toContain('Runtime config lives in sevo.json');
  });

  it('init command defaults adapter option to undefined for auto-detection', async () => {
    const { createProgram } = await import('../index.js');
    const program = createProgram();
    const init = program.commands.find((c) => c.name() === 'init');
    const adapterOption = init?.options.find((o) => o.long === '--adapter');
    expect(adapterOption?.defaultValue).toBeUndefined();
  });

  it('runs init and creates both sevo.json and sevo.config.ts', async () => {
    const { createProgram } = await import('../index.js');
    const originalCwd = process.cwd();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      process.chdir(tmpDir);
      const program = createProgram();
      program.exitOverride();
      await program.parseAsync(['node', 'sevo', 'init', '--name', 'hello-sevo']);

      expect(fs.existsSync(path.join(tmpDir, 'sevo.json'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'sevo.config.ts'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'projects', 'example-todo-app', 'project.json'))).toBe(true);
      expect(logSpy.mock.calls.flat().join('\n')).toContain('First-run guide');
    } finally {
      process.chdir(originalCwd);
      logSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
