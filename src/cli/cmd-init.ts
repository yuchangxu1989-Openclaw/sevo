/**
 * sevo init — environment detection, config creation, doctor check.
 */

import type { Command } from 'commander';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { mergeConfig } from '../config.js';
import type { RoleAssignmentConfig, SevoConfig } from '../config.js';
import type { PipelineRole } from '../role-registry/index.js';
import { setupWorkspaceIsolation } from '../evaluators/workspace-isolation.js';
import { DEFAULT_STAGES } from '../constants.js';
import { CONFIG_FILE } from './helpers.js';
import { resolveOpenclawConfigPath } from '../utils/path-defaults.js';

// ── Init detection helpers ───────────────────────────────────────

export type HostAdapter = 'openclaw' | 'standalone';
export type ProjectKind = 'monorepo' | 'single-package' | 'generic';
export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun' | 'unknown';

export interface ToolCheck {
  name: 'node' | 'npm' | 'git' | 'vitest';
  ok: boolean;
  version: string;
  message: string;
}

export interface ProjectProfile {
  kind: ProjectKind;
  packageManager: PackageManager;
  hasPackageJson: boolean;
  hasCi: boolean;
  ciProviders: string[];
}

export interface InitInspection {
  adapter: HostAdapter;
  tools: ToolCheck[];
  project: ProjectProfile;
}

const MIN_NODE_MAJOR = 18;
const TEMPLATE_CONFIG_FILE = 'sevo.config.ts';

const CI_MARKERS: Array<{ file: string; label: string }> = [
  { file: '.github/workflows', label: 'GitHub Actions' },
  { file: '.gitlab-ci.yml', label: 'GitLab CI' },
  { file: '.circleci/config.yml', label: 'CircleCI' },
  { file: 'azure-pipelines.yml', label: 'Azure Pipelines' },
  { file: '.travis.yml', label: 'Travis CI' },
  { file: 'Jenkinsfile', label: 'Jenkins' },
];

function readJsonIfExists(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hasWorkspaceConfig(pkg: Record<string, unknown> | null): boolean {
  if (!pkg) return false;
  const workspaces = pkg.workspaces;
  if (Array.isArray(workspaces) && workspaces.length > 0) return true;
  if (
    workspaces
    && typeof workspaces === 'object'
    && Array.isArray((workspaces as { packages?: unknown[] }).packages)
    && ((workspaces as { packages?: unknown[] }).packages?.length ?? 0) > 0
  ) {
    return true;
  }
  return false;
}

export function detectHostAdapter(projectRoot: string): HostAdapter {
  const workspaceMarker = `${path.sep}.openclaw${path.sep}workspace`;
  const localOpenClawConfig = path.join(projectRoot, '.openclaw', 'openclaw.json');

  if (
    process.env.OPENCLAW_SESSION_ID
    || process.env.OPENCLAW_WORKSPACE
    || fs.existsSync(localOpenClawConfig)
    || projectRoot.includes(workspaceMarker)
  ) {
    return 'openclaw';
  }

  return 'standalone';
}

export function inspectBinary(
  command: string,
  args: string[] = ['--version'],
): { ok: boolean; version: string; error?: string } {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) {
    return {
      ok: false,
      version: 'not found',
      error: result.error.message,
    };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      version: 'unavailable',
      error: (result.stderr || result.stdout || `exit ${result.status}`).trim(),
    };
  }

  const version = (result.stdout || result.stderr || '').trim().split('\n')[0]?.trim() || 'unknown';
  return { ok: true, version };
}

