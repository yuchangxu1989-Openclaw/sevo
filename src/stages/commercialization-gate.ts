import { execFileSync as runCommandSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import * as path from 'node:path';

import type { ArtifactRef, StageId } from '../types/index.js';
import {
  configExternalizationChecker,
  consoleLogScanner,
  documentationQualityChecker,
  errorHandlingCoverageChecker,
  todoFixmeScanner,
  type ScannerResult,
} from '../scan/commercialization-scanners.js';
import type { Stage } from './spec-types.js';
import type {
  CommercializationCheckItem,
  CommercializationCheckLayer,
  CommercializationCheckStatus,
  CommercializationGateActivationConfig,
  CommercializationGateInput,
  CommercializationGateOutput,
  CommercializationGateResult,
  CommercializationGateSummary,
  PublishCheckResult,
  PublishGateResult,
  PublishTarget,
} from './commercialization-gate-types.js';

const ALL_LAYERS: CommercializationCheckLayer[] = [
  'code-cleanliness',
  'package-integrity',
  'documentation',
  'buildability',
  'out-of-box',
  'error-handling',
];

function hasPublishTarget(publishTarget: PublishTarget | undefined): boolean {
  if (Array.isArray(publishTarget)) return publishTarget.length > 0;
  return typeof publishTarget === 'string' && publishTarget.trim().length > 0;
}

// ── Individual check functions (AC-4.32k: each independent for incremental re-run) ──

function checkHardcodedPaths(root: string): CommercializationCheckItem {
  const patterns = [/\/root\//g, /\/home\/\w+/g, /~\/\.openclaw\//g];
  const violations = scanFiles(root, ['.ts', '.js', '.mjs', '.cjs'], patterns);
  return {
    layer: 'code-cleanliness',
    id: 'hardcoded-paths',
    description: 'No hardcoded absolute paths (/root/, /home/, ~/.openclaw/)',
    status: violations.length === 0 ? 'pass' : 'fail',
    detail: violations.length > 0 ? `Found in: ${fmtList(violations)}` : undefined,
    suggestion: 'Replace hardcoded paths with configurable options or environment variables.',
  };
}

function checkInternalReferences(root: string): CommercializationCheckItem {
  const patterns = [
    /\b(?:dev-0[12]|audit-0[12]|sa-0[12]|pm-0[12]|ux-0[12]|cc|free-code|codex|opencode|hermes)\b/g,
    /https?:\/\/(?:api2\.penguinsaichat|localhost:\d{4,5})/g,
  ];
  const violations = scanFiles(root, ['.ts', '.js', '.json'], patterns);
  return {
    layer: 'code-cleanliness',
    id: 'internal-references',
    description: 'No internal agent names or API addresses',
    status: violations.length === 0 ? 'pass' : 'fail',
    detail: violations.length > 0 ? `Found in: ${fmtList(violations)}` : undefined,
    suggestion: 'Remove or abstract internal references behind configuration.',
  };
}

function scannerResultToCheck(
  layer: CommercializationCheckLayer,
  id: string,
  description: string,
  result: ScannerResult,
): CommercializationCheckItem {
  return {
    layer,
    id,
    description,
    status: result.status === 'warning' ? 'warn' : result.status,
    detail: result.items.length > 0
      ? result.items.slice(0, 10).map((item) => `${item.file}:${item.line} ${item.message}`).join('; ')
      : undefined,
    suggestion: result.items.length > 0
      ? `Fix ${id}: ${result.items.slice(0, 3).map((item) => `${item.file}:${item.line}`).join(', ')}`
      : undefined,
  };
}

function checkConsoleResiduals(root: string): CommercializationCheckItem {
  return scannerResultToCheck(
    'code-cleanliness',
    'console-log-scanner',
    'No console.log/debug/warn residuals in production source',
    consoleLogScanner(root),
  );
}

function checkTodoResiduals(root: string): CommercializationCheckItem {
  return scannerResultToCheck(
    'code-cleanliness',
    'todo-fixme-scanner',
    'No TODO/FIXME/HACK/XXX residual comments in production source',
    todoFixmeScanner(root),
  );
}

function checkConfigExternalization(root: string): CommercializationCheckItem {
  return scannerResultToCheck(
    'code-cleanliness',
    'config-externalization-checker',
    'No hardcoded ports, URLs, or absolute config paths in source',
    configExternalizationChecker(root),
  );
}


function checkSensitiveInfo(root: string): CommercializationCheckItem {
  const patterns = [
    /(?:api[_-]?key|apikey|secret|token|password)\s*[:=]\s*['"][^'"]{8,}/gi,
    /\.env(?:\.local|\.production)?$/g,
  ];
  const violations = scanFiles(root, ['.ts', '.js', '.json', '.md'], patterns);
  return {
    layer: 'code-cleanliness',
    id: 'sensitive-info',
    description: 'No API keys, tokens, or .env file references',
    status: violations.length === 0 ? 'pass' : 'fail',
    detail: violations.length > 0 ? `Found in: ${fmtList(violations)}` : undefined,
    suggestion: 'Move secrets to environment variables; add .env to .gitignore.',
  };
}

function checkErrorHandlingCoverage(root: string): CommercializationCheckItem {
  return scannerResultToCheck(
    'error-handling',
    'error-handling-coverage',
    'Async functions and public entrypoints have visible friendly error handling coverage',
    errorHandlingCoverageChecker(root),
  );
}


function checkDependencyCompleteness(root: string): CommercializationCheckItem {
  try {
    const pkgRaw = readFileSync(path.join(root, 'package.json'), 'utf-8');
    const pkg = JSON.parse(pkgRaw) as Record<string, Record<string, string> | undefined>;
    const declared = new Set([
      ...Object.keys(pkg['dependencies'] ?? {}),
      ...Object.keys(pkg['devDependencies'] ?? {}),
      ...Object.keys(pkg['peerDependencies'] ?? {}),
    ]);
    const imports = collectImports(root);
    const missing = imports.filter((imp) => !declared.has(imp) && !imp.startsWith('.') && !imp.startsWith('node:'));
    return {
      layer: 'code-cleanliness',
      id: 'dependency-completeness',
      description: 'All imported packages declared in package.json',
      status: missing.length === 0 ? 'pass' : 'fail',
      detail: missing.length > 0 ? `Undeclared: ${missing.join(', ')}` : undefined,
      suggestion: 'Add missing packages to dependencies in package.json.',
    };
  } catch {
    return {
      layer: 'code-cleanliness',
      id: 'dependency-completeness',
      description: 'All imported packages declared in package.json',
      status: 'skip',
      detail: 'package.json not found or invalid',
    };
  }
}

// ── Layer 2: Package Integrity ──

function checkPackageJsonRequiredFields(root: string): CommercializationCheckItem {
  const required = ['name', 'version', 'description', 'author', 'license', 'main'];
  const optional = ['exports', 'bin'];
  try {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf-8')) as Record<string, unknown>;
    const missing = required.filter((f) => !pkg[f] || (typeof pkg[f] === 'string' && (pkg[f] as string).trim() === ''));
    const missingOptional = optional.filter((f) => !pkg[f]);
    const allMissing = [...missing, ...missingOptional.map((f) => `${f} (recommended)`)];
    return {
      layer: 'package-integrity',
      id: 'package-json-fields',
      description: 'package.json has required fields (name/version/description/author/license/main)',
      status: missing.length === 0 ? (missingOptional.length === 0 ? 'pass' : 'warn') : 'fail',
      detail: allMissing.length > 0 ? `Missing: ${allMissing.join(', ')}` : undefined,
      suggestion: 'Fill in all required fields in package.json.',
    };
  } catch {
    return {
      layer: 'package-integrity',
      id: 'package-json-fields',
      description: 'package.json has required fields',
      status: 'fail',
      detail: 'package.json not found or invalid',
      suggestion: 'Create a valid package.json with npm init.',
    };
  }
}

function checkEntryFileExists(root: string): CommercializationCheckItem {
  try {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf-8')) as Record<string, unknown>;
    const main = pkg['main'] as string | undefined;
    if (!main) {
      return { layer: 'package-integrity', id: 'entry-file-exists', description: 'Entry file (main) exists', status: 'skip', detail: 'No main field in package.json' };
    }
    const exists = existsSync(path.join(root, main));
    return {
      layer: 'package-integrity',
      id: 'entry-file-exists',
      description: 'Entry file (main) exists',
      status: exists ? 'pass' : 'warn',
      detail: exists ? undefined : `Entry file ${main} not found (may need build first)`,
      suggestion: 'Run build to generate the entry file, or fix the main field.',
    };
  } catch {
    return { layer: 'package-integrity', id: 'entry-file-exists', description: 'Entry file (main) exists', status: 'skip', detail: 'package.json not found' };
  }
}

function checkTsconfigExists(root: string): CommercializationCheckItem {
  const exists = existsSync(path.join(root, 'tsconfig.json'));
  return {
    layer: 'package-integrity',
    id: 'tsconfig-exists',
    description: 'tsconfig.json exists for TypeScript projects',
    status: exists ? 'pass' : 'warn',
    detail: exists ? undefined : 'tsconfig.json not found',
    suggestion: 'Create tsconfig.json with tsc --init.',
  };
}

function checkGitignore(root: string): CommercializationCheckItem {
  try {
    const content = readFileSync(path.join(root, '.gitignore'), 'utf-8');
    const hasDistExclude = /\b(?:dist|build|out)\b/.test(content);
    return {
      layer: 'package-integrity',
      id: 'gitignore-build-output',
      description: '.gitignore excludes build output (dist/build/out)',
      status: hasDistExclude ? 'pass' : 'warn',
      detail: hasDistExclude ? undefined : '.gitignore does not exclude dist/build/out',
      suggestion: 'Add dist/ to .gitignore.',
    };
  } catch {
    return {
      layer: 'package-integrity',
      id: 'gitignore-build-output',
      description: '.gitignore excludes build output',
      status: 'warn',
      detail: '.gitignore not found',
      suggestion: 'Create .gitignore and add dist/, node_modules/, etc.',
    };
  }
}

function checkNpmPackageFiles(root: string): CommercializationCheckItem {
  const hasNpmignore = existsSync(path.join(root, '.npmignore'));
  let hasFilesField = false;
  try {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf-8')) as Record<string, unknown>;
    hasFilesField = Array.isArray(pkg['files']);
  } catch { /* ignore */ }
  const ok = hasNpmignore || hasFilesField;
  return {
    layer: 'package-integrity',
    id: 'npm-package-files',
    description: 'npm package file config (.npmignore or files field)',
    status: ok ? 'pass' : 'warn',
    detail: ok ? undefined : 'Neither .npmignore nor files field found in package.json',
    suggestion: 'Add a files field to package.json or create .npmignore to control published files.',
  };
}

function checkDependencyVersionSafety(root: string): CommercializationCheckItem {
  try {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf-8')) as Record<string, Record<string, string> | undefined>;
    const sections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
    const unsafe: string[] = [];
    for (const section of sections) {
      const deps = pkg[section] ?? {};
      for (const [name, version] of Object.entries(deps)) {
        if (version === '*' || version === 'latest') unsafe.push(`${section}.${name}@${version}`);
      }
    }
    return {
      layer: 'package-integrity',
      id: 'dependency-version-safety',
      description: 'Dependencies avoid wildcard or latest versions',
      status: unsafe.length === 0 ? 'pass' : 'fail',
      detail: unsafe.length > 0 ? `Unsafe versions: ${unsafe.join(', ')}` : undefined,
      suggestion: 'Pin dependencies with explicit semver ranges instead of * or latest.',
    };
  } catch {
    return {
      layer: 'package-integrity',
      id: 'dependency-version-safety',
      description: 'Dependencies avoid wildcard or latest versions',
      status: 'skip',
      detail: 'package.json not found or invalid',
    };
  }
}

// ── Layer 3: Documentation ──

function checkReadmeQuality(root: string): CommercializationCheckItem {
  return scannerResultToCheck(
    'documentation',
    'documentation-quality',
    'README/API docs cover public APIs, CHANGELOG has latest entry, and config docs exist',
    documentationQualityChecker(root),
  );
}

function checkReadmeQuickStart(root: string): CommercializationCheckItem {
  try {
    const content = readFileSync(path.join(root, 'README.md'), 'utf-8');
    const hasQuickStart = /快速|quick\s*start|getting\s*started|安装/i.test(content);
    return {
      layer: 'documentation',
      id: 'readme-quick-start',
      description: 'README contains quick start / getting started section',
      status: hasQuickStart ? 'pass' : 'warn',
      detail: hasQuickStart ? undefined : 'No quick start section found in README',
      suggestion: 'Add a "Quick Start" or "Getting Started" section to README.',
    };
  } catch {
    return {
      layer: 'documentation',
      id: 'readme-quick-start',
      description: 'README contains quick start section',
      status: 'skip',
      detail: 'README.md not found',
    };
  }
}

function checkLicenseExists(root: string): CommercializationCheckItem {
  const exists = existsSync(path.join(root, 'LICENSE')) || existsSync(path.join(root, 'LICENSE.md'));
  return {
    layer: 'documentation',
    id: 'license-exists',
    description: 'LICENSE file exists',
    status: exists ? 'pass' : 'fail',
    detail: exists ? undefined : 'LICENSE file not found',
    suggestion: 'Add a LICENSE file (MIT, Apache-2.0, etc.).',
  };
}

function checkChangelogExists(root: string): CommercializationCheckItem {
  const result = documentationQualityChecker(root);
  const changelogItems = result.items.filter((item) => item.file === 'CHANGELOG.md');
  return {
    layer: 'documentation',
    id: 'changelog-exists',
    description: 'CHANGELOG.md exists and latest version entry is non-empty',
    status: changelogItems.length === 0 ? 'pass' : 'fail',
    detail: changelogItems.length > 0 ? changelogItems.map((item) => item.message).join('; ') : undefined,
    suggestion: changelogItems.length > 0 ? 'Add CHANGELOG.md with a non-empty latest version entry.' : undefined,
  };
}

function checkConfigDocumentation(root: string): CommercializationCheckItem {
  const result = documentationQualityChecker(root);
  const configItems = result.items.filter((item) => item.message.includes('Configuration documentation'));
  return {
    layer: 'documentation',
    id: 'config-documentation',
    description: 'README or API docs describe configuration options',
    status: configItems.length === 0 ? 'pass' : 'warn',
    detail: configItems.length > 0 ? configItems.map((item) => item.message).join('; ') : undefined,
    suggestion: 'Add a Configuration section covering environment variables, config files, and CLI parameters.',
  };
}

// ── Layer 4: Buildability ──

function checkBuildScript(root: string): CommercializationCheckItem {
  const result = checkPkgScript(root, 'build', 'buildability', 'build-script', 'package.json has build script');
  result.requiresExternalVerification = true;
  return result;
}

function checkTestScript(root: string): CommercializationCheckItem {
  const result = checkPkgScript(root, 'test', 'buildability', 'test-script', 'package.json has test script');
  result.requiresExternalVerification = true;
  return result;
}

function checkTsconfigOutDir(root: string): CommercializationCheckItem {
  try {
    const tsconfig = JSON.parse(readFileSync(path.join(root, 'tsconfig.json'), 'utf-8')) as Record<string, Record<string, unknown>>;
    const hasOutDir = !!(tsconfig['compilerOptions']?.['outDir']);
    return {
      layer: 'buildability',
      id: 'tsconfig-outdir',
      description: 'tsconfig.json has outDir configured',
      status: hasOutDir ? 'pass' : 'warn',
      detail: hasOutDir ? undefined : 'tsconfig.json missing outDir',
      suggestion: 'Set outDir in tsconfig.json compilerOptions (e.g., "outDir": "dist").',
    };
  } catch {
    return {
      layer: 'buildability',
      id: 'tsconfig-outdir',
      description: 'tsconfig.json has outDir configured',
      status: 'skip',
      detail: 'tsconfig.json not found',
    };
  }
}

function checkCliHelpEntry(root: string): CommercializationCheckItem {
  try {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf-8')) as Record<string, unknown>;
    const bin = pkg['bin'];
    if (!bin) {
      return { layer: 'buildability', id: 'cli-help-entry', description: 'CLI bin entry files exist', status: 'skip', detail: 'No bin field in package.json' };
    }
    const binPaths: string[] = typeof bin === 'string' ? [bin] : Object.values(bin as Record<string, string>);
    const missing = binPaths.filter((p) => !existsSync(path.join(root, p)));
    return {
      layer: 'buildability',
      id: 'cli-help-entry',
      description: 'CLI bin entry files exist',
      status: missing.length === 0 ? 'pass' : 'warn',
      detail: missing.length > 0 ? `Missing bin files: ${missing.join(', ')} (may need build first)` : undefined,
      suggestion: 'Run build to generate CLI entry files, or fix bin paths in package.json.',
      requiresExternalVerification: true,
    };
  } catch {
    return { layer: 'buildability', id: 'cli-help-entry', description: 'CLI bin entry files exist', status: 'skip', detail: 'package.json not found' };
  }
}

// ── Layer 5: Out-of-Box ──

function checkBinField(root: string, isCli: boolean): CommercializationCheckItem {
  if (!isCli) {
    return {
      layer: 'out-of-box',
      id: 'bin-field',
      description: 'package.json has bin field (CLI projects)',
      status: 'skip',
      detail: 'Not a CLI project',
    };
  }
  try {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf-8')) as Record<string, unknown>;
    const hasBin = !!pkg['bin'];
    return {
      layer: 'out-of-box',
      id: 'bin-field',
      description: 'package.json has bin field (CLI projects)',
      status: hasBin ? 'pass' : 'fail',
      detail: hasBin ? undefined : 'CLI project missing bin field in package.json',
      suggestion: 'Add bin field to package.json pointing to your CLI entry.',
    };
  } catch {
    return { layer: 'out-of-box', id: 'bin-field', description: 'package.json has bin field', status: 'skip', detail: 'package.json not found' };
  }
}

function checkFirstUseExamples(root: string): CommercializationCheckItem {
  try {
    const content = readFileSync(path.join(root, 'README.md'), 'utf-8');
    const hasCodeBlock = /```/.test(content);
    return {
      layer: 'out-of-box',
      id: 'first-use-examples',
      description: 'README contains code examples for first-time use',
      status: hasCodeBlock ? 'pass' : 'warn',
      detail: hasCodeBlock ? undefined : 'No code blocks (```) found in README',
      suggestion: 'Add code examples showing basic usage in README.',
    };
  } catch {
    return { layer: 'out-of-box', id: 'first-use-examples', description: 'README contains code examples', status: 'skip', detail: 'README.md not found' };
  }
}

function checkExternalDependencyGuide(root: string): CommercializationCheckItem {
  try {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf-8')) as Record<string, Record<string, string> | undefined>;
    const peerDeps = pkg['peerDependencies'];
    if (!peerDeps || Object.keys(peerDeps).length === 0) {
      return { layer: 'out-of-box', id: 'external-dependency-guide', description: 'README documents external (peer) dependencies', status: 'skip', detail: 'No peerDependencies in package.json' };
    }
    const readme = readFileSync(path.join(root, 'README.md'), 'utf-8');
    const peerNames = Object.keys(peerDeps);
    const missing = peerNames.filter((name) => !readme.includes(name));
    return {
      layer: 'out-of-box',
      id: 'external-dependency-guide',
      description: 'README documents external (peer) dependencies',
      status: missing.length === 0 ? 'pass' : 'warn',
      detail: missing.length > 0 ? `Peer dependencies not mentioned in README: ${missing.join(', ')}` : undefined,
      suggestion: 'Document peer dependency setup instructions in README.',
    };
  } catch {
    return { layer: 'out-of-box', id: 'external-dependency-guide', description: 'README documents external dependencies', status: 'skip', detail: 'package.json or README.md not found' };
  }
}

function checkNpmInstallGuide(root: string): CommercializationCheckItem {
  try {
    const content = readFileSync(path.join(root, 'README.md'), 'utf-8');
    const hasInstall = /npm\s+install|npx|yarn\s+add|pnpm\s+add/i.test(content);
    return {
      layer: 'out-of-box',
      id: 'npm-install-guide',
      description: 'README contains npm install instructions',
      status: hasInstall ? 'pass' : 'warn',
      detail: hasInstall ? undefined : 'README does not mention npm install / npx / yarn add',
      suggestion: 'Add installation instructions to README (npm install <package>).',
    };
  } catch {
    return {
      layer: 'out-of-box',
      id: 'npm-install-guide',
      description: 'README contains npm install instructions',
      status: 'skip',
      detail: 'README.md not found',
    };
  }
}

// ── Helpers ──

function checkPkgScript(root: string, script: string, layer: CommercializationCheckLayer, id: string, desc: string): CommercializationCheckItem {
  try {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf-8')) as Record<string, Record<string, string> | undefined>;
    const has = !!(pkg['scripts']?.[script]);
    return {
      layer, id, description: desc,
      status: has ? 'pass' : 'warn',
      detail: has ? undefined : `No "${script}" script in package.json`,
      suggestion: `Add a "${script}" script to package.json.`,
    };
  } catch {
    return { layer, id, description: desc, status: 'skip', detail: 'package.json not found' };
  }
}

function scanFiles(root: string, extensions: string[], patterns: RegExp[], maxDepth = 10): string[] {
  const violations: string[] = [];
  const files = collectFiles(root, extensions, maxDepth, violations);
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    const matched = patterns.some((p) => { const r = p.test(content); p.lastIndex = 0; return r; });
    if (matched) violations.push(path.relative(root, file));
  }
  return violations;
}

