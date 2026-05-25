/**
 * Workspace isolation for evaluation-implementation separation (FR-24).
 *
 * Ensures coding agents cannot modify evaluator scripts by enforcing
 * isolation at three layers:
 *   L0 — OS file permissions (strongest, host-dependent)
 *   L4 — ACP harness write-path whitelist
 *   L6 — Prompt injection (weakest, redundancy layer)
 *
 * AC-24.1: Auto-create evaluators/ directory.
 * AC-24.2: Set file permissions (L0) when host supports it.
 * AC-24.3: Generate allowedWritePaths config (L4).
 * AC-24.4: Generate prompt injection text (L6).
 * AC-24.6: Warn but don't block when L0 unavailable.
 * AC-24.7: Output isolation status report.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  IsolationStatus,
  IsolationLayerStatus,
  AllowedWritePathsConfig,
} from './evaluator-types.js';

/**
 * Initialize the evaluators directory with appropriate isolation.
 *
 * AC-24.1: Creates evaluators/ if it doesn't exist.
 * AC-24.2: Attempts to set read-only permissions for non-owner users (L0).
 */
export function initEvaluatorsDirectory(projectRoot: string): IsolationLayerStatus {
  const evaluatorsDir = path.join(projectRoot, 'evaluators');

  // Create directory if needed (AC-24.1)
  if (!fs.existsSync(evaluatorsDir)) {
    fs.mkdirSync(evaluatorsDir, { recursive: true });
  }

  // Attempt L0 isolation: set directory permissions
  // Owner (evaluator maintainer) gets rwx, group/others get r-x (read + execute, no write)
  try {
    // 0o755 = rwxr-xr-x — owner can write, others can only read/execute
    fs.chmodSync(evaluatorsDir, 0o755);

    // Also set existing files to read+execute for non-owner
    const files = fs.readdirSync(evaluatorsDir);
    for (const file of files) {
      const filePath = path.join(evaluatorsDir, file);
      const stat = fs.statSync(filePath);
      if (stat.isFile()) {
        // 0o755 for scripts (executable), 0o644 for non-executable
        const isExecutable = (stat.mode & 0o111) !== 0;
        fs.chmodSync(filePath, isExecutable ? 0o755 : 0o644);
      }
    }

    // P1-2: Detect same-uid scenario where chmod cannot actually
    // restrict the current process (owner always retains write).
    let level: 'full' | 'partial' = 'full';
    let warning: string | undefined;
    try {
      const dirStat = fs.statSync(evaluatorsDir);
      if (typeof process.getuid === 'function' && dirStat.uid === process.getuid()) {
        level = 'partial';
        warning = 'Process uid matches evaluators/ owner uid; chmod cannot restrict the owner. L0 isolation is partial — rely on L4/L6 for defense in depth.';
      }
    } catch {
      // stat failed; assume full — the chmod itself succeeded above.
    }

    return {
      layer: 'L0',
      active: true,
      level,
      description: 'OS file permissions: evaluators/ directory set to owner-writable, others read+execute only.',
      warning,
    };
  } catch (err) {
    // AC-24.6: Warn but don't block
    return {
      layer: 'L0',
      active: false,
      description: 'OS file permissions for evaluators/ directory.',
      warning: `Could not set file permissions (L0 isolation unavailable): ${(err as Error).message}`,
    };
  }
}

/**
 * Generate L4 isolation config: allowed write paths for coding agents.
 *
 * AC-24.3: Coding agent sessions get a write-path whitelist that
 * excludes evaluators/ and docs/.
 */
export function generateAllowedWritePaths(): AllowedWritePathsConfig {
  return {
    allowedWritePaths: [
      'src/**',
      'tests/**',
      'test/**',
      '__tests__/**',
      '*.json',
      '*.md',
      '.gitignore',
    ],
    deniedWritePaths: [
      'evaluators/**',
      'docs/**',
    ],
  };
}

/**
 * Check if L4 isolation is enforceable.
 *
 * Returns active=true if the config can be generated (always true;
 * actual enforcement depends on the ACP harness runtime).
 */
