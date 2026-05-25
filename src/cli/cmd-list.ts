/**
 * sevo list — list projects and/or pipelines.
 */

import type { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { projectRoot, formatDate } from './helpers.js';

export function registerList(program: Command): void {
  program
    .command('list')
    .description('List projects and pipelines')
    .option('--projects', 'List projects only', false)
    .option('--pipelines', 'List pipelines only', false)
    .action((opts: { projects: boolean; pipelines: boolean }) => {
      const root = projectRoot();
      const showAll = !opts.projects && !opts.pipelines;

      // List projects
      if (showAll || opts.projects) {
        const projectsDir = path.join(root, 'projects');
        console.log('Projects:');
        if (fs.existsSync(projectsDir)) {
          const entries = fs.readdirSync(projectsDir, { withFileTypes: true })
            .filter((e) => e.isDirectory());
          if (entries.length === 0) {
            console.log('  (none)');
          } else {
            for (const entry of entries) {
              const metaPath = path.join(projectsDir, entry.name, 'project.json');
              let desc = '';
              if (fs.existsSync(metaPath)) {
                try {
                  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                  desc = meta.description ? ` — ${meta.description}` : '';
                } catch { /* skip */ }
              }
              console.log(`  ${entry.name}${desc}`);
            }
          }
        } else {
          console.log('  (no projects directory)');
        }
      }

      // List pipelines
      if (showAll || opts.pipelines) {
        const pipelinesDir = path.join(root, 'pipelines');
        console.log('\nPipelines:');
        if (fs.existsSync(pipelinesDir)) {
          const files = fs.readdirSync(pipelinesDir).filter((f) => f.endsWith('.json'));
          if (files.length === 0) {
            console.log('  (none)');
          } else {
            for (const file of files) {
              try {
                const data = JSON.parse(fs.readFileSync(path.join(pipelinesDir, file), 'utf-8'));
                const id = data.instanceId ?? data.pipelineId ?? file;
                const status = data.status ?? 'unknown';
                const created = data.createdAt ? formatDate(data.createdAt) : '';
                console.log(`  ${id}  [${status}]  ${created}`);
              } catch {
                console.log(`  ${file}  [parse error]`);
              }
            }
          }
        } else {
          console.log('  (no pipelines directory)');
        }
      }
    });
}
