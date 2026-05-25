/**
 * Per-stage real-output verification.
 *
 * Asserts that every one of the 14 stage handlers writes its expected
 * artifact files when given a clean tmp project. This is the test the
 * task brief calls for at src/tests/stages/<stage>.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  contractHandler,
  contractReviewGateHandler,
  deployHandler,
  endgameScanHandler,
  implementHandler,
  ledgerHandler,
  publishGeneralizationGateHandler,
  regressionHandler,
  reviewFixLoopHandler,
  reviewHandler,
  specifyHandler,
  specReviewGateHandler,
  verifyHandler,
  type StageHandlerContext,
} from '../../stage-handlers/index.js';

let workspaceRoot: string;
let projectRoot: string;

beforeEach(() => {
  workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-stage-unit-'));
  projectRoot = path.join(workspaceRoot, 'projects', 'demo');
  fs.mkdirSync(projectRoot, { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, 'package.json'),
    JSON.stringify({ name: 'demo', version: '0.1.0' }, null, 2),
  );
});

afterEach(() => {
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

function ctxOf(): StageHandlerContext {
  return {
    pipelineId: 'pipe-stage-001',
    projectSlug: 'demo',
    workspaceRoot,
    projectRoot,
    frDescription: '让用户用一句话描述功能。',
    now: () => '2026-05-24T01:00:00.000Z',
    previousResults: {},
  };
}

describe('Stage handler — specify', () => {
  it('writes product-requirements.md with 4 mandatory sections + FR/AC', async () => {
    const r = await specifyHandler(ctxOf());
    expect(r.verdict).toBe('pass');
    const md = fs.readFileSync(path.join(projectRoot, 'docs', 'product-requirements.md'), 'utf8');
    expect(md).toContain('用户人群');
    expect(md).toContain('痛点');
    expect(md).toContain('原始需求');
    expect(md).toContain('UX 流');
    expect(md).toMatch(/### FR-\d+/);
    expect(md).toMatch(/AC-\d+\.\d+/);
    const json = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'docs', 'product-requirements.json'), 'utf8'),
    );
    expect(json.functionalRequirements.length).toBeGreaterThan(0);
  });
});

describe('Stage handler — spec-review-gate', () => {
  it('passes when spec is complete', async () => {
    await specifyHandler(ctxOf());
    const r = await specReviewGateHandler(ctxOf());
    expect(r.verdict).toBe('pass');
    expect(fs.existsSync(path.join(projectRoot, 'docs', 'spec-review-gate.json'))).toBe(true);
  });

  it('blocks when 4 sections incomplete', async () => {
    fs.mkdirSync(path.join(projectRoot, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'docs', 'product-requirements.json'), '{}');
    const r = await specReviewGateHandler(ctxOf());
    expect(r.verdict).toBe('block');
    expect(r.issues.length).toBeGreaterThan(0);
  });
});

describe('Stage handler — contract test authoring', () => {
  it('emits a test file per FR as part of contract', async () => {
    await specifyHandler(ctxOf());
    const r = await contractHandler(ctxOf());
    expect(r.verdict).toBe('pass');
    const plan = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'src', 'tests', '_test-plan.json'), 'utf8'),
    );
    expect(plan.testCount).toBeGreaterThan(0);
    for (const f of plan.files) {
      expect(fs.existsSync(path.join(projectRoot, f.relPath))).toBe(true);
    }
  });
});

describe('Stage handler — contract', () => {
  it('writes one contract per FR', async () => {
    await specifyHandler(ctxOf());
    const r = await contractHandler(ctxOf());
    expect(r.verdict).toBe('pass');
    const idx = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'docs', 'contracts', '_index.json'), 'utf8'),
    );
    expect(idx.contracts.length).toBeGreaterThan(0);
    for (const c of idx.contracts) {
      expect(fs.existsSync(path.join(projectRoot, c.relPath))).toBe(true);
    }
  });
});

describe('Stage handler — contract-review-gate', () => {
  it('passes when every FR has a contract', async () => {
    await specifyHandler(ctxOf());
    await contractHandler(ctxOf());
    const r = await contractReviewGateHandler(ctxOf());
    expect(r.verdict).toBe('pass');
  });

  it('blocks when contracts missing for FRs', async () => {
    await specifyHandler(ctxOf());
    // Skip contract handler intentionally.
    const r = await contractReviewGateHandler(ctxOf());
    expect(r.verdict).toBe('block');
  });
});

describe('Stage handler — implement', () => {
  it('writes a source file per FR', async () => {
    await specifyHandler(ctxOf());
    const r = await implementHandler(ctxOf());
    expect(r.verdict).toBe('pass');
    const manifest = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'src', 'implement-manifest.json'), 'utf8'),
    );
    expect(manifest.files.length).toBeGreaterThan(0);
  });
});

describe('Stage handler — review', () => {
  it('passes when impl + tests cover every FR', async () => {
    await specifyHandler(ctxOf());
    await contractHandler(ctxOf());
    await implementHandler(ctxOf());
    const r = await reviewHandler(ctxOf());
    expect(r.verdict).toBe('pass');
  });

  it('blocks when implementation missing', async () => {
    await specifyHandler(ctxOf());
    const r = await reviewHandler(ctxOf());
    expect(r.verdict).toBe('block');
    expect(r.issues.length).toBeGreaterThan(0);
  });
});

describe('Stage handler — review-fix-loop', () => {
  it('closes loop when review is clean', async () => {
    fs.mkdirSync(path.join(projectRoot, 'docs'), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, 'docs', 'review-report.json'),
      JSON.stringify({ verdict: 'pass', findings: [] }),
    );
    const r = await reviewFixLoopHandler(ctxOf());
    expect(r.verdict).toBe('pass');
  });

  it('queues fixes when review has P0 findings', async () => {
    fs.mkdirSync(path.join(projectRoot, 'docs'), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, 'docs', 'review-report.json'),
      JSON.stringify({
        verdict: 'block',
        findings: [{ severity: 'P0', frId: 'FR-01', description: 'missing impl' }],
      }),
    );
    const r = await reviewFixLoopHandler(ctxOf());
    expect(r.verdict).toBe('block');
    expect(r.metadata?.blocking).toBe(1);
  });
});

describe('Stage handler — regression', () => {
  it('writes a regression report (verdict depends on local vitest)', async () => {
    const r = await regressionHandler(ctxOf());
    // Tmp project has no vitest deps; we accept fail and confirm artifact.
    expect(['pass', 'fail']).toContain(r.verdict);
    expect(fs.existsSync(path.join(projectRoot, 'docs', 'regression.json'))).toBe(true);
  }, 15000);
});

describe('Stage handler — publish-generalization-gate', () => {
  it('passes when project is clean', async () => {
    const r = await publishGeneralizationGateHandler(ctxOf());
    expect(r.verdict).toBe('pass');
    expect(r.metadata?.matches).toBe(0);
  });

  it('blocks when hard-coded paths are present', async () => {
    fs.mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'src', 'leak.ts'), "const x = '/root/.openclaw/leak';");
    const r = await publishGeneralizationGateHandler(ctxOf());
    expect(r.verdict).toBe('block');
  });
});

describe('Stage handler — deploy', () => {
  it('records deploy intent in dry-run mode', async () => {
    const r = await deployHandler(ctxOf());
    expect(r.verdict).toBe('pass');
    const report = JSON.parse(fs.readFileSync(path.join(projectRoot, 'docs', 'deploy.json'), 'utf8'));
    expect(report.publish.executed).toBe(false);
    expect(report.package.proposedVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('blocks when package.json missing', async () => {
    fs.unlinkSync(path.join(projectRoot, 'package.json'));
    const r = await deployHandler(ctxOf());
    expect(r.verdict).toBe('block');
  });
});

describe('Stage handler — verify', () => {
  it('passes basic checks in a clean project', async () => {
    await specifyHandler(ctxOf());
    await contractHandler(ctxOf());
    const r = await verifyHandler(ctxOf());
    expect(r.verdict).toBe('pass');
  });
});

describe('Stage handler — endgame-scan', () => {
  it('passes when every FR has impl + tests + contract', async () => {
    await specifyHandler(ctxOf());
    await contractHandler(ctxOf());
    await implementHandler(ctxOf());
    const r = await endgameScanHandler(ctxOf());
    expect(r.verdict).toBe('pass');
  });

  it('blocks when FR coverage is missing', async () => {
    fs.mkdirSync(path.join(projectRoot, 'docs'), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, 'docs', 'product-requirements.json'),
      JSON.stringify({
        functionalRequirements: [{ title: 'a', description: 'a', acceptanceCriteria: ['x'] }],
      }),
    );
    const r = await endgameScanHandler(ctxOf());
    expect(r.verdict).toBe('block');
    expect(r.metadata?.usable).toBe(0);
  });
});

describe('Stage handler — ledger', () => {
  it('aggregates whatever stage reports exist', async () => {
    await specifyHandler(ctxOf());
    await specReviewGateHandler(ctxOf());
    const r = await ledgerHandler(ctxOf());
    expect(r.verdict).toBe('pass');
    const ledger = JSON.parse(fs.readFileSync(path.join(projectRoot, 'docs', 'ledger.json'), 'utf8'));
    expect(ledger.rows.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(projectRoot, 'docs', 'ledger.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'docs', 'ledger-notice.txt'))).toBe(true);
  });
});
