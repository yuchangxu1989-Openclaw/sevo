/**
 * sevo show <instance-id> — detailed view of a pipeline instance.
 */

import type { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { projectRoot, printTable, formatDate, printJson } from './helpers.js';

export function registerShow(program: Command): void {
  program
    .command('show <instance-id>')
    .description('Show detailed pipeline instance information')
    .option('--json', 'Output raw JSON', false)
    .option('--stages', 'Show stage details only', false)
    .action((instanceId: string, opts: { json: boolean; stages: boolean }) => {
      const root = projectRoot();
      const pipelinesDir = path.join(root, 'pipelines');

      if (!fs.existsSync(pipelinesDir)) {
        console.error('No pipelines directory found.');
        process.exitCode = 1;
        return;
      }

      const data = findInstance(pipelinesDir, instanceId);
      if (!data) {
        console.error(`Pipeline instance "${instanceId}" not found.`);
        process.exitCode = 1;
        return;
      }

      if (opts.json) {
        printJson(data);
        return;
      }

      if (opts.stages && data.stages) {
        console.log('Stage Details:');
        for (const [stageId, record] of Object.entries(data.stages) as Array<[string, Record<string, unknown>]>) {
          const status = (record.status as string) ?? 'unknown';
          const artifacts = Array.isArray(record.artifacts) ? record.artifacts.length : 0;
          console.log(`  ${stageId.padEnd(35)} [${status}]  artifacts: ${artifacts}`);
        }
        return;
      }

      // Full display
      console.log(`\n── Pipeline: ${String(data.instanceId ?? data.pipelineId ?? instanceId)} ──\n`);
      const rr = data.routingResult as Record<string, unknown> | undefined;
      const rows: Array<[string, string]> = [
        ['Status', String(data.status ?? 'unknown')],
        ['Project', String(data.projectSlug ?? '-')],
        ['Level', String(rr?.level ?? data.level ?? '-')],
        ['Created', data.createdAt ? formatDate(String(data.createdAt)) : '-'],
        ['Updated', data.updatedAt ? formatDate(String(data.updatedAt)) : '-'],
      ];
      printTable(rows);

      if (data.stages) {
        console.log('\nStages:');
        for (const [stageId, record] of Object.entries(data.stages) as Array<[string, Record<string, unknown>]>) {
          const status = (record.status as string) ?? 'unknown';
          const icon = status === 'passed' ? '✓' : status === 'active' ? '▶' : status === 'blocked' ? '✗' : status === 'skipped' ? '⊘' : '·';
          console.log(`  ${icon} ${stageId}: ${status}`);
        }
      }
    });
}

function findInstance(dir: string, id: string): Record<string, unknown> | null {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
      if (data.instanceId === id || data.pipelineId === id || file.includes(id)) {
        return data;
      }
    } catch { /* skip */ }
  }
  return null;
}
