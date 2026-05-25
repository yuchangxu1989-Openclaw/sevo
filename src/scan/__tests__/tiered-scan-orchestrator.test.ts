import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { TieredScanOrchestrator } from '../tiered-scan-orchestrator.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'sevo-tiered-'));
  const source = join(root, 'src');
  mkdirSync(source, { recursive: true });
  const spec = join(root, 'spec.md');
  writeFileSync(spec, '### FR-29 Tiered Endgame Gap Scan\n\n- AC-29.7：L2 report contains structured coverage entries.\n');
  writeFileSync(join(source, 'fr-29-scan.ts'), 'export const scan = true;\n');
  return { root, source, spec };
}

describe('TieredScanOrchestrator', () => {
  it('combines L1/L2/L3 into one blocking summary', async () => {
    const { root, source, spec } = fixture();
    const report = await new TieredScanOrchestrator().run({
      l1: {
        specPath: spec,
        sourceDir: source,
        compileCommand: { command: 'node -e "process.exit(0)"', cwd: root },
        testCommand: { command: 'node -e "process.exit(0)"', cwd: root },
        writeReport: false,
      },
      l2: {
        specPath: spec,
        sourceDir: source,
        llmClient: {
          async chat(messages: Array<{ role: string; content: string }>) {
            const content = messages.find((m) => m.role === 'user')?.content ?? '';
            if (content.includes('Classify')) {
              return JSON.stringify([{ acId: 'AC-29.7', status: 'uncovered', files: [], rationale: 'missing test' }]);
            }
            return JSON.stringify([{ acId: 'AC-29.7', status: 'uncovered', confidence: 0.9, file: '', lineStart: 1, lineEnd: 1, rationale: 'missing test' }]);
          },
        },
        writeReport: false,
      },
      l3: {
        projectType: 'cli',
        projectRoot: root,
        llmClient: { async chat() { return '{"meaningful":true,"judgment":"useful"}'; } },
        writeReport: false,
        checks: [{ domain: 'cli-core', command: 'node -e "console.log(\'value\')"' }],
      },
    }, { scanner: 'filename' });

    expect(report.summary.l1.pass).toBe(true);
    expect(report.summary.l2.pass).toBe(false);
    expect(report.summary.l3.pass).toBe(true);
    expect(report.summary.overall).toBe('fail');
    expect(report.summary.blockers.some((blocker) => blocker.includes('L2'))).toBe(true);
  });

  it('writes L1, L2, L3, and summary reports as the three-layer ledger artifact', async () => {
    const { root, source, spec } = fixture();
    const outputPath = join(root, 'docs', 'gap-scan-summary.json');
    mkdirSync(join(root, 'docs'), { recursive: true });

    const report = await new TieredScanOrchestrator().run({
      outputPath,
      l1: {
        specPath: spec,
        sourceDir: source,
        outputPath: join(root, 'docs', 'gap-scan-l1.json'),
        compileCommand: { command: 'node -e "process.exit(0)"', cwd: root },
        testCommand: { command: 'node -e "process.exit(0)"', cwd: root },
      },
      l2: {
        specPath: spec,
        sourceDir: source,
        outputPath: join(root, 'docs', 'gap-scan-l2.json'),
        logPath: join(root, 'docs', 'gap-scan-l2-log.json'),
        llmClient: {
          async chat(messages: Array<{ role: string; content: string }>) {
            const content = messages.find((m) => m.role === 'user')?.content ?? '';
            if (content.includes('Classify')) {
              return JSON.stringify([{ acId: 'AC-29.7', status: 'covered', files: ['src/fr-29-scan.ts'], rationale: 'scan export implements report' }]);
            }
            return '[]';
          },
        },
      },
      l3: {
        projectType: 'cli',
        projectRoot: root,
        outputPath: join(root, 'docs', 'gap-scan-l3.json'),
        llmClient: { async chat() { return '{"meaningful":true,"judgment":"useful"}'; } },
        checks: [{ domain: 'cli-core', command: 'node -e "console.log(JSON.stringify({value: true}))"' }],
      },
    }, { scanner: 'filename' });

    expect(report.summary.overall).toBe('pass');
    for (const name of ['gap-scan-l1.json', 'gap-scan-l2.json', 'gap-scan-l2-log.json', 'gap-scan-l3.json', 'gap-scan-summary.json']) {
      expect(existsSync(join(root, 'docs', name))).toBe(true);
    }

    const summary = JSON.parse(readFileSync(outputPath, 'utf8'));
    expect(summary.summary).toMatchObject({
      l1: { pass: true, total: 1, covered: 1 },
      l2: { pass: true, total: 1, covered: 1, needsReview: 0 },
      l3: { pass: true, total: 1, alive: 1 },
      overall: 'pass',
    });
  });
});
