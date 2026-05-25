/**
 * sevo resume <pipeline-id> — resume a paused pipeline.
 */

import type { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { projectRoot } from './helpers.js';

export function registerResume(program: Command): void {
  program
    .command('resume <pipeline-id>')
    .description('Resume a paused pipeline')
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

      if (data.status !== 'paused') {
        console.error(
          `Cannot resume pipeline "${pipelineId}": current status is "${data.status}", expected "paused".`,
        );
        process.exitCode = 1;
        return;
      }

      data.status = 'running';
      data.updatedAt = new Date().toISOString();
      fs.writeFileSync(instanceFile, JSON.stringify(data, null, 2));

      console.log(`Pipeline "${pipelineId}" resumed.`);
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
