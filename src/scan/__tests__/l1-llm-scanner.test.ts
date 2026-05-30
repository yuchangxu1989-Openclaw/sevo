import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { L1LlmScanner } from '../l1-llm-scanner.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'sevo-llm-scan-'));
  const source = join(root, 'src');
  mkdirSync(source, { recursive: true });
  const spec = join(root, 'spec.md');
  writeFileSync(spec, [
    '### FR-01 Pipeline Engine',
    '',
    '- AC-01.1：Pipeline can be created and started.',
    '',
    '### FR-02 Gate System',
    '',
    '- AC-02.1：Gates block on failure.',
    '',
  ].join('\n'));
  writeFileSync(join(source, 'pipeline-engine.ts'), 'export class PipelineEngine { start() {} }');
  writeFileSync(join(source, 'gate-system.ts'), 'export class GateSystem { evaluate() {} }');
  return { root, source, spec };
}

describe('L1LlmScanner', () => {
  it('uses pre-generated sevo.scan.json when available', async () => {
    const { root, source, spec } = fixture();

    // Write a pre-generated mapping
    writeFileSync(join(root, 'sevo.scan.json'), JSON.stringify({
      version: 1,
      generatedAt: '2026-05-25T00:00:00Z',
      generatedBy: 'test',
      frFileMap: {
        'FR-01': { files: ['src/pipeline-engine.ts'], confidence: 0.95, rationale: 'engine' },
        'FR-02': { files: ['src/gate-system.ts'], confidence: 0.9, rationale: 'gate' },
      },
    }));

    const scanner = new L1LlmScanner();
    const report = await scanner.scan({
      specPath: spec,
      sourceDir: source,
      compileCommand: { command: 'node -e "process.exit(0)"', cwd: root },
      testCommand: { command: 'node -e "process.exit(0)"', cwd: root },
      writeReport: false,
    });

    expect(report.level).toBe('l1');
    expect(report.pass).toBe(true);
    expect(report.entries).toHaveLength(2);
    expect(report.entries[0]!.frId).toBe('FR-01');
    expect(report.entries[0]!.status).toBe('covered');
    expect(report.entries[0]!.evidence.files).toContain('pipeline-engine.ts');
    expect(report.entries[1]!.frId).toBe('FR-02');
    expect(report.entries[1]!.status).toBe('covered');
  });

  it('marks FRs as uncovered when mapping has no matching files', async () => {
    const { root, source, spec } = fixture();

    writeFileSync(join(root, 'sevo.scan.json'), JSON.stringify({
      version: 1,
      generatedAt: '2026-05-25T00:00:00Z',
      generatedBy: 'test',
      frFileMap: {
        'FR-01': { files: ['src/pipeline-engine.ts'], confidence: 0.95, rationale: 'engine' },
        // FR-02 maps to non-existent file
        'FR-02': { files: ['src/nonexistent.ts'], confidence: 0.5, rationale: 'guess' },
      },
    }));

    const scanner = new L1LlmScanner();
    const report = await scanner.scan({
      specPath: spec,
      sourceDir: source,
      compileCommand: { command: 'node -e "process.exit(0)"', cwd: root },
      testCommand: { command: 'node -e "process.exit(0)"', cwd: root },
      writeReport: false,
    });

    expect(report.pass).toBe(false);
    expect(report.entries[0]!.status).toBe('covered');
    expect(report.entries[1]!.status).toBe('uncovered');
    expect(report.entries[1]!.reason).toContain('LLM semantic analysis');
  });

  it('reports compile/test failures correctly', async () => {
    const { root, source, spec } = fixture();

    writeFileSync(join(root, 'sevo.scan.json'), JSON.stringify({
      version: 1,
      generatedAt: '2026-05-25T00:00:00Z',
      generatedBy: 'test',
      frFileMap: {
        'FR-01': { files: ['src/pipeline-engine.ts'], confidence: 0.95, rationale: 'engine' },
        'FR-02': { files: ['src/gate-system.ts'], confidence: 0.9, rationale: 'gate' },
      },
    }));

    const scanner = new L1LlmScanner();
    const report = await scanner.scan({
      specPath: spec,
      sourceDir: source,
      compileCommand: { command: 'node -e "process.exit(1)"', cwd: root },
      testCommand: { command: 'node -e "process.exit(0)"', cwd: root },
      writeReport: false,
    });

    expect(report.compile.passed).toBe(false);
    expect(report.tests.passed).toBe(true);
  });

  it('writes report to outputPath when specified', async () => {
    const { root, source, spec } = fixture();
    const outputPath = join(root, 'docs', 'l1-report.json');
    mkdirSync(join(root, 'docs'), { recursive: true });

    writeFileSync(join(root, 'sevo.scan.json'), JSON.stringify({
      version: 1,
      generatedAt: '2026-05-25T00:00:00Z',
      generatedBy: 'test',
      frFileMap: {
        'FR-01': { files: ['src/pipeline-engine.ts'], confidence: 0.95, rationale: 'engine' },
        'FR-02': { files: ['src/gate-system.ts'], confidence: 0.9, rationale: 'gate' },
      },
    }));

    const scanner = new L1LlmScanner();
    await scanner.scan({
      specPath: spec,
      sourceDir: source,
      outputPath,
      compileCommand: { command: 'node -e "process.exit(0)"', cwd: root },
      testCommand: { command: 'node -e "process.exit(0)"', cwd: root },
    });

    expect(existsSync(outputPath)).toBe(true);
    const written = JSON.parse(readFileSync(outputPath, 'utf8'));
    expect(written.level).toBe('l1');
    expect(written.entries).toHaveLength(2);
  });
});
