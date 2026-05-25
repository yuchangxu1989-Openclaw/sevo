/**
 * CLI tests — demo command (FR-16 Onboarding Experience).
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { createProgram } from '../index.js';
import { runDemo } from '../cmd-demo.js';
import type { DemoResult } from '../cmd-demo.js';

describe('demo command registration', () => {
  it('registers demo command in the program', () => {
    const program = createProgram();
    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain('demo');
  });

  it('demo command has --dry-run and --no-color options', () => {
    const program = createProgram();
    const demo = program.commands.find((c) => c.name() === 'demo')!;
    const optNames = demo.options.map((o) => o.long);
    expect(optNames).toContain('--dry-run');
    expect(optNames).toContain('--no-color');
  });
});

describe('runDemo — dry-run mode', () => {
  it('creates mock artifact files in /tmp', () => {
    const lines: string[] = [];
    const result = runDemo({ dryRun: true, noColor: true }, (msg) => lines.push(msg));

    expect(result.projectDir).toBe('/tmp/sevo-demo-hello-sevo');
    expect(fs.existsSync(path.join(result.projectDir, 'specs', 'product-requirements.md'))).toBe(true);
    expect(fs.existsSync(path.join(result.projectDir, 'contract', 'api-contract.json'))).toBe(true);
    expect(fs.existsSync(path.join(result.projectDir, 'reports', 'gap-scan-l1.json'))).toBe(true);
    expect(fs.readFileSync(path.join(result.projectDir, 'specs', 'product-requirements.md'), 'utf-8').trim().length).toBeGreaterThan(50);
  });

  it('returns all 6 demo stages as completed', () => {
    const result = runDemo({ dryRun: true, noColor: true }, () => {});

    expect(result.stagesCompleted).toEqual([
      'spec',
      'spec-review-gate',
      'implement',
      'review',
      'smoke-test',
      'deploy',
    ]);
  });

  it('generates ledger events', () => {
    const result = runDemo({ dryRun: true, noColor: true }, () => {});

    expect(result.ledgerEvents.length).toBeGreaterThanOrEqual(10);
    const types = result.ledgerEvents.map((e) => e.type);
    expect(types).toContain('pipeline:created');
    expect(types).toContain('pipeline:completed');
    expect(types).toContain('stage:completed');
    expect(types).toContain('gate:evaluated');
    expect(types).toContain('validation:gap-detected');
    expect(types).toContain('validation:fix-applied');
    expect(types).toContain('validation:passed');
  });

  it('outputs dry-run notice', () => {
    const lines: string[] = [];
    runDemo({ dryRun: true, noColor: true }, (msg) => lines.push(msg));

    const joined = lines.join('\n');
    expect(joined).toContain('Dry-run');
    expect(joined).toContain('Mock artifact structure created');
  });
});

describe('runDemo — normal mode (creates files)', () => {
  let result: DemoResult;

  afterEach(() => {
    // Clean up demo directory
    if (result?.projectDir && fs.existsSync(result.projectDir)) {
      fs.rmSync(result.projectDir, { recursive: true, force: true });
    }
  });

  it('creates project directory with sevo.json', () => {
    result = runDemo({ dryRun: false, noColor: true }, () => {});

    expect(fs.existsSync(result.projectDir)).toBe(true);
    const configPath = path.join(result.projectDir, 'sevo.json');
    expect(fs.existsSync(configPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    expect(config.projectName).toBe('hello-sevo');
    expect(config.adapter).toBe('standalone');
    expect(config.stages).toBeInstanceOf(Array);
    expect(config.stages.length).toBe(6);
  });

  it('creates pipeline JSON file', () => {
    result = runDemo({ dryRun: false, noColor: true }, () => {});

    const pipelineFile = path.join(result.projectDir, 'pipelines', `${result.pipelineId}.json`);
    expect(fs.existsSync(pipelineFile)).toBe(true);

    const pipeline = JSON.parse(fs.readFileSync(pipelineFile, 'utf-8'));
    expect(pipeline.pipelineId).toBe(result.pipelineId);
    expect(pipeline.projectSlug).toBe('hello-sevo');
    expect(pipeline.status).toBe('active');
  });

  it('writes ledger JSONL file', () => {
    result = runDemo({ dryRun: false, noColor: true }, () => {});

    const ledgerFile = path.join(result.projectDir, 'pipelines', '_ledger', `${result.pipelineId}.jsonl`);
    expect(fs.existsSync(ledgerFile)).toBe(true);

    const lines = fs.readFileSync(ledgerFile, 'utf-8').trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(10);

    // Each line should be valid JSON
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('creates product-requirements spec artifact', () => {
    result = runDemo({ dryRun: false, noColor: true }, () => {});

    const specPath = path.join(result.projectDir, 'specs', 'product-requirements.md');
    expect(result.specArtifactPath).toBe(specPath);
    expect(fs.existsSync(specPath)).toBe(true);
    expect(fs.readFileSync(specPath, 'utf-8')).toContain('Product Requirements');
  });

  it('creates subdirectories (specs, artifacts)', () => {
    result = runDemo({ dryRun: false, noColor: true }, () => {});

    expect(fs.existsSync(path.join(result.projectDir, 'specs'))).toBe(true);
    expect(fs.existsSync(path.join(result.projectDir, 'artifacts'))).toBe(true);
  });
});

describe('runDemo — output content', () => {
  it('includes banner, all 6 steps, and summary', () => {
    const lines: string[] = [];
    runDemo({ dryRun: true, noColor: true }, (msg) => lines.push(msg));

    const joined = lines.join('\n');
    expect(joined).toContain('SEVO');
    expect(joined).toContain('STEP 1');
    expect(joined).toContain('STEP 2');
    expect(joined).toContain('STEP 3');
    expect(joined).toContain('STEP 4');
    expect(joined).toContain('STEP 5');
    expect(joined).toContain('STEP 6');
    expect(joined).toContain('Summary');
    expect(joined).toContain('Execution Summary');
    expect(joined).toContain('Stage timings');
    expect(joined).toContain('Artifacts:');
  });

  it('includes next-steps guidance', () => {
    const lines: string[] = [];
    runDemo({ dryRun: true, noColor: true }, (msg) => lines.push(msg));

    const joined = lines.join('\n');
    expect(joined).toContain('sevo init');
    expect(joined).toContain('sevo create');
    expect(joined).toContain('sevo status');
  });

  it('mentions key concepts: Stages, Gates, Validation, Ledger', () => {
    const lines: string[] = [];
    runDemo({ dryRun: true, noColor: true }, (msg) => lines.push(msg));

    const joined = lines.join('\n');
    expect(joined).toContain('Stages');
    expect(joined).toContain('Gates');
    expect(joined).toContain('Validation');
    expect(joined).toContain('Ledger');
  });

  it('noColor mode produces no ANSI escape sequences', () => {
    const lines: string[] = [];
    runDemo({ dryRun: true, noColor: true }, (msg) => lines.push(msg));

    const joined = lines.join('\n');
    // eslint-disable-next-line no-control-regex
    expect(joined).not.toMatch(/\x1b\[/);
  });

  it('color mode produces ANSI escape sequences', () => {
    const lines: string[] = [];
    runDemo({ dryRun: true, noColor: false }, (msg) => lines.push(msg));

    const joined = lines.join('\n');
    // eslint-disable-next-line no-control-regex
    expect(joined).toMatch(/\x1b\[/);
  });
});

describe('runDemo — post-release validation gate', () => {
  it('shows gap detection with FR-3 blocked', () => {
    const lines: string[] = [];
    runDemo({ dryRun: true, noColor: true }, (msg) => lines.push(msg));

    const joined = lines.join('\n');
    expect(joined).toContain('Post-Release Validation Gate');
    expect(joined).toContain('FR-1');
    expect(joined).toContain('FR-2');
    expect(joined).toContain('FR-3');
    expect(joined).toContain('BLOCKED');
    expect(joined).toContain('\u672a\u627e\u5230\u5bf9\u5e94\u4ea4\u4ed8\u7269');
  });

  it('shows fix and final pass', () => {
    const lines: string[] = [];
    runDemo({ dryRun: true, noColor: true }, (msg) => lines.push(msg));

    const joined = lines.join('\n');
    expect(joined).toContain('\u6a21\u62df\u4fee\u590d FR-3');
    expect(joined).toContain('PASSED');
    expect(joined).toContain('0/3');
  });

  it('includes \u7ec8\u5c40\u601d\u7ef4 summary line', () => {
    const lines: string[] = [];
    runDemo({ dryRun: true, noColor: true }, (msg) => lines.push(msg));

    const joined = lines.join('\n');
    expect(joined).toContain('\u7ec8\u5c40\u601d\u7ef4');
    expect(joined).toContain('\u7528\u6237\u80fd\u7528');
  });

  it('returns validationResult with gap detected and fixed', () => {
    const result = runDemo({ dryRun: true, noColor: true }, () => {});

    expect(result.validationResult).toEqual({
      gapDetected: true,
      gapFixed: true,
      passed: true,
    });
  });
});
