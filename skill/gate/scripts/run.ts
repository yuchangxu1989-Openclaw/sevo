#!/usr/bin/env tsx

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { evaluate } from '../../../src/gate/index.js';
import type { ReviewBundle } from '../../../src/types/index.js';
import { fileURLToPath } from 'node:url';

type CliArgs = {
  gateId?: string;
  reviews?: string;
};

const SKILL_NAME = 'gate' as const;

export function runGate(argv: string[] = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args.gateId || !args.reviews) {
    throw new Error('gate requires --gate-id and --reviews');
  }

  const reviewBundles = loadReviewBundles(args.reviews);
  const verdict = evaluate(args.gateId, reviewBundles);
  if (!verdict.ok) {
    throw new Error(verdict.error.message);
  }
  return verdict.value;
}

function parseArgs(argv: string[]): CliArgs {
  const parsed: CliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--gate-id') {
      parsed.gateId = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--reviews') {
      parsed.reviews = argv[i + 1];
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

function loadReviewBundles(filePath: string): ReviewBundle[] {
  const raw = readFileSync(path.resolve(filePath), 'utf-8');
  return JSON.parse(raw) as ReviewBundle[];
}

function printHelp(): void {
  console.log([
    'Usage: npx tsx gate/scripts/run.ts --gate-id <gate-id> --reviews <review-bundles-json>',
    '',
    'Evaluates a SEVO gate via src/gate/evaluate().',
  ].join('\n'));
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  try {
    const verdict = runGate();
    console.log(JSON.stringify({ status: 'ok', skill: SKILL_NAME, verdict }, null, 2));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ status: 'error', skill: SKILL_NAME, message }, null, 2));
    process.exit(1);
  }
}
