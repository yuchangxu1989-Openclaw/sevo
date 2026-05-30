import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { UxAcceptanceStage } from '../stages/ux-acceptance-stage.js';
import { CommercialAcceptanceStage } from '../stages/commercial-acceptance-stage.js';
import type { UxAcceptanceStageInput, UxAcceptanceStageOptions } from '../stages/ux-acceptance-types.js';
import type { CommercialAcceptanceStageInput, CommercialAcceptanceStageOptions } from '../stages/commercial-acceptance-types.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-acceptance-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── UxAcceptanceStage ──────────────────────────────────────────

describe('UxAcceptanceStage', () => {
  it('has correct stageId', () => {
    const stage = new UxAcceptanceStage({ adapter: {} });
    expect(stage.stageId).toBe('ux-acceptance-authoring');
  });

  it('skips checks when no adapter provided', async () => {
    const stage = new UxAcceptanceStage({
      adapter: {},
      now: () => '2026-04-28T00:00:00Z',
    });

    const input: UxAcceptanceStageInput = {
      taskId: 'task-001',
      targets: [
        { id: 'ux-01', description: 'Zero-config install', category: 'install' },
        { id: 'ux-02', description: 'First run experience', category: 'first-run' },
      ],
      artifactBasePath: tmpDir,
    };

    const output = await stage.execute(input);
    expect(output.checklist.checks).toHaveLength(2);
    expect(output.checklist.checks.every((c) => c.status === 'skip')).toBe(true);
    expect(output.metadata.authorRole).toBe('ux');
    expect(output.metadata.skipped).toBe(2);
    expect(output.artifact.type).toBe('ux-acceptance-checklist');
  });

  it('runs checks via adapter', async () => {
    const options: UxAcceptanceStageOptions = {
      adapter: {
        runUxCheck: async (req) => ({
          status: req.target.category === 'install' ? 'pass' : 'fail',
          detail: `Checked ${req.target.id}`,
        }),
      },
      now: () => '2026-04-28T00:00:00Z',
    };

    const stage = new UxAcceptanceStage(options);
    const input: UxAcceptanceStageInput = {
      taskId: 'task-002',
      targets: [
        { id: 'ux-01', description: 'Install check', category: 'install' },
        { id: 'ux-02', description: 'Core flow', category: 'core-flow' },
      ],
      artifactBasePath: tmpDir,
    };

    const output = await stage.execute(input);
    expect(output.checklist.allPassed).toBe(false);
    expect(output.checklist.failedChecks).toHaveLength(1);
    expect(output.metadata.passed).toBe(1);
    expect(output.metadata.failed).toBe(1);
  });

  it('writes artifact to disk', async () => {
    const stage = new UxAcceptanceStage({
      adapter: {},
      now: () => '2026-04-28T00:00:00Z',
    });

    const input: UxAcceptanceStageInput = {
      taskId: 'task-003',
      targets: [{ id: 'ux-01', description: 'Test', category: 'docs' }],
      artifactBasePath: tmpDir,
    };

    const output = await stage.execute(input);
    expect(fs.existsSync(output.artifact.path)).toBe(true);
  });
});

// ── CommercialAcceptanceStage ──────────────────────────────────

describe('CommercialAcceptanceStage', () => {
  it('has correct stageId', () => {
    const stage = new CommercialAcceptanceStage({ adapter: {} });
    expect(stage.stageId).toBe('commercial-acceptance-authoring');
  });

  it('skips checks when no adapter provided', async () => {
    const stage = new CommercialAcceptanceStage({
      adapter: {},
      now: () => '2026-04-28T00:00:00Z',
    });

    const input: CommercialAcceptanceStageInput = {
      taskId: 'task-001',
      targets: [
        { id: 'com-01', description: 'npm package completeness', category: 'package' },
        { id: 'com-02', description: 'License compliance', category: 'license' },
      ],
      artifactBasePath: tmpDir,
    };

    const output = await stage.execute(input);
    expect(output.checklist.checks).toHaveLength(2);
    expect(output.checklist.checks.every((c) => c.status === 'skip')).toBe(true);
    expect(output.metadata.authorRole).toBe('product');
    expect(output.artifact.type).toBe('commercial-acceptance-checklist');
  });

  it('runs checks via adapter', async () => {
    const options: CommercialAcceptanceStageOptions = {
      adapter: {
        runCommercialCheck: async (req) => ({
          status: 'pass',
          detail: `Verified ${req.target.id}`,
        }),
      },
      now: () => '2026-04-28T00:00:00Z',
    };

    const stage = new CommercialAcceptanceStage(options);
    const input: CommercialAcceptanceStageInput = {
      taskId: 'task-002',
      targets: [
        { id: 'com-01', description: 'Package check', category: 'package' },
        { id: 'com-02', description: 'Version check', category: 'version' },
      ],
      artifactBasePath: tmpDir,
    };

    const output = await stage.execute(input);
    expect(output.checklist.allPassed).toBe(true);
    expect(output.checklist.failedChecks).toHaveLength(0);
    expect(output.metadata.passed).toBe(2);
  });

  it('writes artifact to disk', async () => {
    const stage = new CommercialAcceptanceStage({
      adapter: {},
      now: () => '2026-04-28T00:00:00Z',
    });

    const input: CommercialAcceptanceStageInput = {
      taskId: 'task-003',
      targets: [{ id: 'com-01', description: 'Test', category: 'readme' }],
      artifactBasePath: tmpDir,
    };

    const output = await stage.execute(input);
    expect(fs.existsSync(output.artifact.path)).toBe(true);
  });
});
