import * as fs from 'node:fs';
import * as path from 'node:path';

import type { RuntimeDomainCheck, RuntimeProjectType } from './types.js';

interface PackageJson {
  scripts?: Record<string, string>;
  bin?: string | Record<string, string>;
  main?: string;
  module?: string;
  name?: string;
}

interface SevoRuntimeConfig {
  runtimeChecks?: RuntimeDomainCheck[];
  scan?: { l3Checks?: RuntimeDomainCheck[] };
}

export function loadRuntimeChecks(projectRoot: string): RuntimeDomainCheck[] {
  const configChecks = readSevoRuntimeChecks(projectRoot);
  if (configChecks.length > 0) return normalizeChecks(configChecks);

  const pkg = readPackageJson(projectRoot);
  const checks: RuntimeDomainCheck[] = [];
  const cliBin = inferCliBin(pkg);

  if (cliBin) {
    checks.push(...buildCliRuntimeChecks(projectRoot, cliBin));
  }

  if (pkg?.scripts?.test) {
    checks.push({ domain: 'test-suite', type: 'cli', command: 'npm test' });
  }

  const libraryEntry = pkg?.main ?? pkg?.module;
  if (libraryEntry) {
    checks.push({ domain: 'library-entry', type: 'library', modulePath: libraryEntry });
  }

  if (fs.existsSync(path.join(projectRoot, 'openclaw.plugin.json'))) {
    checks.push({ domain: 'plugin-manifest', type: 'plugin', command: 'node -e "const fs=require(\'fs\'); const p=JSON.parse(fs.readFileSync(\'openclaw.plugin.json\',\'utf8\')); console.log(JSON.stringify({name:p.name, hooks:Object.keys(p.hooks||{}), commands:Object.keys(p.commands||{})}))"' });
  }

  return normalizeChecks(checks.length > 0 ? checks : [{
    domain: 'project-package',
    type: 'cli',
    command: 'node -e "const p=require(\'./package.json\'); console.log(JSON.stringify({name:p.name, version:p.version}))"',
  }]);
}

export function defaultRuntimeChecksForType(
  projectRoot: string,
  type: RuntimeProjectType,
  overrides?: { command?: string; url?: string; checks?: RuntimeDomainCheck[] },
): RuntimeDomainCheck[] {
  // Allow full override via checks parameter
  if (overrides?.checks && overrides.checks.length > 0) return normalizeChecks(overrides.checks);

  const configured = loadRuntimeChecks(projectRoot);
  if (configured.length > 0 && !overrides?.command && !overrides?.url) return configured;

  if (type === 'web') {
    return [{ domain: 'web-core', type: 'web', url: overrides?.url ?? 'http://127.0.0.1/' }];
  }

  if (type === 'library') {
    const pkg = readPackageJson(projectRoot);
    const entryModule = pkg?.main ?? pkg?.module ?? '.';
    return [
      { domain: 'library-entry', type: 'library', modulePath: entryModule },
      {
        domain: 'pack-install-import',
        type: 'cli',
        command: buildPackInstallImportCommand(projectRoot, entryModule),
        timeoutMs: 120_000,
      },
    ];
  }

  if (type === 'hook' || type === 'plugin') {
    return [{ domain: `${type}-core`, type, command: overrides?.command ?? 'node -e "console.log(JSON.stringify({ok:true}))"' }];
  }

  if (type === 'cli') {
    const pkg = readPackageJson(projectRoot);
    const cliBin = inferCliBin(pkg);
    if (cliBin && !overrides?.command) {
      return normalizeChecks(buildCliRuntimeChecks(projectRoot, cliBin));
    }
  }

  return [{ domain: 'runtime-core', type: 'cli', command: overrides?.command ?? 'npm --version' }];
}