export function detectProjectProfile(projectRoot: string): ProjectProfile {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  const packageJson = readJsonIfExists(packageJsonPath);
  const hasPackageJson = packageJson !== null;

  const monorepo = hasWorkspaceConfig(packageJson)
    || fs.existsSync(path.join(projectRoot, 'pnpm-workspace.yaml'))
    || fs.existsSync(path.join(projectRoot, 'lerna.json'))
    || fs.existsSync(path.join(projectRoot, 'nx.json'))
    || fs.existsSync(path.join(projectRoot, 'turbo.json'));

  let packageManager: PackageManager = 'unknown';
  const packageManagerField = typeof packageJson?.packageManager === 'string'
    ? packageJson.packageManager
    : null;

  if (packageManagerField) {
    if (packageManagerField.startsWith('pnpm@')) packageManager = 'pnpm';
    else if (packageManagerField.startsWith('yarn@')) packageManager = 'yarn';
    else if (packageManagerField.startsWith('bun@')) packageManager = 'bun';
    else if (packageManagerField.startsWith('npm@')) packageManager = 'npm';
  } else if (fs.existsSync(path.join(projectRoot, 'pnpm-lock.yaml'))) {
    packageManager = 'pnpm';
  } else if (fs.existsSync(path.join(projectRoot, 'yarn.lock'))) {
    packageManager = 'yarn';
  } else if (fs.existsSync(path.join(projectRoot, 'bun.lockb')) || fs.existsSync(path.join(projectRoot, 'bun.lock'))) {
    packageManager = 'bun';
  } else if (hasPackageJson || fs.existsSync(path.join(projectRoot, 'package-lock.json'))) {
    packageManager = 'npm';
  }

  const ciProviders = CI_MARKERS
    .filter((marker) => fs.existsSync(path.join(projectRoot, marker.file)))
    .map((marker) => marker.label);

  return {
    kind: monorepo ? 'monorepo' : (hasPackageJson ? 'single-package' : 'generic'),
    packageManager,
    hasPackageJson,
    hasCi: ciProviders.length > 0,
    ciProviders,
  };
}

export function inspectEnvironment(
  projectRoot: string,
  adapterOverride?: HostAdapter,
): InitInspection {
  const nodeMajor = Number.parseInt(process.version.replace(/^v/, '').split('.')[0] || '0', 10);
  const nodeOk = Number.isFinite(nodeMajor) && nodeMajor >= MIN_NODE_MAJOR;
  const npm = inspectBinary('npm');
  const git = inspectBinary('git');
  const vitestBin = path.join(projectRoot, 'node_modules', '.bin', 'vitest');
  const vitestOk = fs.existsSync(vitestBin);

  return {
    adapter: adapterOverride ?? detectHostAdapter(projectRoot),
    tools: [
      {
        name: 'node',
        ok: nodeOk,
        version: process.version,
        message: nodeOk
          ? `Node.js meets SEVO requirement (>= ${MIN_NODE_MAJOR})`
          : `Node.js ${process.version} is below required version >= ${MIN_NODE_MAJOR}`,
      },
      {
        name: 'npm',
        ok: npm.ok,
        version: npm.version,
        message: npm.ok ? 'npm is available' : `npm unavailable: ${npm.error || 'not found'}`,
      },
      {
        name: 'git',
        ok: git.ok,
        version: git.version,
        message: git.ok ? 'git is available' : `git unavailable: ${git.error || 'not found'}`,
      },
      {
        name: 'vitest',
        ok: vitestOk,
        version: vitestOk ? 'installed' : 'not found',
        message: vitestOk
          ? 'vitest is available — regression stage will run.'
          : 'vitest not installed. Stage 9 (regression) will fail until you run: npm install --save-dev vitest',
      },
    ],
    project: detectProjectProfile(projectRoot),
  };
}

export function generateSevoConfigTemplate(
  projectName: string,
  config: SevoConfig,
  inspection: InitInspection,
): string {
  const generatedAt = new Date().toISOString();
  const ci = inspection.project.ciProviders.length > 0
    ? inspection.project.ciProviders.join(', ')
    : 'none detected';

  return [
    '/**',
    ' * SEVO onboarding template.',
    ` * Generated by \`sevo init\` on ${generatedAt}.`,
    ` * Host adapter: ${inspection.adapter}.`,
    ` * Detected project type: ${inspection.project.kind}.`,
    ` * Detected package manager: ${inspection.project.packageManager}.`,
    ` * Existing CI: ${ci}.`,
    ` * Runtime config lives in ${CONFIG_FILE}; keep this file as your editable template.`,
    ' */',
    '',
    'export default ',
    `${JSON.stringify(config, null, 2)} as const;`,
    '',
  ].join('\n');
}


