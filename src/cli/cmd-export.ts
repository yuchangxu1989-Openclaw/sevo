/**
 * sevo export — export pipeline data in various formats.
 */

import type { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { projectRoot, printJson } from './helpers.js';

export function registerExport(program: Command): void {
  program
    .command('export [instance-id]')
    .description('Export pipeline data (JSON or summary)')
    .option('-o, --output <file>', 'Output file path')
    .option('--format <fmt>', 'Output format: json | summary', 'json')
    .option('-p, --project <slug>', 'Filter by project slug')
    .action((instanceId?: string, opts?: { output?: string; format: string; project?: string }) => {
      const root = projectRoot();
      const pipelinesDir = path.join(root, 'pipelines');

      if (!fs.existsSync(pipelinesDir)) {
        console.error('No pipelines directory found.');
        process.exitCode = 1;
        return;
      }

      const files = fs.readdirSync(pipelinesDir).filter((f) => f.endsWith('.json'));
      const instances: unknown[] = [];

      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(pipelinesDir, file), 'utf-8'));
          if (instanceId && data.instanceId !== instanceId && data.pipelineId !== instanceId) continue;
          if (opts?.project && data.projectSlug !== opts.project) continue;
          instances.push(data);
        } catch { /* skip */ }
      }

      if (instances.length === 0) {
        console.log('No matching pipeline instances found.');
        return;
      }

      const format = opts?.format ?? 'json';
      let output: string;

      if (format === 'summary') {
        output = instances.map((inst) => {
          const d = inst as Record<string, unknown>;
          return `${d.instanceId ?? d.pipelineId}: ${d.status} (${d.projectSlug ?? 'unknown'})`;
        }).join('\n');
      } else {
        output = JSON.stringify(instances.length === 1 ? instances[0] : instances, null, 2);
      }

      if (opts?.output) {
        fs.writeFileSync(opts.output, output + '\n');
        console.log(`Exported to ${opts.output}`);
      } else {
        console.log(output);
      }
    });
}