function checkL4Isolation(): IsolationLayerStatus {
  const config = generateAllowedWritePaths();

  // P1-3: Warn if denied paths contain glob characters that
  // isWriteAllowed cannot evaluate (prefix matching only).
  const globWarnings = validatePathPatterns(config.deniedWritePaths);
  const warning = globWarnings.length > 0 ? globWarnings.join(' ') : undefined;

  return {
    layer: 'L4',
    active: true,
    description: `ACP harness write-path whitelist: allowed=[${config.allowedWritePaths.join(', ')}], denied=[${config.deniedWritePaths.join(', ')}].`,
    warning,
  };
}

/**
 * Generate L6 prompt injection text for the Implement stage.
 *
 * AC-24.4: Explicit constraint in the coding agent's execution context.
 */
export function generateIsolationPromptInjection(): string {
  return [
    '## Workspace Isolation Constraints (SEVO FR-24)',
    '',
    'You are a coding agent executing within a SEVO pipeline.',
    'The following workspace isolation rules are in effect:',
    '',
    '- **ALLOWED to write**: `src/`, `tests/`, `test/`, `__tests__/`',
    '- **FORBIDDEN to write**: `evaluators/`, `docs/`',
    '- The `evaluators/` directory contains gate evaluation scripts maintained by auditors.',
    '- Modifying evaluator scripts is a pipeline violation and will be flagged.',
    '',
    'If you need changes to evaluator scripts, request them through the pipeline review process.',
    '',
  ].join('\n');
}

/**
 * Check L6 isolation status.
 */
function checkL6Isolation(): IsolationLayerStatus {
  return {
    layer: 'L6',
    active: true,
    description: 'Prompt injection: Implement stage context includes evaluators/ write prohibition.',
  };
}

/**
 * Run full isolation setup and produce status report.
 *
 * AC-24.7: Isolation status report with per-layer status.
 *
 * @param projectRoot - Project root directory.
 * @returns IsolationStatus report.
 */
export function setupWorkspaceIsolation(projectRoot: string): IsolationStatus {
  const evaluatorsDir = path.join(projectRoot, 'evaluators');

  // Setup each layer
  const l0Status = initEvaluatorsDirectory(projectRoot);
  const l4Status = checkL4Isolation();
  const l6Status = checkL6Isolation();

  const layers = [l0Status, l4Status, l6Status];
  const isolated = layers.some((l) => l.active);

  return {
    projectRoot,
    evaluatorsDir,
    layers,
    isolated,
    checkedAt: new Date().toISOString(),
  };
}

/** Glob meta-characters that are NOT supported by prefix matching. */
const GLOB_CHARS_RE = /[*?[\]]/;

/**
 * Validate path patterns for unsupported glob characters.
 *
 * P1-3: isWriteAllowed only supports prefix matching. If a config
 * contains glob patterns (e.g. 'evaluators/**') they will NOT be
 * evaluated as globs, leading to silent mismatches. This helper
 * detects such patterns so callers can warn early.
 *
 * @returns Array of warning strings (empty = all patterns are clean).
 */
export function validatePathPatterns(patterns: string[]): string[] {
  const warnings: string[] = [];
  for (const p of patterns) {
    if (GLOB_CHARS_RE.test(p)) {
      warnings.push(
        `Path pattern '${p}' contains glob characters which are not supported by isWriteAllowed (prefix matching only). ` +
        `Strip the glob suffix or switch to a glob-aware matcher.`,
      );
    }
  }
  return warnings;
}

/**
 * Validate that a file write target is allowed under isolation rules.
 *
 * AC-24.5: At least one layer should catch violations.
 * This function provides programmatic L4-level checking.
 *
 * **Important**: This function uses *prefix matching only*.
 * Glob patterns (e.g. 'evaluators/**') are NOT evaluated as globs.
 * Use {@link validatePathPatterns} at config-load time to catch
 * unsupported glob syntax in deny lists.
 *
 * @param filePath - Relative file path from project root.
 * @returns true if the write is allowed, false if it violates isolation.
 */
export function isWriteAllowed(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');

  // Check denied paths — prefix matching only (no glob support).
  const deniedPrefixes = ['evaluators/', 'docs/'];
  for (const prefix of deniedPrefixes) {
    if (normalized.startsWith(prefix) || normalized === prefix.replace('/', '')) {
      return false;
    }
  }

  return true;
}
