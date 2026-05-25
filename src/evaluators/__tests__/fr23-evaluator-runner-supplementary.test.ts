/**
 * FR-23 Evaluator Runner — supplementary tests.
 *
 * Covers gaps not addressed in the primary test file:
 *   - AC-23.5: Timeout → error, not pass
 *   - AC-23.1: Execution in registration order
 *   - AC-23.7: Multi-format scripts (Node.js, Python)
 *   - AC-23.2: stdin JSON protocol (script reads input)
 *   - Invalid JSON output handling
 *   - loadEvaluatorRegistry from package.json
 *   - runEvaluators with error/timeout → overall 'error'
 *   - Score clamping for negative values
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  runSingleEvaluator,
  runEvaluators,
  loadEvaluatorRegistry,
} from '../evaluator-runner.js';
import type { EvaluatorConfig, EvaluatorInput, EvaluatorRegistry } from '../evaluator-types.js';

// ── Helpers ─────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fr23-supp-'));
}

function writeScript(dir: string, name: string, content: string): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content, { mode: 0o755 });
  return p;
}

const defaultInput: EvaluatorInput = { stage: 'review', artifactPaths: [], projectMeta: {} };

// ── Tests ───────────────────────────────────────────────────────

describe('FR-23 Supplementary: runSingleEvaluator', () => {
  let tmpDir: string;
  let evalDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    evalDir = path.join(tmpDir, 'evaluators');
    fs.mkdirSync(evalDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('AC-23.5: timeout produces error status, not pass', async () => {
    // Script that sleeps longer than the configured timeout
    writeScript(evalDir, 'slow.sh', `#!/bin/bash
sleep 10
echo '{"verdict":"pass","score":100,"details":[]}'`);

    const config: EvaluatorConfig = { name: 'slow-eval', script: 'slow.sh', timeout: 1 };
    const result = await runSingleEvaluator(config, defaultInput, evalDir);

    expect(result.status).toBe('timeout');
    expect(result.result).toBeNull();
    expect(result.errorMessage).toContain('timed out');
    expect(result.durationMs).toBeGreaterThanOrEqual(900); // ~1s
  }, 10_000);

  it('AC-23.7: executes Node.js (.js) evaluator scripts', async () => {
    writeScript(evalDir, 'check.js', `#!/usr/bin/env node
const result = { verdict: "pass", score: 88, details: [{ rule: "node-check", passed: true, message: "ok" }] };
process.stdout.write(JSON.stringify(result));`);

    const config: EvaluatorConfig = { name: 'node-eval', script: 'check.js' };
    const result = await runSingleEvaluator(config, defaultInput, evalDir);

    expect(result.status).toBe('completed');
    expect(result.result?.verdict).toBe('pass');
    expect(result.result?.score).toBe(88);
  });

  it('AC-23.7: executes Python (.py) evaluator scripts', async () => {
    writeScript(evalDir, 'check.py', `#!/usr/bin/env python3
import json, sys
result = {"verdict": "fail", "score": 20, "details": [{"rule": "py-check", "passed": False, "message": "nope"}]}
sys.stdout.write(json.dumps(result))`);

    const config: EvaluatorConfig = { name: 'py-eval', script: 'check.py' };
    const result = await runSingleEvaluator(config, defaultInput, evalDir);

    expect(result.status).toBe('completed');
    expect(result.result?.verdict).toBe('fail');
    expect(result.result?.score).toBe(20);
    expect(result.result!.details[0]!.rule).toBe('py-check');
  });

  it('AC-23.2: passes input JSON via stdin to evaluator script', async () => {
    // Node.js script reads stdin JSON and echoes the stage field back
    writeScript(evalDir, 'echo-input.js', `#!/usr/bin/env node
let data = '';
process.stdin.on('data', chunk => { data += chunk; });
process.stdin.on('end', () => {
  const input = JSON.parse(data);
  const result = {
    verdict: "pass",
    score: 100,
    details: [{ rule: "stdin-check", passed: true, message: "stage=" + input.stage }]
  };
  process.stdout.write(JSON.stringify(result));
});`);

    const input: EvaluatorInput = { stage: 'implement', artifactPaths: ['/a.ts'], projectMeta: { name: 'test' } };
    const config: EvaluatorConfig = { name: 'stdin-eval', script: 'echo-input.js' };
    const result = await runSingleEvaluator(config, input, evalDir);

    expect(result.status).toBe('completed');
    expect(result.result!.details[0]!.message).toContain('stage=implement');
  });

  it('returns error for malformed JSON output', async () => {
    writeScript(evalDir, 'bad-json.sh', `#!/bin/bash
echo 'not valid json at all'`);

    const config: EvaluatorConfig = { name: 'bad-json', script: 'bad-json.sh' };
    const result = await runSingleEvaluator(config, defaultInput, evalDir);

    expect(result.status).toBe('error');
    expect(result.errorMessage).toContain('parse');
  });

  it('returns error when output is missing required fields', async () => {
    writeScript(evalDir, 'partial.sh', `#!/bin/bash
echo '{"verdict":"pass"}'`);

    const config: EvaluatorConfig = { name: 'partial', script: 'partial.sh' };
    const result = await runSingleEvaluator(config, defaultInput, evalDir);

    expect(result.status).toBe('error');
    expect(result.errorMessage).toContain('missing required fields');
  });

  it('clamps negative score to 0', async () => {
    writeScript(evalDir, 'neg-score.sh', `#!/bin/bash
echo '{"verdict":"pass","score":-50,"details":[]}'`);

    const config: EvaluatorConfig = { name: 'neg-score', script: 'neg-score.sh' };
    const result = await runSingleEvaluator(config, defaultInput, evalDir);

    expect(result.status).toBe('completed');
    expect(result.result?.score).toBe(0);
  });
});

describe('FR-23 Supplementary: runEvaluators', () => {
  let tmpDir: string;
  let evalDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    evalDir = path.join(tmpDir, 'evaluators');
    fs.mkdirSync(evalDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('AC-23.1: executes evaluators in registration order', async () => {
    // Each script appends its name to a shared file to prove order
    const orderFile = path.join(tmpDir, 'order.txt');
    writeScript(evalDir, 'first.sh', `#!/bin/bash
echo "first" >> ${orderFile}
echo '{"verdict":"pass","score":100,"details":[]}'`);
    writeScript(evalDir, 'second.sh', `#!/bin/bash
echo "second" >> ${orderFile}
echo '{"verdict":"pass","score":100,"details":[]}'`);
    writeScript(evalDir, 'third.sh', `#!/bin/bash
echo "third" >> ${orderFile}
echo '{"verdict":"pass","score":100,"details":[]}'`);

    const registry: EvaluatorRegistry = {
      review: [
        { name: 'first', script: 'first.sh' },
        { name: 'second', script: 'second.sh' },
        { name: 'third', script: 'third.sh' },
      ],
    };

    const result = await runEvaluators('review', registry, [], {}, evalDir);

    expect(result!.overallVerdict).toBe('pass');
    expect(result!.executions).toHaveLength(3);

    const order = fs.readFileSync(orderFile, 'utf8').trim().split('\n');
    expect(order).toEqual(['first', 'second', 'third']);
  });

  it('AC-23.5: timeout in one evaluator → overall error', async () => {
    writeScript(evalDir, 'ok.sh', `#!/bin/bash
echo '{"verdict":"pass","score":90,"details":[]}'`);
    writeScript(evalDir, 'hang.sh', `#!/bin/bash
sleep 10
echo '{"verdict":"pass","score":100,"details":[]}'`);

    const registry: EvaluatorRegistry = {
      review: [
        { name: 'ok-eval', script: 'ok.sh' },
        { name: 'hang-eval', script: 'hang.sh', timeout: 1 },
      ],
    };

    const result = await runEvaluators('review', registry, [], {}, evalDir);

    expect(result!.overallVerdict).toBe('error');
    const hangExec = result!.executions.find(e => e.name === 'hang-eval');
    expect(hangExec?.status).toBe('timeout');
  }, 10_000);

  it('returns null for stage not in registry (AC-23.4)', async () => {
    const registry: EvaluatorRegistry = {
      implement: [{ name: 'x', script: 'x.sh' }],
    };
    // Asking for 'review' stage which has no evaluators
    const result = await runEvaluators('review', registry, [], {}, evalDir);
    expect(result).toBeNull();
  });
});

describe('FR-23 Supplementary: loadEvaluatorRegistry', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('loads evaluators from package.json sevo field', () => {
    const pkg = {
      name: 'my-project',
      version: '1.0.0',
      sevo: {
        evaluators: {
          implement: [{ name: 'coverage', script: 'coverage.sh', timeout: 30 }],
        },
      },
    };
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(pkg));

    const registry = loadEvaluatorRegistry(tmpDir);

    expect(registry.implement).toHaveLength(1);
    expect(registry.implement![0]!.name).toBe('coverage');
    expect(registry.implement![0]!.timeout).toBe(30);
  });

  it('prefers sevo.config.json over package.json', () => {
    // Both exist — sevo.config.json should win
    fs.writeFileSync(
      path.join(tmpDir, 'sevo.config.json'),
      JSON.stringify({ evaluators: { review: [{ name: 'from-config', script: 'a.sh' }] } }),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ sevo: { evaluators: { review: [{ name: 'from-pkg', script: 'b.sh' }] } } }),
    );

    const registry = loadEvaluatorRegistry(tmpDir);
    expect(registry.review![0]!.name).toBe('from-config');
  });

  it('returns empty registry for malformed sevo.config.json', () => {
    fs.writeFileSync(path.join(tmpDir, 'sevo.config.json'), '{ invalid json !!!');
    const registry = loadEvaluatorRegistry(tmpDir);
    expect(Object.keys(registry)).toHaveLength(0);
  });
});
