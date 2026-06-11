/**
 * SEVO CLI — host-agnostic command-line interface (arc42 §5.6).
 *
 * Commands: init, create, status, advance, doctor, list, show, config, export, help.
 * Pure TypeScript, no OpenClaw-specific API dependency.
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { registerInit } from './cmd-init.js';
import { registerCreate } from './cmd-create.js';
import { registerStatus } from './cmd-status.js';
import { registerAdvance } from './cmd-advance.js';
import { registerDoctor } from './cmd-doctor.js';
import { registerList } from './cmd-list.js';
import { registerShow } from './cmd-show.js';
import { registerConfig } from './cmd-config.js';
import { registerExport } from './cmd-export.js';
import { registerFR } from './cmd-fr.js';
import { registerPause } from './cmd-pause.js';
import { registerResume } from './cmd-resume.js';
import { registerCancel } from './cmd-cancel.js';
import { registerLedger } from './cmd-ledger.js';
import { registerDemo } from './cmd-demo.js';
import { registerGoal } from './cmd-goal.js';
import { registerFrom } from './cmd-from.js';
import { registerVerify } from './cmd-verify.js';
import { registerScan } from './cmd-scan.js';
import { registerGate } from './cmd-gate.js';
import { configureProgressiveHelp, recordCliCommandUsage } from '../progressive-disclosure/cli-maturity.js';

function getVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    // Try ../package.json (from lib/cli/) and ../../package.json (fallback)
    for (const rel of ['..', '../..']) {
      const p = join(__dirname, rel, 'package.json');
      try {
        const pkg = JSON.parse(readFileSync(p, 'utf8'));
        if (pkg.name === 'sevo-pipeline' && pkg.version) return pkg.version;
      } catch { /* try next */ }
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name('sevo')
    .description('SEVO — Automated software delivery pipeline for AI agents')
    .version(getVersion());

  registerInit(program);
  registerCreate(program);
  registerStatus(program);
  registerAdvance(program);
  registerDoctor(program);
  registerList(program);
  registerShow(program);
  registerConfig(program);
  registerExport(program);
  registerFR(program);
  registerPause(program);
  registerResume(program);
  registerCancel(program);
  registerLedger(program);
  registerDemo(program);
  registerGoal(program);
  registerFrom(program);
  registerVerify(program);
  registerScan(program);
  registerGate(program);

  configureProgressiveHelp(program);
  program.hook('preAction', (_thisCommand, actionCommand) => {
    recordCliCommandUsage(actionCommand.name());
  });

  return program;
}

/** Entry point when invoked as CLI binary. */
export function run(argv?: string[]): void {
  const program = createProgram();
  program.parse(argv ?? process.argv);
}