export function registerPdcaCheckSchedule(
  projectRoot: string,
  cronExpression = '0 6 * * *',
  enabled = true,
): { registered: boolean; warning?: string; entry?: string } {
  const entry = `${cronExpression} cd ${projectRoot} && sevo check --output .sevo/pdca-check-report.json >> .sevo/pdca-check.log 2>&1 # SEVO_PDCA_CHECK`;
  if (!enabled) return { registered: false, entry };

  const schedulerPath = path.join(projectRoot, '.sevo', 'pdca-cron');
  try {
    fs.mkdirSync(path.dirname(schedulerPath), { recursive: true });
    fs.writeFileSync(schedulerPath, `${entry}\n`, 'utf8');

    const current = spawnSync('crontab', ['-l'], { encoding: 'utf8' });
    if (current.status === 0 || current.status === 1) {
      const existing = current.status === 0 ? current.stdout : '';
      const lines = existing.split('\n').filter((line) => !line.includes('SEVO_PDCA_CHECK'));
      lines.push(entry);
      const install = spawnSync('crontab', ['-'], {
        input: `${lines.filter(Boolean).join('\n')}\n`,
        encoding: 'utf8',
      });
      if (install.status === 0) return { registered: true, entry };
      return { registered: false, warning: install.stderr || 'crontab install failed', entry };
    }

    return { registered: false, warning: current.stderr || 'crontab unavailable', entry };
  } catch (err) {
    return { registered: false, warning: err instanceof Error ? err.message : String(err), entry };
  }
}

function writeTemplateConfig(
  projectRoot: string,
  projectName: string,
  config: SevoConfig,
  inspection: InitInspection,
  force: boolean,
): { written: boolean; skipped: boolean } {
  const templatePath = path.join(projectRoot, TEMPLATE_CONFIG_FILE);

  if (fs.existsSync(templatePath) && !force) {
    return { written: false, skipped: true };
  }

  fs.writeFileSync(
    templatePath,
    generateSevoConfigTemplate(projectName, config, inspection),
    'utf8',
  );

  return { written: true, skipped: false };
}

function printWelcome(projectName: string): void {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║ Welcome to SEVO                             ║');
  console.log(`║ Project: ${projectName.padEnd(31).slice(0, 31)}║`);
  console.log('╚══════════════════════════════════════════════╝');
}

function printInspection(inspection: InitInspection): void {
  console.log('\nEnvironment check:');
  for (const tool of inspection.tools) {
    const icon = tool.ok ? '✅' : '⚠️';
    console.log(`  ${icon} ${tool.name}: ${tool.version}`);
    console.log(`     ${tool.message}`);
  }

  console.log('\nProject scan:');
  console.log(`  • Host adapter: ${inspection.adapter}`);
  console.log(`  • Project type: ${inspection.project.kind}`);
  console.log(`  • Package manager: ${inspection.project.packageManager}`);
  console.log(`  • Existing package.json: ${inspection.project.hasPackageJson ? 'yes' : 'no'}`);
  console.log(`  • Existing CI: ${inspection.project.hasCi ? inspection.project.ciProviders.join(', ') : 'none detected'}`);
}

