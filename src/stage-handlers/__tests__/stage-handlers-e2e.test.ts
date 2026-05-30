/**
 * End-to-end test for the stage handler pipeline.
 *
 * Drives every handler in order against a freshly-created tmp project,
 * asserts the right files appear on disk, and that verdicts are correct.
 * No LLM, no network — every handler must produce real output from
 * deterministic inputs.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  STAGE_HANDLERS,
  STAGE_HANDLER_ORDER,
  type StageHandlerContext,
  type StageHandlerResult,
} from '../index.js';

interface TestEnv {
  workspaceRoot: string;
  projectRoot: string;
  projectSlug: string;
  cleanup: () => void;
}

function makeEnv(): TestEnv {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-stage-e2e-'));
  const projectSlug = 'demo-project';
  const projectRoot = path.join(workspaceRoot, 'projects', projectSlug);
  fs.mkdirSync(projectRoot, { recursive: true });

  // Minimal package.json so deploy + verify don't trivially block.
  fs.writeFileSync(
    path.join(projectRoot, 'package.json'),
    JSON.stringify({ name: projectSlug, version: '0.1.0' }, null, 2),
  );

  return {
    workspaceRoot,
    projectRoot,
    projectSlug,
    cleanup: () => fs.rmSync(workspaceRoot, { recursive: true, force: true }),
  };
}

function makeCtx(env: TestEnv, prev: Partial<Record<string, StageHandlerResult>>): StageHandlerContext {
  return {
    pipelineId: 'pipe-e2e-001',
    projectSlug: env.projectSlug,
    workspaceRoot: env.workspaceRoot,
    projectRoot: env.projectRoot,
    frDescription: '让用户用一句话描述功能，SEVO 自动产出 spec 和实现骨架。',
    now: () => '2026-05-24T00:00:00.000Z',
    previousResults: prev as StageHandlerContext['previousResults'],
  };
}

describe('Stage handler pipeline — end-to-end', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = makeEnv();
  });

  afterEach(() => {
    env.cleanup();
  });

  it('runs all registered handlers in order and produces real artifacts', async () => {
    const results: Record<string, StageHandlerResult> = {};
    for (const key of STAGE_HANDLER_ORDER) {
      const ctx = makeCtx(env, results);
      const handler = STAGE_HANDLERS[key];
      const result = await handler(ctx);
      results[key] = result;
      // Every handler must emit at least one artifact file.
      expect(result.artifacts.length).toBeGreaterThan(0);
      for (const art of result.artifacts) {
        expect(fs.existsSync(art.path), `${key} artifact ${art.id} missing on disk`).toBe(true);
      }
    }

    // Stage-by-stage assertions.
    expect(results.specify!.verdict).toBe('pass');
    const specMd = fs.readFileSync(path.join(env.projectRoot, 'docs', 'product-requirements.md'), 'utf8');
    for (const heading of ['用户人群', '痛点', '原始需求', 'UX 流']) {
      expect(specMd).toContain(heading);
    }
    expect(specMd).toMatch(/### FR-\d+/);
    expect(specMd).toMatch(/AC-\d+\.\d+/);

    expect(results['spec-review-gate']!.verdict).toBe('pass');

    const testPlanPath = path.join(env.projectRoot, 'src', 'tests', '_test-plan.json');
    expect(fs.existsSync(testPlanPath)).toBe(true);
    const testPlan = JSON.parse(fs.readFileSync(testPlanPath, 'utf8'));
    expect(testPlan.frCount).toBeGreaterThan(0);
    expect(testPlan.testCount).toBeGreaterThan(0);

    const contractIdxPath = path.join(env.projectRoot, 'docs', 'contracts', '_index.json');
    expect(fs.existsSync(contractIdxPath)).toBe(true);

    expect(results['contract-review-gate']!.verdict).toBe('pass');

    const manifestPath = path.join(env.projectRoot, 'src', 'implement-manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.files.length).toBeGreaterThan(0);

    // Review should pass because every FR has impl + tests + contract.
    expect(results.review!.verdict).toBe('pass');
    expect(results['review-fix-loop']!.verdict).toBe('pass');

    // Regression may pass or fail depending on tooling; just confirm artifact.
    const regressionReport = JSON.parse(
      fs.readFileSync(path.join(env.projectRoot, 'docs', 'regression.json'), 'utf8'),
    );
    expect(regressionReport).toHaveProperty('exitCode');

    // Generalization gate against pristine project: no leaks expected.
    expect(results['publish-generalization-gate']!.verdict).toBe('pass');

    expect(results.deploy!.verdict).toBe('pass');

    // Verify CLI check is skipped because there's no bin.
    expect(results.verify!.metadata?.checks).toBeDefined();

    // Endgame scan pass when threshold met.
    expect(results['endgame-scan']!.metadata?.total).toBeGreaterThan(0);

    expect(results.ledger!.verdict).toBe('pass');
    const ledger = JSON.parse(fs.readFileSync(path.join(env.projectRoot, 'docs', 'ledger.json'), 'utf8'));
    expect(ledger.rows.length).toBeGreaterThan(0);
  }, 30000);

  it('spec-review-gate blocks when 4 sections are incomplete', async () => {
    const docs = path.join(env.projectRoot, 'docs');
    fs.mkdirSync(docs, { recursive: true });
    fs.writeFileSync(path.join(docs, 'product-requirements.md'), '# Empty\n');
    fs.writeFileSync(
      path.join(docs, 'product-requirements.json'),
      JSON.stringify({ functionalRequirements: [] }),
    );
    const ctx = makeCtx(env, {});
    const result = await STAGE_HANDLERS['spec-review-gate'](ctx);
    expect(result.verdict).toBe('block');
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('publish-generalization-gate flags hard-coded leaks', async () => {
    const srcDir = path.join(env.projectRoot, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'leaky.ts'),
      "export const path = '/root/.openclaw/workspace/leak';\n",
    );
    const ctx = makeCtx(env, {});
    const result = await STAGE_HANDLERS['publish-generalization-gate'](ctx);
    expect(result.verdict).toBe('block');
    expect(result.metadata?.matches).toBeGreaterThan(0);
  });

  it('endgame-scan blocks when FR coverage is below threshold', async () => {
    const docs = path.join(env.projectRoot, 'docs');
    fs.mkdirSync(docs, { recursive: true });
    // 2 FRs, no implementation, no tests, no contracts -> usability 0.
    fs.writeFileSync(
      path.join(docs, 'product-requirements.json'),
      JSON.stringify({
        functionalRequirements: [
          { title: 'A', description: 'A', acceptanceCriteria: ['ac'] },
          { title: 'B', description: 'B', acceptanceCriteria: ['ac'] },
        ],
      }),
    );
    const ctx = makeCtx(env, {});
    const result = await STAGE_HANDLERS['endgame-scan'](ctx);
    expect(result.verdict).toBe('block');
    expect(result.metadata?.total).toBe(2);
    expect(result.metadata?.usable).toBe(0);
  });
});
