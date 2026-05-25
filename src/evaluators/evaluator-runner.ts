/**
 * Evaluator execution engine (FR-23).
 *
 * Reads evaluator configs for a given stage, spawns each evaluator script
 * as a child process, passes standardized JSON via stdin, parses JSON from
 * stdout, and aggregates results.
 *
 * AC-23.1: Execute evaluators in registration order.
 * AC-23.2: stdin/stdout JSON protocol.
 * AC-23.3: Any fail → overall fail.
 * AC-23.4: Empty evaluator list → skip (pure LLM fallback).
 * AC-23.5: Timeout → error, not pass.
 * AC-23.7: Any executable format (shell, Node.js, Python, etc.).
 */

import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

import type {
  EvaluatorConfig,
  EvaluatorInput,
  EvaluatorResult,
  EvaluatorExecution,
  EvaluatorResultSet,
  EvaluatorRegistry,
} from './evaluator-types.js';

/** Default timeout per evaluator in seconds. */
const DEFAULT_TIMEOUT_S = 60;

/**
 * Run a single evaluator script.
 *
 * The script receives JSON on stdin and must output JSON on stdout.
 * Exit code 0 = normal execution (verdict from output).
 * Non-zero exit code = evaluator error (not equivalent to fail).
 */
export async function runSingleEvaluator(
  config: EvaluatorConfig,
  input: EvaluatorInput,
  evaluatorsDir: string,
): Promise<EvaluatorExecution> {
  const startTime = Date.now();
  const scriptPath = path.resolve(evaluatorsDir, config.script);
  const timeoutMs = (config.timeout ?? DEFAULT_TIMEOUT_S) * 1000;

  // Verify script exists
  if (!fs.existsSync(scriptPath)) {
    return {
      name: config.name,
      script: config.script,
      result: null,
      status: 'error',
      errorMessage: `Evaluator script not found: ${scriptPath}`,
      durationMs: Date.now() - startTime,
    };
  }

  return new Promise<EvaluatorExecution>((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const finish = (execution: EvaluatorExecution): void => {
      if (settled) return;
      settled = true;
      resolve(execution);
    };

    // Determine how to execute the script based on extension
    const ext = path.extname(scriptPath).toLowerCase();
    let command: string;
    let args: string[];

    if (ext === '.sh') {
      command = 'bash';
      args = [scriptPath];
    } else if (ext === '.js' || ext === '.mjs') {
      command = 'node';
      args = [scriptPath];
    } else if (ext === '.py') {
      command = 'python3';
      args = [scriptPath];
    } else {
      // Treat as directly executable
      command = scriptPath;
      args = [];
    }

    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: path.dirname(evaluatorsDir),
      env: { ...process.env, SEVO_EVALUATOR: '1' },
    });

    // Timeout handler (AC-23.5)
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
      finish({
        name: config.name,
        script: config.script,
        result: null,
        status: 'timeout',
        errorMessage: `Evaluator timed out after ${config.timeout ?? DEFAULT_TIMEOUT_S}s`,
        durationMs: Date.now() - startTime,
      });
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.stdin.on('error', (err: NodeJS.ErrnoException) => {
      // Some evaluators exit immediately and never read stdin.
      // In that case Node may emit EPIPE asynchronously after we write.
      // Treat it as benign and let normal close/exit handling decide the result.
      if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') {
        return;
      }

      clearTimeout(timer);
      finish({
        name: config.name,
        script: config.script,
        result: null,
        status: 'error',
        errorMessage: `Evaluator stdin error: ${err.message}`,
        durationMs: Date.now() - startTime,
      });
    });

    child.on('error', (err: Error) => {
      clearTimeout(timer);
      finish({
        name: config.name,
        script: config.script,
        result: null,
        status: 'error',
        errorMessage: `Failed to spawn evaluator: ${err.message}`,
        durationMs: Date.now() - startTime,
      });
    });

    child.on('close', (code: number | null) => {
      clearTimeout(timer);
      if (timedOut) return; // already resolved

      const durationMs = Date.now() - startTime;

      // Non-zero exit = evaluator self-error (AC-23.2)
      if (code !== 0) {
        finish({
          name: config.name,
          script: config.script,
          result: null,
          status: 'error',
          errorMessage: `Evaluator exited with code ${code ?? 'null'}${stderr ? `: ${stderr.trim()}` : ''}`,
          durationMs,
        });
        return;
      }

      // Parse stdout JSON
      try {
        const parsed = JSON.parse(stdout.trim()) as EvaluatorResult;

        // Validate required fields
        if (!parsed.verdict || typeof parsed.score !== 'number' || !Array.isArray(parsed.details)) {
          finish({
            name: config.name,
            script: config.script,
            result: null,
            status: 'error',
            errorMessage: 'Evaluator output missing required fields (verdict, score, details)',
            durationMs,
          });
          return;
        }

        // P1-1: Validate verdict is strictly 'pass' or 'fail'.
        // Any other value (e.g. 'skip', 'maybe', typos) must not be
        // silently treated as pass by the aggregation logic.
        if (parsed.verdict !== 'pass' && parsed.verdict !== 'fail') {
          finish({
            name: config.name,
            script: config.script,
            result: null,
            status: 'error',
            errorMessage: `Evaluator returned invalid verdict '${String(parsed.verdict)}'; expected 'pass' or 'fail'`,
            durationMs,
          });
          return;
        }

        // Clamp score to 0-100
        parsed.score = Math.max(0, Math.min(100, parsed.score));

        finish({
          name: config.name,
          script: config.script,
          result: parsed,
          status: 'completed',
          durationMs,
        });
      } catch {
        finish({
          name: config.name,
          script: config.script,
          result: null,
          status: 'error',
          errorMessage: `Failed to parse evaluator JSON output: ${stdout.substring(0, 200)}`,
          durationMs,
        });
      }
    });

    // Write input JSON to stdin
    try {
      child.stdin.write(JSON.stringify(input));
      child.stdin.end();
    } catch {
      clearTimeout(timer);
      finish({
        name: config.name,
        script: config.script,
        result: null,
        status: 'error',
        errorMessage: 'Failed to write to evaluator stdin',
        durationMs: Date.now() - startTime,
      });
    }
  });
}

