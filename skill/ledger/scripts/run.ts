#!/usr/bin/env tsx

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { LedgerEngine } from '../../../src/ledger/index.js';
import type { LedgerFilter } from '../../../src/types/index.js';
import { fileURLToPath } from 'node:url';

type CliArgs = {
  stateRoot?: string;
  pipelineId?: string;
  query?: string;
};

const SKILL_NAME = 'ledger' as const;

export function runLedger(argv: string[] = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const engine = new LedgerEngine(path.resolve(args.stateRoot ?? '.sevo'));

  if (args.pipelineId) {
    return { mode: 'record', entry: engine.record(args.pipelineId) };
  }

  const filter = args.query ? loadFilter(args.query) : {};
  return { mode: 'query', entries: engine.query(filter) };
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
    if (arg === '--query') {
      parsed.query = argv[i + 1];
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

function loadFilter(filePath: string): LedgerFilter {
  const raw = readFileSync(path.resolve(filePath), 'utf-8');
  return JSON.parse(raw) as LedgerFilter;
}

function printHelp(): void {
  console.log([
    'Usage: npx tsx ledger/scripts/run.ts [--pipeline-id <id>] [--query <ledger-filter-json>] [--state-root <dir>]',
    '',
    'With --pipeline-id it records a new ledger entry; otherwise it queries existing entries.',
  ].join('\n'));
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  try {
    const result = runLedger();
    console.log(JSON.stringify({ status: 'ok', skill: SKILL_NAME, result }, null, 2));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ status: 'error', skill: SKILL_NAME, message }, null, 2));
    process.exit(1);
  }
}
