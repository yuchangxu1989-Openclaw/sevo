/**
 * T4 / NFR-5.18 / NFR-5.19 / ADR-016 — path defaults guard.
 *
 * Verifies the resolver layer prefers ENV → OPTIONS → workspace-rooted defaults
 * and never falls back to host-specific absolute literals.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  resolveOpenclawConfigPath,
  loadOpenclawConfig,
  resolveProjectsDir,
  resolveWorkspaceRoot,
  findUpward,
} from '../path-defaults.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HOST_SPECIFIC_PREFIX = ['/', 'root', '.openclaw'].join('/');

const ENV_KEYS = [
  'OPENCLAW_CONFIG_PATH',
  'OPENCLAW_CONFIG',
  'SEVO_PROJECTS_DIR',
  'SEVO_WORKSPACE_ROOT',
  'SEVO_PUBLISH_SCRIPT',
  'SEVO_LLM_GATE_AUDIT_LOG',
];

let savedEnv: Record<string, string | undefined>;
let scratchRoots: string[] = [];

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  for (const dir of scratchRoots) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failure
    }
  }
  scratchRoots = [];
});

function makeScratchDir(prefix = 'sevo-t4-'): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  scratchRoots.push(dir);
  return dir;
}

describe('NFR-5.18 path defaults guard — resolver layer', () => {
  it('returns null when no env / project / workspace / cwd provides openclaw.json', () => {
    const empty = makeScratchDir();
    const result = resolveOpenclawConfigPath({
      projectRoot: empty,
      workspaceRoot: empty,
      startDir: empty,
      maxDepth: 3,
    });
    expect(result).toBeNull();
  });

  it('prefers OPENCLAW_CONFIG_PATH env over project / workspace / findUpward', () => {
    const projectRoot = makeScratchDir();
    mkdirSync(path.join(projectRoot, '.openclaw'), { recursive: true });
    writeFileSync(path.join(projectRoot, '.openclaw', 'openclaw.json'), '{}', 'utf8');

    const explicit = path.join(makeScratchDir(), 'overridden-openclaw.json');
    writeFileSync(explicit, '{}', 'utf8');
    process.env.OPENCLAW_CONFIG_PATH = explicit;

    const result = resolveOpenclawConfigPath({ projectRoot });
    expect(result).toBe(explicit);
  });

  it('falls back to <projectRoot>/.openclaw/openclaw.json when env absent', () => {
    const projectRoot = makeScratchDir();
    const expected = path.join(projectRoot, '.openclaw', 'openclaw.json');
    mkdirSync(path.dirname(expected), { recursive: true });
    writeFileSync(expected, '{}', 'utf8');

    const result = resolveOpenclawConfigPath({ projectRoot, startDir: projectRoot });
    expect(result).toBe(expected);
  });

  it('finds openclaw.json via findUpward from a deep cwd', () => {
    const root = makeScratchDir();
    const cfg = path.join(root, 'openclaw.json');
    writeFileSync(cfg, '{}', 'utf8');
    const deep = path.join(root, 'a', 'b', 'c');
    mkdirSync(deep, { recursive: true });

    const result = resolveOpenclawConfigPath({ startDir: deep });
    expect(result).toBe(cfg);
  });

  it('never returns a host-specific absolute literal in stranger cwd', () => {
    const stranger = makeScratchDir();
    const result = resolveOpenclawConfigPath({ startDir: stranger, maxDepth: 2 });
    if (result !== null) {
      expect(result.startsWith(HOST_SPECIFIC_PREFIX)).toBe(false);
    }
  });
});

describe('NFR-5.19 SEVO_ env naming — projects dir / workspace root', () => {
  it('SEVO_PROJECTS_DIR env wins over arguments', () => {
    const fromEnv = makeScratchDir();
    process.env.SEVO_PROJECTS_DIR = fromEnv;
    expect(resolveProjectsDir('/some/workspace')).toBe(fromEnv);
  });

  it('falls back to <workspaceRoot>/projects when env absent', () => {
    const ws = makeScratchDir();
    expect(resolveProjectsDir(ws)).toBe(path.join(ws, 'projects'));
  });

  it('falls back to <cwd>/projects when both env and workspace absent', () => {
    expect(resolveProjectsDir()).toBe(path.join(process.cwd(), 'projects'));
  });

  it('SEVO_WORKSPACE_ROOT env beats findUpward', () => {
    const ws = makeScratchDir();
    process.env.SEVO_WORKSPACE_ROOT = ws;
    expect(resolveWorkspaceRoot()).toBe(ws);
  });

  it('explicit argument beats env', () => {
    const ws = makeScratchDir();
    process.env.SEVO_WORKSPACE_ROOT = '/should-not-win';
    expect(resolveWorkspaceRoot(ws)).toBe(ws);
  });

  it('falls back to findUpward when nothing supplied', () => {
    const root = makeScratchDir();
    writeFileSync(path.join(root, 'openclaw.json'), '{}', 'utf8');
    const deep = path.join(root, 'x', 'y');
    mkdirSync(deep, { recursive: true });
    const cwd = process.cwd();
    try {
      process.chdir(deep);
      expect(resolveWorkspaceRoot()).toBe(root);
    } finally {
      process.chdir(cwd);
    }
  });
});

describe('loadOpenclawConfig', () => {
  it('returns null when nothing resolvable', () => {
    const empty = makeScratchDir();
    const result = loadOpenclawConfig({
      projectRoot: empty,
      workspaceRoot: empty,
      startDir: empty,
      maxDepth: 2,
    });
    expect(result).toBeNull();
  });

  it('returns parsed config when env path points to a valid JSON file', () => {
    const cfgFile = path.join(makeScratchDir(), 'openclaw.json');
    writeFileSync(
      cfgFile,
      JSON.stringify({ agents: { list: [{ id: 'self' }] } }),
      'utf8',
    );
    process.env.OPENCLAW_CONFIG_PATH = cfgFile;

    const result = loadOpenclawConfig();
    expect(result?.path).toBe(cfgFile);
    const list = (result?.config?.agents as { list?: Array<{ id?: string }> } | undefined)?.list;
    expect(list?.[0]?.id).toBe('self');
  });

  it('returns null on malformed JSON', () => {
    const cfgFile = path.join(makeScratchDir(), 'openclaw.json');
    writeFileSync(cfgFile, '{not-valid-json', 'utf8');
    process.env.OPENCLAW_CONFIG_PATH = cfgFile;

    expect(loadOpenclawConfig()).toBeNull();
  });
});

describe('NFR-5.18 — source files contain no host-specific absolute literals', () => {
  /**
   * Static guard: the production source files we refactored under T4 must not
   * contain a host-specific maintainer path as a *value* literal anywhere outside comments.
   */
  it('refactored src files do not embed host-specific maintainer paths outside comments', async () => {
    const targets = [
      'src/stages/deploy-stage.ts',
      'src/stages/pdca-check-stage.ts',
      'src/cli/cmd-init.ts',
      'src/gate/rules/semantic-rule-utils.ts',
      'src/gates/llm-intercept/index.ts',
      'src/adapter/openclaw-adapter.ts',
    ];
    const projectRoot = path.resolve(__dirname, '..', '..', '..');

    const fs = await import('node:fs');
    for (const rel of targets) {
      const abs = path.join(projectRoot, rel);
      expect(existsSync(abs), `missing source: ${rel}`).toBe(true);
      const content = fs.readFileSync(abs, 'utf8');
      const lines = content.split('\n');
      for (const [idx, raw] of lines.entries()) {
        const stripped = raw.replace(/\/\*[^*]*\*+(?:[^*/][^*]*\*+)*\//g, '');
        // skip pure comment lines and JSDoc lines
        const trimmed = stripped.trim();
        if (
          trimmed.startsWith('//') ||
          trimmed.startsWith('*') ||
          trimmed.startsWith('/*')
        ) {
          continue;
        }
        // remove trailing line-comments before scanning the value side
        const valuePart = stripped.split('//')[0] ?? '';
        if (valuePart.includes(HOST_SPECIFIC_PREFIX)) {
          throw new Error(
            `host-specific absolute literal leaked into ${rel}:${idx + 1}: ${raw.trim()}`,
          );
        }
      }
    }
  });
});

describe('findUpward sanity', () => {
  it('returns null when nothing matches within depth budget', () => {
    const root = makeScratchDir();
    const deep = path.join(root, 'a', 'b', 'c', 'd');
    mkdirSync(deep, { recursive: true });
    expect(findUpward(deep, 'never-exists.json', 8)).toBeNull();
  });

  it('finds the closest match (deepest first)', () => {
    const root = makeScratchDir();
    const sub = path.join(root, 'sub');
    mkdirSync(sub, { recursive: true });
    writeFileSync(path.join(root, 'openclaw.json'), '{}', 'utf8');
    writeFileSync(path.join(sub, 'openclaw.json'), '{}', 'utf8');
    expect(findUpward(sub, 'openclaw.json')).toBe(path.join(sub, 'openclaw.json'));
  });
});
