#!/usr/bin/env tsx

import path from 'node:path';
import { PipelineEngine } from '../../../src/pipeline/index.js';
import { route } from '../../../src/router/index.js';
import type { PipelineTask } from '../../../src/types/index.js';
import { fileURLToPath } from 'node:url';

type CliArgs = {
  stateRoot?: string;
  taskId?: string;
  title?: string;
  description?: string;
  scope?: string;
};

const SKILL_NAME = 'pipeline-create' as const;

export function createPipeline(argv: string[] = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.taskId || !args.title) {
    throw new Error('pipeline-create requires --task-id and --title');
  }

  const task: PipelineTask = {
    taskId: args.taskId,
    title: args.title,
    ...(args.description ? { description: args.description } : {}),
    scope: args.scope ? parseScope(args.scope) : {},
  };

  const routed = route(task);
  if (!routed.ok) {
    throw new Error(routed.error.message);
  }

  const engine = new PipelineEngine(path.resolve(args.stateRoot ?? '.sevo'));
  const state = engine.create(routed.value);
  return { routing: routed.value, state };
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
    if (arg === '--task-id') {
      parsed.taskId = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--title') {
      parsed.title = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--description') {
      parsed.description = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--scope') {
      parsed.scope = argv[i + 1];
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

function parseScope(raw: string) {
  return JSON.parse(raw) as PipelineTask['scope'];
}

function printHelp(): void {
  console.log([
    'Usage: npx tsx pipeline-create/scripts/run.ts --task-id <id> --title <title> [--scope <json>] [--state-root <dir>]',
    '',
    'Creates a pipeline via route() -> PipelineEngine.create().',
  ].join('\n'));
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  try {
    const result = createPipeline();
    console.log(JSON.stringify({ status: 'ok', skill: SKILL_NAME, result }, null, 2));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ status: 'error', skill: SKILL_NAME, message }, null, 2));
    process.exit(1);
  }
}