function buildCliRuntimeChecks(
  projectRoot: string,
  cliBin: { name: string; entry: string },
): RuntimeDomainCheck[] {
  const quotedEntry = shellQuote(cliBin.entry);

  const checks: RuntimeDomainCheck[] = [
    {
      domain: 'cli-help',
      type: 'cli',
      command: buildHelpOutputCommand(quotedEntry),
      expectedExitCode: 0,
      outputValidator: /\{"help":true,"commands":/i,
    },
    {
      domain: 'cli-init',
      type: 'cli',
      command: buildInitExecutableCommand(projectRoot, cliBin.entry),
      expectedExitCode: 0,
      timeoutMs: 120_000,
    },
    {
      domain: 'cli-demo',
      type: 'cli',
      command: buildDemoProjectCommand(quotedEntry),
      expectedExitCode: 0,
      outputValidator: /\{"demo":true/i,
    },
    {
      domain: 'cli-core-commands',
      type: 'cli',
      command: buildCoreCommandsCheck(quotedEntry, projectRoot),
      expectedExitCode: 0,
    },
  ];

  return checks;
}

function buildCoreCommandsCheck(quotedEntry: string, projectRoot: string): string {
  const pkg = readPackageJson(projectRoot);
  const coreCommands = inferCoreCommands(pkg);
  if (coreCommands.length === 0) {
    return buildHelpOutputCommand(quotedEntry);
  }
  const checks = coreCommands.map(cmd => `node ${quotedEntry} ${cmd} --help`);
  return checks.join(' && ');
}

function inferCoreCommands(_pkg: PackageJson | null): string[] {
  return ['init', 'scan', 'demo', 'status', 'doctor', 'config'];
}

function buildHelpOutputCommand(quotedEntry: string): string {
  const assertion = [
    "let s=''; process.stdin.on('data', d => s += d);",
    "process.stdin.on('end', () => {",
    "const text=s.replace(/\\x1b\\[[0-9;]*m/g,'');",
    "if (!/Usage|Commands|Options|sevo/i.test(text)) {",
    "console.error('help output missing usage/command/options text'); process.exit(1);",
    '}',
    "const commandNames=['init','create','status','advance','doctor','config','demo','scan'];",
    "const commands=commandNames.filter(cmd => new RegExp('\\b'+cmd+'\\b').test(text));",
    "if (commands.length < 3) { console.error('help output exposes fewer than 3 core commands'); process.exit(1); }",
    "console.log(JSON.stringify({help:true, commands, chars:text.length}));",
    '})',
  ].join(' ');
  return `node ${quotedEntry} --help | node -e ${shellQuote(assertion)}`;
}

function buildInitExecutableCommand(projectRoot: string, entry: string): string {
  const absoluteEntry = shellQuote(path.resolve(projectRoot, entry));
  const assertion = [
    "const c=require('./sevo.json');",
    "if (c.projectName !== 'l3-runtime-check') process.exit(1);",
    "console.log(JSON.stringify({init:true, projectName:c.projectName}))",
  ].join(' ');
  return [
    'TMPDIR=$(mktemp -d /tmp/sevo-l3-init-XXXXXX)',
    'cd "$TMPDIR"',
    `node ${absoluteEntry} init --name l3-runtime-check --adapter standalone`,
    'test -f sevo.json',
    `node -e ${shellQuote(assertion)}`,
  ].join(' && ');
}

function buildDemoProjectCommand(quotedEntry: string): string {
  const assertion = [
    "let s=''; process.stdin.on('data', d => s += d);",
    "process.stdin.on('end', () => {",
    "const m=s.match(/Demo files saved to:\\s*(\\S+)/);",
    "if (!m) { console.error('demo output missing project path'); process.exit(1); }",
    "const fs=require('fs'), path=require('path');",
    "const dir=m[1]; const spec=path.join(dir,'specs','hello-sevo.md');",
    "const pm=s.match(/Pipeline:\\s*(demo-[a-z0-9]+)/); const pipeline=pm && pm[1];",
    "if (!pipeline || !fs.existsSync(spec) || !fs.readFileSync(spec,'utf8').includes('Acceptance Criteria')) process.exit(1);",
    "fs.rmSync(dir,{recursive:true,force:true});",
    "console.log(JSON.stringify({demo:true,pipeline,spec:true}));",
    '})',
  ].join(' ');
  return `node ${quotedEntry} demo --no-color | node -e ${shellQuote(assertion)}`;
}

/**
 * Build a shell command that packs the project, installs it in a temp dir,
 * and imports the main entry to verify clean-install works.
 */
function buildPackInstallImportCommand(projectRoot: string, entryModule: string): string {
  // The command:
  // 1. npm pack → produces a tarball
  // 2. Creates a temp dir, installs the tarball
  // 3. Imports the package entry to verify it loads
  const pkgPath = path.join(projectRoot, 'package.json');
  let pkgName = 'unknown';
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as PackageJson & { name?: string };
    pkgName = pkg.name ?? 'unknown';
  } catch { /* use fallback */ }

  return [
    'set -e',
    `cd ${shellQuote(projectRoot)}`,
    'TARBALL=$(npm pack --pack-destination /tmp 2>/dev/null | tail -1)',
    'TMPDIR=$(mktemp -d)',
    'cd "$TMPDIR"',
    'npm init -y > /dev/null 2>&1',
    'npm install "/tmp/$TARBALL" --no-audit --no-fund > /dev/null 2>&1',
    `node -e "import(${JSON.stringify(pkgName)}).then(m => { console.log(JSON.stringify({ok:true, exports:Object.keys(m).slice(0,10)})); }).catch(e => { console.error(e.message); process.exit(1); })"`,
    'rm -rf "$TMPDIR" "/tmp/$TARBALL"',
  ].join(' && ');
}

function readSevoRuntimeChecks(projectRoot: string): RuntimeDomainCheck[] {
  const candidates = [
    path.join(projectRoot, 'sevo.config.json'),
    path.join(projectRoot, 'package.json'),
  ];

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as SevoRuntimeConfig & { sevo?: SevoRuntimeConfig };
      const checks = parsed.runtimeChecks ?? parsed.scan?.l3Checks ?? parsed.sevo?.runtimeChecks ?? parsed.sevo?.scan?.l3Checks;
      if (Array.isArray(checks) && checks.length > 0) return checks;
    } catch { /* ignore invalid optional config */ }
  }

  return [];
}

function readPackageJson(projectRoot: string): PackageJson | null {
  const packagePath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(packagePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(packagePath, 'utf8')) as PackageJson;
  } catch {
    return null;
  }
}

function inferCliBin(pkg: PackageJson | null): { name: string; entry: string } | null {
  if (!pkg?.bin) return null;
  if (typeof pkg.bin === 'string') return { name: 'cli', entry: pkg.bin };
  const first = Object.entries(pkg.bin)[0];
  return first ? { name: first[0], entry: first[1] } : null;
}

function normalizeChecks(checks: RuntimeDomainCheck[]): RuntimeDomainCheck[] {
  return checks.map((check, index) => ({
    ...check,
    domain: check.domain || `runtime-${index + 1}`,
  }));
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
