#!/usr/bin/env tsx

import path from 'node:path';
import { ContextInjector, type PipelineStage } from '../../../src/context-injection/index.js';
import { fileURLToPath } from 'node:url';

type CliArgs = {
  projectPath?: string;
};

const SKILL_NAME = 'regression' as const;
const MAPPED_STAGE: PipelineStage = 'review';
const EXTRA_CONSTRAINT = "Stage constraint: verify acceptance criteria coverage and protect existing implementation behavior.";

export function buildBootstrapInjection(projectPath: string): string {
  const injector = new ContextInjector();
  const resolvedProjectPath = path.resolve(projectPath);
  const injected = injector.buildInjection(resolvedProjectPath, MAPPED_STAGE);

  return [
    '# SEVO bootstrap injection',
    `skill: ${SKILL_NAME}`,
    `mappedStage: ${MAPPED_STAGE}`,
    `projectPath: ${resolvedProjectPath}`,
    EXTRA_CONSTRAINT,
    '',
    injected,
  ].join('\n');
}

export function runBootstrapInjection(argv: string[] = process.argv.slice(2)): string {
  const args = parseArgs(argv);
  const projectPath = path.resolve(args.projectPath ?? '..');
  return buildBootstrapInjection(projectPath);
}

function parseArgs(argv: string[]): CliArgs {
  const parsed: CliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--project-path') {
      parsed.projectPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }
  return parsed;
}

function printHelp(): void {
  console.log([
    'Usage: npx tsx regression/scripts/inject.ts --project-path <project-root>',
    '',
    `Outputs the bootstrap architecture constraints for ${SKILL_NAME}.`,
  ].join('\n'));
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  try {
    console.log(runBootstrapInjection());
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ status: 'error', skill: SKILL_NAME, message }, null, 2));
    process.exit(1);
  }
}
