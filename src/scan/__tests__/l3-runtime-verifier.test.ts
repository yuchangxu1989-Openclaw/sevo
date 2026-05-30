import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { defaultRuntimeChecksForType, loadRuntimeChecks } from '../default-runtime-checks.js';
import { L3RuntimeVerifier } from '../l3-runtime-verifier.js';

const meaningfulLlm = {
  async chat() {
    return '{"meaningful":true,"judgment":"Business output is non-empty and useful."}';
  },
};

const notMeaningfulLlm = {
  async chat() {
    return '{"meaningful":false,"judgment":"Only placeholder/help output."}';
  },
};

describe('L3RuntimeVerifier', () => {
  it('verifies CLI command liveness and meaningful output', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sevo-l3-'));
    const report = await new L3RuntimeVerifier().verify({
      projectType: 'cli',
      projectRoot: root,
      llmClient: meaningfulLlm,
      writeReport: false,
      checks: [{ domain: 'cli-core', command: 'node -e "console.log(\'created useful report\')"' }],
    });

    expect(report.pass).toBe(true);
    expect(report.entries[0]?.status).toBe('alive');
    expect(report.entries[0]?.evidence.exitCode).toBe(0);
  });

  it('marks dead when runtime output is empty', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sevo-l3-'));
    const report = await new L3RuntimeVerifier().verify({
      projectType: 'cli',
      projectRoot: root,
      llmClient: meaningfulLlm,
      writeReport: false,
      checks: [{ domain: 'cli-core', command: 'node -e ""' }],
    });

    expect(report.pass).toBe(false);
    expect(report.entries[0]?.status).toBe('dead');
  });

  it('verifies library import and API return value', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sevo-l3-lib-'));
    writeFileSync(join(root, 'module.mjs'), 'export function run(){ return { value: "useful" }; }\n');

    const report = await new L3RuntimeVerifier().verify({
      projectType: 'library',
      projectRoot: root,
      llmClient: meaningfulLlm,
      writeReport: false,
      checks: [{ domain: 'library-core', type: 'library', modulePath: 'module.mjs', exportName: 'run' }],
    });

    expect(report.entries[0]?.actualOutput).toContain('useful');
    expect(report.pass).toBe(true);
  });

  it('loads configured runtime checks and writes a full L3 report', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sevo-l3-config-'));
    const outputPath = join(root, 'gap-scan-l3.json');
    writeFileSync(join(root, 'sevo.config.json'), JSON.stringify({
      runtimeChecks: [
        { domain: 'configured-cli', type: 'cli', command: 'node -e "console.log(JSON.stringify({value:42}))"' },
      ],
    }));

    const report = await new L3RuntimeVerifier().verify({
      projectType: 'cli',
      projectRoot: root,
      llmClient: meaningfulLlm,
      outputPath,
      checks: loadRuntimeChecks(root),
    });

    expect(report.pass).toBe(true);
    expect(report.entries).toHaveLength(1);
    expect(report.entries[0]).toMatchObject({
      domain: 'configured-cli',
      status: 'alive',
      evidence: { exitCode: 0 },
    });
    expect(existsSync(outputPath)).toBe(true);
    const saved = JSON.parse(readFileSync(outputPath, 'utf8'));
    expect(saved.entries[0].actualOutput).toContain('42');
  });

  it('creates default runtime checks from package metadata when no checks are declared', () => {
    const root = mkdtempSync(join(tmpdir(), 'sevo-l3-defaults-'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      name: 'example-cli',
      bin: { example: './bin/example.js' },
      scripts: { test: 'vitest run' },
      main: './dist/index.js',
    }));

    const checks = defaultRuntimeChecksForType(root, 'cli');

    expect(checks.map((check) => check.domain)).toEqual(expect.arrayContaining([
      'cli-help',
      'cli-demo',
      'test-suite',
      'library-entry',
    ]));
  });

  it('marks dead when transport succeeds but output is not meaningful', async () => {
    const root = mkdtempSync(join(tmpdir(), 'sevo-l3-meaning-'));
    const report = await new L3RuntimeVerifier().verify({
      projectType: 'cli',
      projectRoot: root,
      llmClient: notMeaningfulLlm,
      writeReport: false,
      checks: [{ domain: 'placeholder-output', command: 'node -e "console.log(\'TODO placeholder\')"' }],
    });

    expect(report.pass).toBe(false);
    expect(report.entries[0]).toMatchObject({
      status: 'dead',
      judgment: 'Only placeholder/help output.',
    });
  });
});
