/**
 * sevo cancel <pipeline-id> — cancel a pipeline.
 */

import type { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { projectRoot } from './helpers.js';

export function registerCancel(program: Command): void {
  program
    .command('cancel <pipeline-id>')
    .description('Cancel a pipeline (from any non-terminal state)')
    .action((pipelineId: string) => {
      const root = projectRoot();
      const pipelinesDir = path.join(root, 'pipelines');
      const instanceFile = findInstanceFile(pipelinesDir, pipelineId);

      if (!instanceFile) {
        console.error(`Pipeline "${pipelineId}" not found.`);
        process.exitCode = 1;
        return;
      }

      const data = JSON.parse(fs.readFileSync(instanceFile, 'utf-8'));
      const terminal = ['completed', 'failed', 'cancelled'];

      if (terminal.includes(data.status)) {
        console.error(
          `Cannot cancel pipeline "${pipelineId}": current status is "${data.status}" (terminal).`,
        );
        process.exitCode = 1;
        return;
      }

      data.status = 'cancelled';
      data.updatedAt = new Date().toISOString();
      fs.writeFileSync(instanceFile, JSON.stringify(data, null, 2));

      console.log(`Pipeline "${pipelineId}" cancelled.`);
    });
}

function findInstanceFile(dir: string, id: string): string | null {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  for (const file of files) {
    if (file.includes(id)) return path.join(dir, file);
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
      if (data.instanceId === id || data.pipelineId === id) {
        return path.join(dir, file);
      }
    } catch { /* skip malformed */ }
  }
  return null;
}