function printFirstRunGuide(inspection: InitInspection): void {
  const missingTools = inspection.tools.filter((tool) => !tool.ok).map((tool) => tool.name);

  console.log('\nFirst-run guide:');
  console.log(`  1. Review ${CONFIG_FILE} for runtime defaults.`);
  console.log(`  2. Review ${TEMPLATE_CONFIG_FILE} for an editable template tuned to this repo.`);
  console.log('  3. Run "sevo doctor" to verify the environment end-to-end.');
  console.log('  4. Run "sevo list" to inspect the sample project that was generated.');
  console.log('  5. Create your first real project:');
  console.log('     sevo project create my-first-project --description "What you want to build"');
  console.log('  6. Start the first pipeline by adding an FR:');
  console.log('     sevo fr add my-first-project "Ship the first user-visible feature"');

  if (inspection.project.kind === 'monorepo') {
    console.log('  7. Monorepo tip: start with one leaf package first, then expand stage coverage repo-wide.');
  } else if (inspection.project.kind === 'single-package') {
    console.log('  7. Single-package tip: wire one small FR first so you can validate the full loop quickly.');
  } else {
    console.log('  7. Greenfield tip: start from the generated example project, then replace it with your own spec.');
  }

  if (inspection.project.hasCi) {
    console.log('  8. CI detected: keep your existing pipeline; let SEVO manage requirements, gates, and evidence.');
  }

  if (missingTools.length > 0) {
    console.log(`\nWarnings to fix before real usage: missing ${missingTools.join(', ')}.`);
  }
}

// ── AC-14.13: ACP Agent Detection & Prompt Injection ────────────

interface AcpAgentDetection {
  name: string;
  /** File/directory that indicates this ACP agent is present. */
  detectPaths: string[];
  /** Config file to generate for persistent prompt injection. */
  configFile: string;
  /** Directory to create (if needed). */
  configDir?: string;
}

const ACP_AGENTS: AcpAgentDetection[] = [
  {
    name: 'Claude Code',
    detectPaths: ['.claude', '.claude/settings.json'],
    configFile: '.claude/CLAUDE.md',
    configDir: '.claude',
  },
  {
    name: 'Codex',
    detectPaths: ['codex.md', '.codex'],
    configFile: 'codex.md',
  },
  {
    name: 'OpenCode',
    detectPaths: ['.opencode', '.opencode/agents.md'],
    configFile: '.opencode/agents.md',
    configDir: '.opencode',
  },
  {
    name: 'Gemini CLI',
    detectPaths: ['.gemini', '.gemini/settings.json'],
    configFile: '.gemini/GEMINI.md',
    configDir: '.gemini',
  },
];

function detectAcpAgents(projectRoot: string): AcpAgentDetection[] {
  const detected: AcpAgentDetection[] = [];
  for (const agent of ACP_AGENTS) {
    const found = agent.detectPaths.some((p) =>
      fs.existsSync(path.join(projectRoot, p)),
    );
    if (found) {
      detected.push(agent);
    }
  }
  return detected;
}

function generatePromptInjection(projectName: string): string {
  return [
    `# SEVO Pipeline Rules — ${projectName}`,
    '',
    '## Role Constraints',
    '- Follow SEVO pipeline stage sequence; do not skip stages.',
    '- Each stage has defined inputs and outputs; verify before advancing.',
    '- Gate evaluations must pass before proceeding to the next stage.',
    '',
    '## Project Context',
    `- Project: ${projectName}`,
    `- Config: ${CONFIG_FILE}`,
    '- Artifacts: artifacts/',
    '- Specs: specs/',
    '',
    '## Workflow',
    '1. Read the current pipeline state before taking action.',
    '2. Complete the current stage\'s requirements fully.',
    '3. Run `sevo status` to verify stage completion.',
    '4. Use `sevo advance` to move to the next stage.',
    '',
    '_Auto-generated by `sevo init`. Edit as needed._',
    '',
  ].join('\n');
}