/**
 * Run all evaluators registered for a given stage.
 *
 * AC-23.1: Executes in registration order.
 * AC-23.3: Any fail → overall fail.
 * AC-23.4: Empty list → returns null (caller falls back to pure LLM).
 */
export async function runEvaluators(
  stage: string,
  registry: EvaluatorRegistry,
  artifactPaths: string[],
  projectMeta: Record<string, unknown>,
  evaluatorsDir: string,
): Promise<EvaluatorResultSet | null> {
  const configs = registry[stage];

  // AC-23.4: No evaluators for this stage → null (pure LLM fallback)
  if (!configs || configs.length === 0) {
    return null;
  }

  const input: EvaluatorInput = {
    stage,
    artifactPaths,
    projectMeta,
  };

  // Execute evaluators sequentially in registration order (AC-23.1)
  const executions: EvaluatorExecution[] = [];
  for (const config of configs) {
    const execution = await runSingleEvaluator(config, input, evaluatorsDir);
    executions.push(execution);
  }

  // Determine overall verdict (AC-23.3, AC-23.5)
  let overallVerdict: 'pass' | 'fail' | 'error' = 'pass';

  for (const exec of executions) {
    if (exec.status === 'error' || exec.status === 'timeout') {
      // AC-23.5: timeout/error → not pass
      overallVerdict = 'error';
    } else if (exec.result?.verdict === 'fail') {
      // AC-23.3: any fail → overall fail
      overallVerdict = 'fail';
      break; // fail takes precedence over error
    }
  }

  // If we found errors but no explicit fail, keep 'error'
  // If all passed, keep 'pass'

  return {
    stage,
    executions,
    overallVerdict,
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Load evaluator registry from project config.
 *
 * Reads from sevo.config.json `evaluators` field, or returns empty registry.
 */
export function loadEvaluatorRegistry(projectRoot: string): EvaluatorRegistry {
  // Try sevo.config.json first
  const sevoConfigPath = path.join(projectRoot, 'sevo.config.json');
  if (fs.existsSync(sevoConfigPath)) {
    try {
      const raw = fs.readFileSync(sevoConfigPath, 'utf8');
      const config = JSON.parse(raw) as { evaluators?: EvaluatorRegistry };
      return config.evaluators ?? {};
    } catch {
      return {};
    }
  }

  // Try package.json sevo field
  const pkgPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const raw = fs.readFileSync(pkgPath, 'utf8');
      const pkg = JSON.parse(raw) as { sevo?: { evaluators?: EvaluatorRegistry } };
      return pkg.sevo?.evaluators ?? {};
    } catch {
      return {};
    }
  }

  return {};
}

/**
 * Get the evaluators directory path for a project.
 */
export function getEvaluatorsDir(projectRoot: string): string {
  return path.join(projectRoot, 'evaluators');
}
