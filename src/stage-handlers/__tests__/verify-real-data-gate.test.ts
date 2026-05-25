import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { VerifyWithRealDataGate } from '../../stages/verify-real-data-gate.js';
import type { StageHandlerContext } from '../types.js';

function makeCtx(projectRoot: string): StageHandlerContext {
  return {
    pipelineId: 'pipe-test-001',
    projectSlug: 'test-project',
    workspaceRoot: projectRoot,
    projectRoot,
    now: () => '2026-05-25T00:00:00.000Z',
  };
}

describe('VerifyWithRealDataGate', () => {
  it('fails when no materials directory exists', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sevo-vrd-'));
    mkdirSync(join(root, 'docs'), { recursive: true });

    const gate = new VerifyWithRealDataGate({ materialDir: join(root, 'nonexistent') });
    const report = await gate.execute(makeCtx(root));

    expect(report.pass).toBe(false);
    expect(report.totalMaterials).toBe(0);
    expect(report.reportPath).toBeDefined();
    expect(existsSync(report.reportPath!)).toBe(true);
  });

  it('passes when enough materials are processable (deterministic mode)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sevo-vrd-'));
    const materialDir = join(root, 'materials');
    mkdirSync(materialDir, { recursive: true });

    // Create 5 materials with enough content
    for (let i = 1; i <= 5; i++) {
      writeFileSync(
        join(materialDir, `material-${i}.md`),
        `# Material ${i}\n\nThis is a substantial piece of content about probability theory.\nIt covers Bayes theorem, conditional probability, and random variables.\nThe content is meaningful and can be processed by the pipeline.\n`,
      );
    }

    const gate = new VerifyWithRealDataGate({
      materialDir,
      minSuccessCount: 3,
      maxFailureRate: 0.2,
    });
    const report = await gate.execute(makeCtx(root));

    expect(report.pass).toBe(true);
    expect(report.totalMaterials).toBe(5);
    expect(report.successCount).toBe(5);
    expect(report.failureRate).toBe(0);
  });

  it('fails when too many materials are too short', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sevo-vrd-'));
    const materialDir = join(root, 'materials');
    mkdirSync(materialDir, { recursive: true });

    // Create 5 materials, 4 too short
    writeFileSync(join(materialDir, 'good.md'), 'x'.repeat(100));
    for (let i = 1; i <= 4; i++) {
      writeFileSync(join(materialDir, `short-${i}.md`), 'hi');
    }

    const gate = new VerifyWithRealDataGate({
      materialDir,
      minSuccessCount: 3,
      maxFailureRate: 0.2,
    });
    const report = await gate.execute(makeCtx(root));

    expect(report.pass).toBe(false);
    expect(report.totalMaterials).toBe(5);
    expect(report.successCount).toBe(1);
    expect(report.failureRate).toBe(0.8);
  });

  it('uses LLM when available', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sevo-vrd-'));
    const materialDir = join(root, 'materials');
    mkdirSync(materialDir, { recursive: true });

    writeFileSync(join(materialDir, 'prob.md'), 'Bayes theorem: P(A|B) = P(B|A)P(A)/P(B)');
    writeFileSync(join(materialDir, 'stats.md'), 'Central limit theorem states that sample means converge to normal distribution');
    writeFileSync(join(materialDir, 'calc.md'), 'Integration by parts: integral of u dv = uv - integral of v du');

    const ctx = makeCtx(root);
    ctx.llm = {
      async chat() {
        return '{ "processable": true, "summary": "math content", "concepts": ["probability"] }';
      },
    };

    const gate = new VerifyWithRealDataGate({
      materialDir,
      minSuccessCount: 2,
    });
    const report = await gate.execute(ctx);

    expect(report.pass).toBe(true);
    expect(report.successCount).toBe(3);
    expect(report.results.every((r) => r.output.includes('processable'))).toBe(true);
  });

  it('writes report JSON to docs/', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sevo-vrd-'));
    const materialDir = join(root, 'materials');
    mkdirSync(materialDir, { recursive: true });
    writeFileSync(join(materialDir, 'test.md'), 'x'.repeat(100));

    const gate = new VerifyWithRealDataGate({ materialDir, minSuccessCount: 1 });
    const report = await gate.execute(makeCtx(root));

    expect(report.reportPath).toContain('verify-real-data-report.json');
    const written = JSON.parse(readFileSync(report.reportPath!, 'utf8'));
    expect(written.verifiedAt).toBe('2026-05-25T00:00:00.000Z');
    expect(written.totalMaterials).toBe(1);
  });
});
