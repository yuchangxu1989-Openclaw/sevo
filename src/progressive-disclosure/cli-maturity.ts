/**
 * CLI Progressive Disclosure — FR-15 command maturity helpers.
 *
 * The CLI keeps all commands executable for scripts/backward compatibility, but
 * help output is grouped by maturity so first-time users see the safe core path
 * first and advanced operations unlock after real usage signals appear.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export type CliMaturityLevel = 'new' | 'basic' | 'advanced';

export interface CliUsageSnapshot {
  projectRoot: string;
  initialized: boolean;
  pipelineCount: number;
  advancedUsageCount: number;
}

export interface CliCommandExposure {
  core: string[];
  basic: string[];
  advanced: string[];
  visible: string[];
  hidden: string[];
}

const CORE_COMMANDS = ['init', 'demo', 'doctor', 'create', 'list', 'status'];
const BASIC_COMMANDS = ['show', 'advance', 'fr', 'goal', 'from'];
const ADVANCED_COMMANDS = ['config', 'export', 'pause', 'resume', 'cancel', 'ledger', 'verify', 'scan', 'gate'];
const ADVANCED_USAGE_COMMANDS = new Set(ADVANCED_COMMANDS);

export function detectCliUsage(projectRoot: string = process.cwd()): CliUsageSnapshot {
  return {
    projectRoot,
    initialized: fs.existsSync(path.join(projectRoot, 'sevo.json'))
      || fs.existsSync(path.join(projectRoot, 'sevo.config.ts')),
    pipelineCount: countJsonFiles(path.join(projectRoot, 'pipelines')),
    advancedUsageCount: readAdvancedUsageCount(projectRoot),
  };
}

export function detectCliMaturity(snapshot: CliUsageSnapshot = detectCliUsage()): CliMaturityLevel {
  if (snapshot.advancedUsageCount > 0 || snapshot.pipelineCount >= 3) return 'advanced';
  if (snapshot.initialized || snapshot.pipelineCount > 0) return 'basic';
  return 'new';
}

export function commandExposureFor(level: CliMaturityLevel): CliCommandExposure {
  const visible = level === 'new'
    ? [...CORE_COMMANDS]
    : level === 'basic'
      ? [...CORE_COMMANDS, ...BASIC_COMMANDS]
      : [...CORE_COMMANDS, ...BASIC_COMMANDS, ...ADVANCED_COMMANDS];
  const all = [...CORE_COMMANDS, ...BASIC_COMMANDS, ...ADVANCED_COMMANDS];
  const visibleSet = new Set(visible);

  return {
    core: [...CORE_COMMANDS],
    basic: [...BASIC_COMMANDS],
    advanced: [...ADVANCED_COMMANDS],
    visible,
    hidden: all.filter((command) => !visibleSet.has(command)),
  };
}

export function recordCliCommandUsage(commandName: string, projectRoot: string = process.cwd()): void {
  if (!ADVANCED_USAGE_COMMANDS.has(commandName)) return;

  // FR-15: Show hint when using commands above current maturity level
  const snapshot = detectCliUsage(projectRoot);
  const level = detectCliMaturity(snapshot);
  const exposure = commandExposureFor(level);
  if (!exposure.visible.includes(commandName)) {
    const nextLevel = level === 'new' ? 'basic' : 'advanced';
    console.log(
      `\n  ℹ️  "${commandName}" is an ${nextLevel}-level command. ` +
      `Run more pipelines to unlock it in help output.\n`,
    );
  }

  const usagePath = getUsagePath(projectRoot);
  fs.mkdirSync(path.dirname(usagePath), { recursive: true });
  const current = readAdvancedUsageCount(projectRoot);
  fs.writeFileSync(usagePath, JSON.stringify({ advancedUsageCount: current + 1 }, null, 2) + '\n');
}

export function configureProgressiveHelp(program: { addHelpText: (position: 'after', text: string) => unknown }, projectRoot: string = process.cwd()): CliMaturityLevel {
  const snapshot = detectCliUsage(projectRoot);
  const level = detectCliMaturity(snapshot);
  const exposure = commandExposureFor(level);

  program.addHelpText('after', [
    '',
    `Progressive disclosure: ${level} user`,
    `Core commands: ${exposure.core.join(', ')}`,
    level === 'new' ? `Next unlock after \`sevo init\`: ${exposure.basic.join(', ')}` : `Basic commands: ${exposure.basic.join(', ')}`,
    level === 'advanced' ? `Advanced commands: ${exposure.advanced.join(', ')}` : `Advanced commands unlock after repeated pipeline use: ${exposure.advanced.join(', ')}`,
  ].join('\n'));

  return level;
}

function countJsonFiles(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  try {
    return fs.readdirSync(dir).filter((name) => name.endsWith('.json')).length;
  } catch {
    return 0;
  }
}

function readAdvancedUsageCount(projectRoot: string): number {
  const usagePath = getUsagePath(projectRoot);
  if (!fs.existsSync(usagePath)) return 0;
  try {
    const parsed = JSON.parse(fs.readFileSync(usagePath, 'utf8')) as { advancedUsageCount?: unknown };
    return typeof parsed.advancedUsageCount === 'number' ? parsed.advancedUsageCount : 0;
  } catch {
    return 0;
  }
}

function getUsagePath(projectRoot: string): string {
  const localSevoDir = path.join(projectRoot, '.sevo');
  if (fs.existsSync(projectRoot) && (fs.existsSync(localSevoDir) || fs.existsSync(path.join(projectRoot, 'sevo.json')))) {
    return path.join(localSevoDir, 'cli-usage.json');
  }
  return path.join(os.homedir(), '.sevo', 'cli-usage.json');
}