function collectFiles(dir: string, extensions: string[], maxDepth = 10, truncations: string[] = []): string[] {
  const results: string[] = [];
  const skipDirs = new Set(['node_modules', '.git', 'dist', 'build']);
  const rootDir = dir;
  const walk = (d: string, depth: number): void => {
    if (depth > maxDepth) {
      truncations.push(`扫描截断: ${path.relative(rootDir, d) || '.'} exceeded maxDepth=${maxDepth}`);
      return;
    }
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!skipDirs.has(e.name)) walk(p, depth + 1); continue; }
      if (extensions.some((ext) => e.name.endsWith(ext))) results.push(p);
    }
  };
  walk(dir, 0);
  return results;
}

function collectImports(root: string, maxDepth = 10): string[] {
  const imports = new Set<string>();
  const truncations: string[] = [];
  const files = collectFiles(root, ['.ts', '.js', '.mjs'], maxDepth, truncations);
  const importPattern = /(?:from\s+|import\s*\(?\s*|require\s*\(\s*)['"]([^'"./][^'"]*)['"]/g;
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    for (const match of content.matchAll(importPattern)) {
      const pkg = match[1]!;
      // Extract package name (handle scoped packages)
      const parts = pkg.split('/');
      const name = pkg.startsWith('@') && parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0]!;
      imports.add(name);
    }
  }
  if (truncations.length > 0) imports.add(`扫描截断: ${truncations.length} directories exceeded maxDepth=${maxDepth}`);
  return Array.from(imports);
}

