/**
 * sevo ledger <pipeline-id> — display EventLedger history for a pipeline.
 */

import type { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { projectRoot, formatDate } from './helpers.js';

export function registerLedger(program: Command): void {
  program
    .command('ledger <pipeline-id>')
    .description('Show event ledger history for a pipeline')
    .option('-n, --limit <count>', 'Limit number of events shown', '50')
    .option('--json', 'Output as JSON', false)
    .action((pipelineId: string, opts: { limit: string; json: boolean }) => {
      const root = projectRoot();
      const ledgerDir = path.join(root, 'pipelines', '_ledger');

      if (!fs.existsSync(ledgerDir)) {
        console.log('No ledger events found.');
        return;
      }

      // Look for ledger file matching pipeline ID
      const ledgerFile = path.join(ledgerDir, `${pipelineId}.jsonl`);
      let events: Array<{ timestamp: string; type: string; stageId?: string; detail?: Record<string, unknown> }> = [];

      if (fs.existsSync(ledgerFile)) {
        const lines = fs.readFileSync(ledgerFile, 'utf-8').trim().split('\n').filter(Boolean);
        events = lines.map((line) => {
          try { return JSON.parse(line); } catch { return null; }
        }).filter(Boolean);
      } else {
        // Fallback: scan all ledger files for matching pipelineId
        const files = fs.readdirSync(ledgerDir).filter((f) => f.endsWith('.jsonl'));
        for (const file of files) {
          const lines = fs.readFileSync(path.join(ledgerDir, file), 'utf-8').trim().split('\n').filter(Boolean);
          for (const line of lines) {
            try {
              const evt = JSON.parse(line);
              if (evt.pipelineId === pipelineId) events.push(evt);
            } catch { /* skip */ }
          }
        }
      }

      if (events.length === 0) {
        console.log(`No ledger events found for pipeline "${pipelineId}".`);
        return;
      }

      const limit = parseInt(opts.limit, 10) || 50;
      const shown = events.slice(-limit);

      if (opts.json) {
        console.log(JSON.stringify(shown, null, 2));
        return;
      }

      console.log(`\nLedger for pipeline "${pipelineId}" (${shown.length}/${events.length} events):\n`);
      for (const evt of shown) {
        const ts = formatDate(evt.timestamp);
        const stage = evt.stageId ? ` [${evt.stageId}]` : '';
        const detail = evt.detail ? ` ${JSON.stringify(evt.detail)}` : '';
        console.log(`  ${ts}  ${evt.type}${stage}${detail}`);
      }
    });
}
