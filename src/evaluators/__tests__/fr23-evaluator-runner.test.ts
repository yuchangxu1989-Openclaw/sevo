/**
 * FR-23 Evaluator Runner + Workspace Isolation tests.
 *
 * Covers: runSingleEvaluator, runEvaluators aggregation, loadEvaluatorRegistry,
 * workspace isolation (initEvaluatorsDirectory, isWriteAllowed, validatePathPatterns).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  runSingleEvaluator,
  runEvaluators,
  loadEvaluatorRegistry,
  getEvaluatorsDir,
} from '../evaluator-runner.js';
import {
  initEvaluatorsDirectory,
  isWriteAllowed,
  generateAllowedWritePaths,
  generateIsolationPromptInjection,
  setupWorkspaceIsolation,
  validatePathPatterns,
} from '../workspace-isolation.js';
import type { EvaluatorConfig, EvaluatorInput, EvaluatorRegistry } from '../evaluator-types.js';

// ── Helpers ─────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'fr23-eval-'));
}

function writeScript(dir: string, name: string, content: string): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content, { mode: 0o755 });
  return p;
}

// ── Evaluator Runner Tests ─────────────────────────────────────

describe('FR-23: Evaluator Runner', () => {
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

  describe('runSingleEvaluator', () => {
    it('executes a passing evaluator script and parses JSON output', async () => {
      writeScript(evalDir, 'pass.sh', `#!/bin/bash
echo '{"verdict":"pass","score":95,"details":[{"rule":"check-1","passed":true,"message":"ok"}]}'`);

      const config: EvaluatorConfig = { name: 'pass-eval', script: 'pass.sh' };
      const input: EvaluatorInput = { stage: 'review', artifactPaths: [], projectMeta: {} };

      const result = await runSingleEvaluator(config, input, evalDir);

      expect(result.status).toBe('completed');
      expect(result.result?.verdict).toBe('pass');
      expect(result.result?.score).toBe(95);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns error when script does not exist', async () => {
      const config: EvaluatorConfig = { name: 'missing', script: 'nope.sh' };
      const input: EvaluatorInput = { stage: 'review', artifactPaths: [], projectMeta: {} };

      const result = await runSingleEvaluator(config, input, evalDir);

      expect(result.status).toBe('error');
      expect(result.errorMessage).toContain('not found');
    });

    it('returns error for non-zero exit code', async () => {
      writeScript(evalDir, 'fail-exit.sh', '#!/bin/bash\nexit 1');

      const config: EvaluatorConfig = { name: 'fail-exit', script: 'fail-exit.sh' };
      const input: EvaluatorInput = { stage: 'implement', artifactPaths: [], projectMeta: {} };

      const result = await runSingleEvaluator(config, input, evalDir);

      expect(result.status).toBe('error');
      expect(result.errorMessage).toContain('exited with code 1');
    });

    it('rejects invalid verdict values', async () => {
      writeScript(evalDir, 'bad-verdict.sh', `#!/bin/bash
echo '{"verdict":"maybe","score":50,"details":[]}'`);

      const config: EvaluatorConfig = { name: 'bad-verdict', script: 'bad-verdict.sh' };
      const input: EvaluatorInput = { stage: 'review', artifactPaths: [], projectMeta: {} };

      const result = await runSingleEvaluator(config, input, evalDir);

      expect(result.status).toBe('error');
      expect(result.errorMessage).toContain('invalid verdict');
    });

    it('clamps score to 0-100 range', async () => {
      writeScript(evalDir, 'high-score.sh', `#!/bin/bash
echo '{"verdict":"pass","score":150,"details":[]}'`);

      const config: EvaluatorConfig = { name: 'high-score', script: 'high-score.sh' };
      const input: EvaluatorInput = { stage: 'review', artifactPaths: [], projectMeta: {} };

      const result = await runSingleEvaluator(config, input, evalDir);

      expect(result.status).toBe('completed');
      expect(result.result?.score).toBe(100);
    });
  });

  describe('runEvaluators', () => {
    it('returns null for empty evaluator list (AC-23.4)', async () => {
      const registry: EvaluatorRegistry = {};
      const result = await runEvaluators('review', registry, [], {}, evalDir);
      expect(result).toBeNull();
    });

    it('aggregates: any fail → overall fail (AC-23.3)', async () => {
      writeScript(evalDir, 'p.sh', `#!/bin/bash
echo '{"verdict":"pass","score":90,"details":[]}'`);
      writeScript(evalDir, 'f.sh', `#!/bin/bash
echo '{"verdict":"fail","score":30,"details":[{"rule":"r1","passed":false,"message":"bad"}]}'`);

      const registry: EvaluatorRegistry = {
        review: [
          { name: 'pass-one', script: 'p.sh' },
          { name: 'fail-one', script: 'f.sh' },
        ],
      };

      const result = await runEvaluators('review', registry, [], {}, evalDir);

      expect(result).not.toBeNull();
      expect(result!.overallVerdict).toBe('fail');
      expect(result!.executions).toHaveLength(2);
    });

    it('returns pass when all evaluators pass', async () => {
      writeScript(evalDir, 'ok1.sh', `#!/bin/bash
echo '{"verdict":"pass","score":85,"details":[]}'`);
      writeScript(evalDir, 'ok2.sh', `#!/bin/bash
echo '{"verdict":"pass","score":92,"details":[]}'`);

      const registry: EvaluatorRegistry = {
        implement: [
          { name: 'eval-a', script: 'ok1.sh' },
          { name: 'eval-b', script: 'ok2.sh' },
        ],
      };

      const result = await runEvaluators('implement', registry, [], {}, evalDir);

      expect(result!.overallVerdict).toBe('pass');
    });
  });

  describe('loadEvaluatorRegistry', () => {
    it('loads from sevo.config.json', () => {
      fs.writeFileSync(
        path.join(tmpDir, 'sevo.config.json'),
        JSON.stringify({ evaluators: { review: [{ name: 'lint', script: 'lint.sh' }] } }),
      );
      const registry = loadEvaluatorRegistry(tmpDir);
      expect(registry.review).toHaveLength(1);
      expect(registry.review![0]!.name).toBe('lint');
    });

    it('returns empty registry when no config exists', () => {
      const registry = loadEvaluatorRegistry(path.join(tmpDir, 'nonexistent'));
      expect(Object.keys(registry)).toHaveLength(0);
    });
  });

  describe('getEvaluatorsDir', () => {
    it('returns evaluators/ under project root', () => {
      expect(getEvaluatorsDir('/my/project')).toBe('/my/project/evaluators');
    });
  });
});

// ── Workspace Isolation Tests (FR-23/FR-24) ────────────────────

describe('FR-23: Workspace Isolation', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  describe('initEvaluatorsDirectory', () => {
    it('creates evaluators/ directory and returns L0 status', () => {
      const status = initEvaluatorsDirectory(tmpDir);
      expect(status.layer).toBe('L0');
      expect(status.active).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'evaluators'))).toBe(true);
    });
  });

  describe('isWriteAllowed', () => {
    it('allows writes to src/', () => {
      expect(isWriteAllowed('src/index.ts')).toBe(true);
    });

    it('denies writes to evaluators/', () => {
      expect(isWriteAllowed('evaluators/lint.sh')).toBe(false);
    });

    it('denies writes to docs/', () => {
      expect(isWriteAllowed('docs/spec.md')).toBe(false);
    });
  });

  describe('generateAllowedWritePaths', () => {
    it('includes src and tests in allowed, evaluators in denied', () => {
      const config = generateAllowedWritePaths();
      expect(config.allowedWritePaths).toContain('src/**');
      expect(config.deniedWritePaths).toContain('evaluators/**');
    });
  });

  describe('validatePathPatterns', () => {
    it('warns about glob characters in patterns', () => {
      const warnings = validatePathPatterns(['evaluators/**', 'plain/']);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('evaluators/**');
    });

    it('returns empty for clean patterns', () => {
      expect(validatePathPatterns(['evaluators/', 'docs/'])).toHaveLength(0);
    });
  });

  describe('setupWorkspaceIsolation', () => {
    it('produces isolation report with all layers', () => {
      const status = setupWorkspaceIsolation(tmpDir);
      expect(status.isolated).toBe(true);
      expect(status.layers).toHaveLength(3);
      expect(status.layers.map((l) => l.layer)).toEqual(['L0', 'L4', 'L6']);
    });
  });

  describe('generateIsolationPromptInjection', () => {
    it('contains workspace isolation constraints', () => {
      const text = generateIsolationPromptInjection();
      expect(text).toContain('FORBIDDEN to write');
      expect(text).toContain('evaluators/');
    });
  });
});