function writeAcpConfigs(projectRoot: string, projectName: string, detected: AcpAgentDetection[]): string[] {
  const written: string[] = [];
  const content = generatePromptInjection(projectName);

  for (const agent of detected) {
    const configPath = path.join(projectRoot, agent.configFile);
    // Don't overwrite existing config files
    if (fs.existsSync(configPath)) {
      continue;
    }
    if (agent.configDir) {
      const dirPath = path.join(projectRoot, agent.configDir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    }
    fs.writeFileSync(configPath, content, 'utf8');
    written.push(agent.configFile);
  }
  return written;
}

/**
 * AC-23.6: Copy built-in evaluators to project evaluators/ directory.
 * Built-in evaluators ship with the sevo npm package.
 */
function copyBuiltinEvaluators(projectRoot: string): void {
  const evaluatorsDir = path.join(projectRoot, 'evaluators');
  if (!fs.existsSync(evaluatorsDir)) {
    fs.mkdirSync(evaluatorsDir, { recursive: true });
  }

  // Built-in evaluators are located next to the CLI package entry.
  // At runtime: lib/cli/cmd-init.js → lib/evaluators/builtins/
  // At source: src/cli/cmd-init.ts → src/evaluators/builtins/
  const currentDir = import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));
  const builtinsDir = path.join(currentDir, '..', 'evaluators', 'builtins');

  if (!fs.existsSync(builtinsDir)) {
    console.log('  Built-in evaluators directory not found; skipping copy.');
    return;
  }

  const builtinFiles = fs.readdirSync(builtinsDir).filter(
    (f) => /\.(sh|js|py)$/.test(f),
  );

  let copied = 0;
  for (const file of builtinFiles) {
    const src = path.join(builtinsDir, file);
    const dest = path.join(evaluatorsDir, file);

    // Don't overwrite user-modified evaluators
    if (fs.existsSync(dest)) continue;

    fs.copyFileSync(src, dest);

    // Preserve executable permission for shell scripts
    if (file.endsWith('.sh')) {
      fs.chmodSync(dest, 0o755);
    }
    copied++;
  }

  if (copied > 0) {
    console.log(`  Copied ${copied} built-in evaluator(s) to evaluators/`);
  } else if (builtinFiles.length > 0) {
    console.log('  Built-in evaluators already exist in evaluators/, skipped.');
  }
}

