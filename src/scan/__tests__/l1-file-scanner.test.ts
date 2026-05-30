import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { L1FileScanner } from '../l1-file-scanner.js';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'sevo-l1-'));
  const source = join(root, 'src');
  mkdirSync(source, { recursive: true });
  const spec = join(root, 'spec.md');
  writeFileSync(spec, '### FR-01 Feature one\n\n- AC-1.1：Primary behavior works\n\n### FR-02 Feature two\n\n- AC-2.1：Other behavior works\n');
  writeFileSync(join(source, 'fr-01-feature.ts'), 'export const ok = true;\n');
  return { root, source, spec };
}

describe('L1FileScanner', () => {
  it('marks FRs uncovered when file evidence is missing', () => {
    const { root, source, spec } = fixture();
    const report = new L1FileScanner().scan({
      specPath: spec,
      sourceDir: source,
      compileCommand: { command: 'node -e "process.exit(0)"', cwd: root },
      testCommand: { command: 'node -e "process.exit(0)"', cwd: root },
      writeReport: false,
    });

    expect(report.pass).toBe(false);
    expect(report.entries.find((entry) => entry.frId === 'FR-01')?.status).toBe('covered');
    expect(report.entries.find((entry) => entry.frId === 'FR-02')?.status).toBe('uncovered');
  });

  it('blocks all entries when compile fails', () => {
    const { root, source, spec } = fixture();
    const report = new L1FileScanner().scan({
      specPath: spec,
      sourceDir: source,
      frFileMap: { 'FR-01': ['fr-01-feature.ts'], 'FR-02': ['fr-01-feature.ts'] },
      compileCommand: { command: 'node -e "process.exit(2)"', cwd: root },
      testCommand: { command: 'node -e "process.exit(0)"', cwd: root },
      writeReport: false,
    });

    expect(report.pass).toBe(false);
    expect(report.compile.passed).toBe(false);
    expect(report.entries.every((entry) => entry.compilePassed === false)).toBe(true);
  });
});
