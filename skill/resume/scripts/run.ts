#!/usr/bin/env tsx

import path from 'node:path';
import { PipelineEngine } from '../../../src/pipeline/index.js';
import type { StageId } from '../../../src/types/index.js';
import { fileURLToPath } from 'node:url';

type CliArgs = {
  stateRoot?: string;
  pipelineId?: string;
  stage?: StageId;
};

const SKILL_NAME = 'resume' as const;

export function runResume(argv: string[] = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.pipelineId || !args.stage) {
    throw new Error('resume requires --pipeline-id and --stage');
  }

  const engine = new PipelineEngine(path.resolve(args.stateRoot ?? '.sevo'));
  engine.activate(args.pipelineId, args.stage);
  return engine.load(args.pipelineId);
}

function parseArgs(argv: string[]): CliArgs {
  const parsed: CliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--state-root') {
      parsed.stateRoot = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--pipeline-id') {
      parsed.pipelineId = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--stage') {
      parsed.stage = argv[i + 1] as StageId;
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
    'Usage: npx tsx resume/scripts/run.ts --pipeline-id <id> --stage <stage-id> [--state-root <dir>]',
    '',
    'Re-activates a pipeline stage through PipelineEngine.activate().',
  ].join('\n'));
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  try {
    const state = runResume();
    console.log(JSON.stringify({ status: 'ok', skill: SKILL_NAME, state }, null, 2));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ status: 'error', skill: SKILL_NAME, message }, null, 2));
    process.exit(1);
  }
}