function generateExampleProject(projectRoot: string, _parentName: string): void {
  const slug = 'example-todo-app';
  const projectDir = path.join(projectRoot, 'projects', slug);
  const specsDir = path.join(projectRoot, 'specs');
  const pipelinesDir = path.join(projectRoot, 'pipelines');

  // Skip if example already exists
  if (fs.existsSync(path.join(projectDir, 'project.json'))) return;

  // 1. Project metadata (for `sevo list`)
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, 'project.json'),
    JSON.stringify({
      name: slug,
      description: 'A simple TODO app — example project generated by sevo init',
      createdAt: new Date().toISOString(),
    }, null, 2) + '\n',
  );

  // 2. Example spec
  const specContent = `# TODO App — Product Requirements

## Overview
A minimal command-line TODO application that demonstrates the SEVO pipeline.
Users can add, list, complete, and delete tasks stored in a local JSON file.

## Functional Requirements

### FR-01: Add Task
- User runs \`todo add "Buy groceries"\`
- System creates a task with auto-incremented ID, title, status=pending, createdAt timestamp
- System confirms: "Task #1 added."

### FR-02: List Tasks
- User runs \`todo list\`
- System displays all tasks in a table: ID | Status | Title | Created
- Pending tasks show \`[ ]\`, completed tasks show \`[x]\`

### FR-03: Complete Task
- User runs \`todo done 1\`
- System marks task #1 as completed with a completedAt timestamp
- System confirms: "Task #1 completed."
- Error if task ID does not exist

### FR-04: Delete Task
- User runs \`todo delete 1\`
- System removes task #1 from storage
- System confirms: "Task #1 deleted."
- Error if task ID does not exist

## Non-Functional Requirements

### NFR-01: Storage
- Tasks stored in \`./todo-data.json\` (human-readable JSON)
- File created automatically on first use

### NFR-02: Zero Dependencies
- CLI built with Node.js standard library only
- No external npm packages required

## Acceptance Criteria
- AC-01: \`todo add\` + \`todo list\` round-trip works
- AC-02: \`todo done\` changes status and shows in list
- AC-03: \`todo delete\` removes task from list
- AC-04: Error messages for invalid task IDs
`;
  fs.writeFileSync(path.join(specsDir, 'example-todo-app.md'), specContent);
  console.log('  Generated specs/example-todo-app.md');

  // 3. Example pipeline
  const pipelineContent = JSON.stringify({
    pipelineId: `${slug}-pipeline`,
    instanceId: `${slug}-001`,
    projectSlug: slug,
    status: 'pending',
    currentStage: 'spec',
    createdAt: new Date().toISOString(),
    stages: [
      { name: 'spec', status: 'completed' },
      { name: 'contract', status: 'pending' },
      { name: 'implement', status: 'pending' },
      { name: 'review', status: 'pending' },
      { name: 'deploy', status: 'pending' },
    ],
  }, null, 2) + '\n';
  fs.writeFileSync(path.join(pipelinesDir, 'example-todo-app.json'), pipelineContent);
  console.log('  Generated pipelines/example-todo-app.json');
  console.log(`  Example project "${slug}" ready — run "sevo list" to see it.`);
}

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Initialize SEVO in the current directory')
    .option('-n, --name <name>', 'Project name', path.basename(process.cwd()))
    .option('--adapter <type>', 'Host adapter type (auto-detected if omitted)')
    .option('--force', 'Overwrite existing config', false)
    .action((opts: { name: string; adapter?: string; force: boolean }) => {
      const configPath = path.join(process.cwd(), CONFIG_FILE);

      if (fs.existsSync(configPath) && !opts.force) {
        console.error(`${CONFIG_FILE} already exists. Use --force to overwrite.`);
        process.exitCode = 1;
        return;
      }

      const adapter = (opts.adapter as HostAdapter | undefined) ?? detectHostAdapter(process.cwd());
      const inspection = inspectEnvironment(process.cwd(), adapter);

      printWelcome(opts.name);
      printInspection(inspection);

      const availableAgents = detectAvailableAgents(process.cwd());

      // AC-14F.1/AC-14F.2: Single Agent short-circuit — auto-assign all roles
      if (availableAgents.length === 0) {
        console.log('\n未检测到已注册 Agent，已生成 self 占位角色。后续可在 sevo.json 手动替换。');
      } else if (availableAgents.length === 1) {
        const agentId = availableAgents[0]!.id;
        console.log(`\n检测到单 Agent 环境（${agentId}），已自动分配所有角色。流水线将以降级模式运行。`);
      }

      const config = mergeConfig({
        projectName: opts.name,
        adapter,
        stages: [...DEFAULT_STAGES],
        rules: [],
        roleAssignment: generateDefaultRoleAssignment(availableAgents),
        strictRoleMatching: false,
        pdcaCheck: { enabled: true, cron: '0 6 * * *' },
      });

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
      console.log(`\nCreated ${CONFIG_FILE} for project "${opts.name}".`);

      const templateResult = writeTemplateConfig(
        process.cwd(),
        opts.name,
        config,
        inspection,
        opts.force,
      );
      if (templateResult.written) {
        console.log(`Created ${TEMPLATE_CONFIG_FILE} onboarding template.`);
      } else if (templateResult.skipped) {
        console.log(`${TEMPLATE_CONFIG_FILE} already exists, skipped.`);
      }

      // Create standard directories (AC-24.1: includes evaluators/)
      const dirs = ['specs', 'contracts', 'artifacts', 'pipelines', 'projects', 'evaluators'];
      for (const dir of dirs) {
        const dirPath = path.join(process.cwd(), dir);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
          console.log(`  Created ${dir}/`);
        }
      }

      // Generate example project so `sevo list` shows something meaningful
      generateExampleProject(process.cwd(), opts.name);

      // AC-23.6: Copy built-in evaluators to project evaluators/ directory
      try {
        copyBuiltinEvaluators(process.cwd());
      } catch (err) {
        console.log(`\n  ⚠️  Could not copy built-in evaluators: ${(err as Error).message}`);
        console.log('     You can manually copy them later from the sevo package.');
      }

      const pdcaSchedule = registerPdcaCheckSchedule(process.cwd(), config.pdcaCheck?.cron, config.pdcaCheck?.enabled ?? true);
      if (pdcaSchedule.registered) {
        console.log('\nRegistered PDCA Check cron: daily 06:00.');
      } else if (pdcaSchedule.warning) {
        console.log(`
  ⚠️  Could not register PDCA Check cron: ${pdcaSchedule.warning}`);
        console.log('     A fallback entry was written to .sevo/pdca-cron.');
      }

      // AC-24.1 / AC-24.7: Setup workspace isolation
      const isolationStatus = setupWorkspaceIsolation(process.cwd());
      console.log('\nWorkspace isolation status:');
      for (const layer of isolationStatus.layers) {
        const icon = layer.active ? '✅' : '⚠️';
        console.log(`  ${icon} ${layer.layer}: ${layer.description}`);
        if (layer.warning) {
          console.log(`     Warning: ${layer.warning}`);
        }
      }

      // AC-14.13: Detect ACP agents and generate prompt injection configs
      const detected = detectAcpAgents(process.cwd());
      if (detected.length > 0) {
        console.log(`\nDetected ACP agents: ${detected.map((a) => a.name).join(', ')}`);
        const written = writeAcpConfigs(process.cwd(), opts.name, detected);
        for (const file of written) {
          console.log(`  Generated prompt injection: ${file}`);
        }
        if (written.length === 0) {
          console.log('  All prompt injection configs already exist, skipped.');
        }
      } else {
        console.log('\nNo ACP agents detected. Prompt injection configs can be added later.');
      }

      printFirstRunGuide(inspection);
      console.log('\nRun "sevo doctor" to verify your environment.');
    });
}