function fmtList(items: string[], max = 5): string {
  const shown = items.slice(0, max).join(', ');
  return items.length > max ? `${shown} (+${items.length - max} more)` : shown;
}

// ── Main Gate Class ──

export class CommercializationGate
  implements Stage<CommercializationGateInput, CommercializationGateOutput>
{
  readonly stageId: StageId = 'publish-generalization-gate' as StageId;
  private readonly now: () => string;

  static shouldActivate(config: CommercializationGateActivationConfig): boolean {
    return hasPublishTarget(config.publishTarget);
  }

  constructor(private readonly options: { now?: () => string } = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  shouldActivate(config: CommercializationGateActivationConfig): boolean {
    return CommercializationGate.shouldActivate(config);
  }

  /** Run all five layers of checks (AC-4.32b). Supports incremental re-run via input.layers (AC-4.32k). */
  runAllChecks(input: CommercializationGateInput): CommercializationCheckItem[] {
    const activeLayers = new Set(input.layers ?? ALL_LAYERS);
    const items: CommercializationCheckItem[] = [];

    if (activeLayers.has('code-cleanliness')) {
      items.push(
        checkHardcodedPaths(input.projectRoot),
        checkInternalReferences(input.projectRoot),
        checkConsoleResiduals(input.projectRoot),
        checkTodoResiduals(input.projectRoot),
        checkConfigExternalization(input.projectRoot),
        checkSensitiveInfo(input.projectRoot),
        checkDependencyCompleteness(input.projectRoot),
      );
    }

    if (activeLayers.has('package-integrity')) {
      items.push(
        checkPackageJsonRequiredFields(input.projectRoot),
        checkEntryFileExists(input.projectRoot),
        checkTsconfigExists(input.projectRoot),
        checkGitignore(input.projectRoot),
        checkNpmPackageFiles(input.projectRoot),
        checkDependencyVersionSafety(input.projectRoot),
      );
    }

    if (activeLayers.has('documentation')) {
      items.push(
        checkReadmeQuality(input.projectRoot),
        checkReadmeQuickStart(input.projectRoot),
        checkLicenseExists(input.projectRoot),
        checkChangelogExists(input.projectRoot),
        checkConfigDocumentation(input.projectRoot),
      );
    }

    if (activeLayers.has('error-handling')) {
      items.push(checkErrorHandlingCoverage(input.projectRoot));
    }

    if (activeLayers.has('buildability')) {
      items.push(
        checkBuildScript(input.projectRoot),
        checkTestScript(input.projectRoot),
        checkTsconfigOutDir(input.projectRoot),
        checkCliHelpEntry(input.projectRoot),
      );
    }

    if (activeLayers.has('out-of-box')) {
      items.push(
        checkBinField(input.projectRoot, input.isCli ?? false),
        checkNpmInstallGuide(input.projectRoot),
        checkFirstUseExamples(input.projectRoot),
        checkExternalDependencyGuide(input.projectRoot),
      );
    }

    return items;
  }

  /** Legacy runChecks for backward compatibility */
  runChecks(input: CommercializationGateInput): PublishCheckResult[] {
    const items = this.runAllChecks(input);
    return items.map((item) => ({
      id: item.id,
      passed: item.status === 'pass' || item.status === 'warn' || item.status === 'skip',
      reason: item.detail,
    }));
  }

  recordSkip(ledger: {
    append?: (entry: Record<string, unknown>) => Promise<void> | void;
    appendFilePath?: string;
    records?: Record<string, unknown>[];
  }): void {
    const entry = {
      stageId: this.stageId,
      conclusion: 'skipped',
      reason: 'User proactively skipped commercialization gate',
      recordedAt: this.now(),
    };
    if (typeof ledger.append === 'function') { void ledger.append(entry); return; }
    if (Array.isArray(ledger.records)) { ledger.records.push(entry); return; }
    if (ledger.appendFilePath) {
      mkdirSync(path.dirname(ledger.appendFilePath), { recursive: true });
      appendFileSync(ledger.appendFilePath, JSON.stringify(entry) + '\n', 'utf-8');
    }
  }

  async execute(input: CommercializationGateInput): Promise<CommercializationGateOutput> {
    const timestamp = this.now();

    // AC-4.32d: skip support
    if (!input.userConfirmed) {
      const skippedReason = 'User proactively skipped commercialization gate';
      const emptyLayers = this.emptyLayers();
      const result: CommercializationGateResult = {
        passed: false,
        layers: emptyLayers,
        summary: { totalChecks: 0, passed: 0, failed: 0, warned: 0, skipped: 0 },
        skippedReason,
      };
      const legacyResult: PublishGateResult = { conclusion: 'skipped', checks: [], failedChecks: [], skippedReason };

      await input.onSkip?.({
        taskId: input.taskId,
        pipelineId: input.pipelineId,
        projectRoot: input.projectRoot,
        publishTarget: input.publishTarget,
        reason: skippedReason,
        stageId: 'publish-generalization-gate',
        skippedAt: timestamp,
      });

      const artifact = this.writeArtifact(input, result, timestamp);
      return {
        result,
        legacyResult,
        metadata: { publishTarget: input.publishTarget, totalChecks: 0, passed: 0, failed: 0, warned: 0, skipped: 0, evaluatedAt: timestamp },
        artifact,
      };
    }

    // AC-4.32b: execute() always runs all five layers (full gate evaluation).
    // For incremental re-run (AC-4.32k), call runAllChecks() directly with specific layers.
    const items = this.runAllChecks({ ...input, layers: undefined });
    const layers = this.groupByLayer(items);
    const summary = this.summarize(items);
    const passed = summary.failed === 0;
    const result: CommercializationGateResult = { passed, layers, summary };

    // Legacy result for backward compat
    const legacyChecks: PublishCheckResult[] = items.map((i) => ({
      id: i.id,
      passed: i.status === 'pass' || i.status === 'warn' || i.status === 'skip',
      reason: i.detail,
    }));
    const legacyFailed = legacyChecks.filter((c) => !c.passed);
    const legacyResult: PublishGateResult = {
      conclusion: legacyFailed.length === 0 ? 'passed' : 'blocked',
      checks: legacyChecks,
      failedChecks: legacyFailed,
    };

    const artifact = this.writeArtifact(input, result, timestamp);
    return {
      result,
      legacyResult,
      metadata: { publishTarget: input.publishTarget, ...summary, evaluatedAt: timestamp },
      artifact,
    };
  }

  private emptyLayers(): Record<CommercializationCheckLayer, CommercializationCheckItem[]> {
    return {
      'code-cleanliness': [],
      'package-integrity': [],
      'documentation': [],
      'buildability': [],
      'out-of-box': [],
      'error-handling': [],
    };
  }

  private groupByLayer(items: CommercializationCheckItem[]): Record<CommercializationCheckLayer, CommercializationCheckItem[]> {
    const layers = this.emptyLayers();
    for (const item of items) layers[item.layer].push(item);
    return layers;
  }

  private summarize(items: CommercializationCheckItem[]): CommercializationGateSummary {
    let passed = 0, failed = 0, warned = 0, skipped = 0;
    for (const item of items) {
      if (item.status === 'pass') passed++;
      else if (item.status === 'fail') failed++;
      else if (item.status === 'warn') warned++;
      else skipped++;
    }
    return { totalChecks: items.length, passed, failed, warned, skipped };
  }

  private writeArtifact(
    input: CommercializationGateInput,
    result: CommercializationGateResult,
    timestamp: string,
  ): ArtifactRef {
    const basePath = input.artifactBasePath ?? path.join(input.projectRoot, '.sevo', input.taskId);
    mkdirSync(basePath, { recursive: true });
    const filePath = path.join(basePath, 'commercialization-gate.json');
    writeFileSync(filePath, JSON.stringify({ result, evaluatedAt: timestamp }, null, 2), 'utf-8');
    return { path: filePath, type: 'commercialization-gate-result', id: `${input.taskId}:comm-gate`, createdAt: timestamp };
  }
}

/** @deprecated Use CommercializationGate */
export const PublishGeneralizationGate = CommercializationGate;
