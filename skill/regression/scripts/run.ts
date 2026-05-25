#!/usr/bin/env tsx

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PipelineEngine } from '../../../src/pipeline/index.js';
import type { ArtifactRef, StageResult } from '../../../src/types/index.js';
import { fileURLToPath } from 'node:url';

type CliArgs = {
  stateRoot?: string;
  pipelineId?: string;
  outcome?: StageResult['outcome'];
  artifacts?: string;
  failureReason?: string;
};

const STAGE_ID = 'regression' as const;
const SKILL_NAME = 'regression' as const;

export function runStage(argv: string[] = process.argv.slice(2)): StageResult {
  const args = parseArgs(argv);
  if (!args.pipelineId) {
    throw new Error('regression requires --pipeline-id');
  }

  const stateRoot = path.resolve(args.stateRoot ?? '.sevo');
  const engine = new PipelineEngine(stateRoot);
  const result: StageResult = {
    stageId: STAGE_ID,
    outcome: args.outcome ?? 'passed',
    artifacts: loadArtifacts(args.artifacts),
    ...(args.failureReason ? { failureReason: args.failureReason } : {}),
  };

  engine.advance(args.pipelineId, result);
  return result;
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
    if (arg === '--outcome') {
      parsed.outcome = argv[i + 1] as StageResult['outcome'];
      i += 1;
      continue;
    }
    if (arg === '--artifacts') {
      parsed.artifacts = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--failure-reason') {
      parsed.failureReason = argv[i + 1];
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

function loadArtifacts(filePath?: string): ArtifactRef[] {
  if (!filePath) return [];
  const resolved = path.resolve(filePath);
  const raw = readFileSync(resolved, 'utf-8');
  return JSON.parse(raw) as ArtifactRef[];
}

function printHelp(): void {
  console.log([
    'Usage: npx tsx regression/scripts/run.ts --pipeline-id <id> [--state-root <dir>]',
    '',
    `Completes the ${SKILL_NAME} stage (${STAGE_ID}) through PipelineEngine.advance().`,
    'Optional flags:',
    '  --outcome passed|failed',
    '  --artifacts <artifact-ref-json>',
    '  --failure-reason <text>',
  ].join('\n'));
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  try {
    const result = runStage();
    console.log(JSON.stringify({ status: 'ok', skill: SKILL_NAME, stageId: STAGE_ID, result }, null, 2));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ status: 'error', skill: SKILL_NAME, message }, null, 2));
    process.exit(1);
  }
}