/**
 * Generate default role assignment table (AC-22.8/AC-22.9).
 * Provides a starting point that users can customize.
 */
export interface HostAgentInfo {
  id: string;
  name?: string;
  runtime?: string;
  description?: string;
  model?: string;
}

function findOpenClawConfig(projectRoot: string): string | null {
  if (process.env.OPENCLAW_CONFIG_PATH) {
    return process.env.OPENCLAW_CONFIG_PATH;
  }

  let dir = projectRoot;
  const root = path.parse(dir).root;
  while (dir !== root) {
    const candidate = path.join(dir, 'openclaw.json');
    if (fs.existsSync(candidate)) return candidate;
    const nested = path.join(dir, '.openclaw', 'openclaw.json');
    if (fs.existsSync(nested)) return nested;
    dir = path.dirname(dir);
  }

  return null;
}

function readAgentId(entry: unknown): string | null {
  if (typeof entry === 'string') return entry;
  if (!entry || typeof entry !== 'object') return null;
  const id = (entry as { id?: unknown }).id;
  return typeof id === 'string' && id.trim().length > 0 ? id : null;
}

function detectAvailableAgents(projectRoot: string): HostAgentInfo[] {
  const configPath = findOpenClawConfig(projectRoot);
  const parsed = configPath ? readJsonIfExists(configPath) : null;
  const list = (parsed?.agents as { list?: unknown } | undefined)?.list;
  if (!Array.isArray(list)) return [];

  const agents: HostAgentInfo[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    const id = readAgentId(entry);
    if (!id || id === 'main' || seen.has(id)) continue;
    seen.add(id);
    if (typeof entry === 'string') {
      agents.push({ id });
      continue;
    }
    const item = entry as Record<string, unknown>;
    agents.push({
      id,
      name: typeof item.name === 'string' ? item.name : undefined,
      runtime: typeof item.runtime === 'string' ? item.runtime : undefined,
      description: typeof item.description === 'string' ? item.description : undefined,
      model: typeof item.model === 'string' ? item.model : undefined,
    });
  }
  return agents;
}

/**
 * FR-14: Infer pipeline role from agent metadata using naming conventions + runtime/description hints.
 */
