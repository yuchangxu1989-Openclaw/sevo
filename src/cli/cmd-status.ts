/**
 * sevo status [instance-id] — pipeline status overview.
 */

import type { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { projectRoot, printTable, formatDate } from './helpers.js';

export function registerStatus(program: Command): void {
  program
    .command('status [instance-id]')
    .description('Show pipeline status (all or specific instance)')
    .option('-p, --project <slug>', 'Filter by project slug')
    .action((instanceId?: string, opts?: { project?: string }) => {
      const root = projectRoot();
      const pipelinesDir = path.join(root, 'pipelines');

      if (!fs.existsSync(pipelinesDir)) {
        console.log('No pipelines found. Run "sevo project create" and "sevo fr add" first.');
        return;
      }

      const files = fs.readdirSync(pipelinesDir).filter((f) => f.endsWith('.json'));

      if (files.length === 0) {
        console.log('No pipeline instances found.');
        return;
      }

      for (const file of files) {
        const data = JSON.parse(fs.readFileSync(path.join(pipelinesDir, file), 'utf-8'));

        if (instanceId && data.instanceId !== instanceId && data.pipelineId !== instanceId) {
          continue;
        }
        if (opts?.project && data.projectSlug !== opts.project) {
          continue;
        }

        console.log(`\n── Pipeline: ${data.instanceId ?? data.pipelineId ?? file} ──`);
        const rows: Array<[string, string]> = [
          ['Status', data.status ?? 'unknown'],
          ['Project', data.projectSlug ?? '-'],
          ['Created', data.createdAt ? formatDate(data.createdAt) : '-'],
          ['Updated', data.updatedAt ? formatDate(data.updatedAt) : '-'],
        ];

        // Show stage summary if available
        if (data.stages && typeof data.stages === 'object') {
          const stageEntries = Object.entries(data.stages) as Array<[string, { status: string }]>;
          const passed = stageEntries.filter(([, v]) => v.status === 'passed').length;
          const active = stageEntries.filter(([, v]) => v.status === 'active').length;
          const stalled = stageEntries.filter(([, v]) => v.status === 'blocked' || v.status === 'clarification-blocked').length;
          rows.push(['Stages', `${passed}/${stageEntries.length} passed, ${active} active, ${stalled} stalled`]);
        }

        printTable(rows);
      }
    });
}
