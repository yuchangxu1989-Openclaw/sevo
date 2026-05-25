/**
 * sevo goal update <instance-id> — update the endStateGoal of a locked pipeline.
 *
 * FR-18 AC-18.2: endStateGoal modifications require an explicit operation
 * with a change reason recorded in the pipeline metadata change log.
 */

import type { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { projectRoot } from './helpers.js';
import type { GoalChangeEntry } from '../types/index.js';

export function registerGoal(program: Command): void {
  const goal = program
    .command('goal')
    .description('Manage pipeline end-state goals (FR-18)');

  goal
    .command('update <instance-id>')
    .description('Update the endStateGoal of a pipeline instance')
    .requiredOption('--description <text>', 'New goal description')
    .requiredOption('--reason <text>', 'Reason for the change')
    .action(
      (
        instanceId: string,
        opts: { description: string; reason: string },
      ) => {
        const root = projectRoot();
        const pipelinesDir = path.join(root, 'pipelines');
        const instanceFile = findInstanceFile(pipelinesDir, instanceId);

        if (!instanceFile) {
          console.error(`Pipeline "${instanceId}" not found.`);
          process.exitCode = 1;
          return;
        }

        const data = JSON.parse(fs.readFileSync(instanceFile, 'utf-8')) as Record<string, unknown>;

        if (!data.endStateGoal) {
          console.error(
            `Pipeline "${instanceId}" has no endStateGoal. Use "sevo create" with --goal to set one.`,
          );
          process.exitCode = 1;
          return;
        }

        const oldGoal = data.endStateGoal as { description: string; lockedAt: string };
        const now = new Date().toISOString();

        // Record change in the goal change log
        const entry: GoalChangeEntry = {
          changedAt: now,
          previousDescription: oldGoal.description,
          newDescription: opts.description,
          reason: opts.reason,
        };

        const changeLog = (Array.isArray(data.goalChangeLog) ? data.goalChangeLog : []) as GoalChangeEntry[];
        changeLog.push(entry);

        // Update the goal
        data.endStateGoal = {
          description: opts.description,
          lockedAt: now,
        };
        data.goalChangeLog = changeLog;
        data.updatedAt = now;

        fs.writeFileSync(instanceFile, JSON.stringify(data, null, 2));

        console.log(`Goal updated for pipeline "${instanceId}".`);
        console.log(`  Previous: ${entry.previousDescription}`);
        console.log(`  New:      ${entry.newDescription}`);
        console.log(`  Reason:   ${entry.reason}`);
      },
    );
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
    } catch {
      /* skip malformed */
    }
  }
  return null;
}