const ROLE_NAMING_PATTERNS: ReadonlyArray<{ pattern: RegExp; role: PipelineRole }> = [
  { pattern: /(^|[-_\s])(pm|product|prd)([-_\s]|$)/i, role: 'Product' },
  { pattern: /(^|[-_\s])(ux|design|designer)([-_\s]|$)/i, role: 'UX' },
  { pattern: /(^|[-_\s])(sa|arch|architect|architecture)([-_\s]|$)/i, role: 'Architect' },
  { pattern: /(^|[-_\s])(dev|code|coder|coding|engineer)([-_\s]|$)/i, role: 'Coder' },
  { pattern: /^free[-_]?code/i, role: 'Coder' },
  { pattern: /^(cc|codex|opencode|hermes)$/i, role: 'Coder' },
  { pattern: /(^|[-_\s])(audit|review|qa|quality)([-_\s]|$)/i, role: 'Auditor' },
];

function inferRoleFromAgent(agent: HostAgentInfo): PipelineRole {
  const haystack = [agent.id, agent.name, agent.runtime, agent.description, agent.model]
    .filter((value): value is string => Boolean(value))
    .join(' ');
  for (const { pattern, role } of ROLE_NAMING_PATTERNS) {
    if (pattern.test(haystack)) return role;
  }
  return 'Any';
}

function roleKey(role: PipelineRole): 'product' | 'ux' | 'architect' | 'coder' | 'auditor' | null {
  switch (role) {
    case 'Product': return 'product';
    case 'UX': return 'ux';
    case 'Architect': return 'architect';
    case 'Coder': return 'coder';
    case 'Auditor': return 'auditor';
    default: return null;
  }
}

function generateDefaultRoleAssignment(availableAgents: HostAgentInfo[] = []): RoleAssignmentConfig {
  const stageRoles: NonNullable<RoleAssignmentConfig['stageRoles']> = {
    'spec': 'Product',
    'spec-review-gate': 'Product',
    'commercial-acceptance-authoring': 'Product',
    'pm-commercial-review': 'Product',
    'ux-acceptance-authoring': 'UX',
    'ux-acceptance': 'UX',
    'contract': 'Architect',
    'contract-review-gate': 'Architect',
    'implement': 'Coder',
    'smoke-test': 'Coder',
    'test-case-authoring': 'Coder',
    'review': 'Auditor',
    'regression': 'Auditor',
    'publish-generalization-gate': 'Any',
    'deploy': 'Any',
    'verify': 'Any',
    'post-release-validation': 'Any',
    'ledger': 'Any',
  };

  if (availableAgents.length === 0) {
    return {
      agentRoles: { self: 'Any' },
      roles: {
        product: ['self'],
        ux: ['self'],
        architect: ['self'],
        coder: ['self'],
        auditor: ['self'],
      },
      stageRoles,
      autoFallback: true,
      fallbackAgentId: 'self',
    };
  }

  if (availableAgents.length === 1) {
    const onlyAgent = availableAgents[0]!.id;
    // AC-14F.3: All role pools filled with the same agentId; explicit role remains Any so doctor/dispatch detect single-agent mode.
    return {
      agentRoles: { [onlyAgent]: 'Any' },
      roles: {
        product: [onlyAgent],
        ux: [onlyAgent],
        architect: [onlyAgent],
        coder: [onlyAgent],
        auditor: [onlyAgent],
      },
      stageRoles,
      autoFallback: true,
      fallbackAgentId: onlyAgent,
    };
  }

  const agentRoles: Record<string, PipelineRole> = {};
  const roles: NonNullable<RoleAssignmentConfig['roles']> = {
    product: [],
    ux: [],
    architect: [],
    coder: [],
    auditor: [],
  };

  for (const agent of availableAgents) {
    const role = inferRoleFromAgent(agent);
    agentRoles[agent.id] = role;
    const key = roleKey(role);
    if (key) roles[key]?.push(agent.id);
  }

  const fallbackAgentId = availableAgents[0]!.id;
  let autoFallback = false;
  for (const key of ['product', 'ux', 'architect', 'coder', 'auditor'] as const) {
    if ((roles[key]?.length ?? 0) === 0) {
      roles[key] = [fallbackAgentId];
      autoFallback = true;
    }
  }

  return {
    agentRoles,
    roles,
    stageRoles,
    autoFallback,
    fallbackAgentId: autoFallback ? fallbackAgentId : undefined,
  };
}
