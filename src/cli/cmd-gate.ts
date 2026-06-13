import type { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { evaluateStrangerReadyGate } from '../governance/stranger-ready-gate.js';
import { findConfigFile, loadConfig, projectRoot } from './helpers.js';

type StoredInstance = { instanceId: string; projectSlug?: string; status?: string; updatedAt?: string; gateFailure?: unknown };

export function registerGate(program: Command): void {
  const gate = program.command('gate').description('Manage SEVO governance gates');

  gate
    .command('retry <instanceId> <gateName>')
    .description('Retry a pending governance gate')
    .option('--skip-stranger-verify', 'Skip stranger-ready verification and record skipped reason', false)
    .action(async (instanceId: string, gateName: string, opts: { skipStrangerVerify?: boolean }) => {
      if (gateName !== 'stranger-ready') {
        console.error(`Unsupported gate: ${gateName}`);
        process.exitCode = 1;
        return;
      }

      const configPath = findConfigFile();
      const root = projectRoot(configPath ?? undefined);
      const config = loadConfig(configPath ?? undefined);
      const instancePath = findInstanceFile(root, instanceId);
      const instance = readInstance(instancePath, instanceId);

      const gateResult = evaluateStrangerReadyGate({
        projectRoot: root,
        pipelineId: instanceId,
        projectSlug: instance.projectSlug ?? config.projectName,
        config: {
          strangerVerify: opts.skipStrangerVerify ? false : undefined,
        },
        skipStrangerVerify: opts.skipStrangerVerify,
      });

      if (gateResult.conclusion === 'passed' || gateResult.conclusion === 'skipped') {
        instance.status = 'completed';
        instance.updatedAt = new Date().toISOString();
        instance.gateFailure = undefined;
        writeInstance(instancePath, instance);
        console.log(`Gate ${gateName} ${gateResult.conclusion}; pipeline ${instanceId} completed.`);
        return;
      }

      instance.status = 'gate-pending';
      instance.updatedAt = new Date().toISOString();
      instance.gateFailure = {
        gate: gateName,
        stderr: gateResult.stderr,
        exitCode: gateResult.exitCode,
        suggestions: gateResult.fixSuggestions,
      };
      writeInstance(instancePath, instance);
      console.error(`Gate ${gateName} failed; pipeline ${instanceId} remains gate-pending.`);
      process.exitCode = 1;
    });
}

function findInstanceFile(root: string, instanceId: string): string {
  const candidates = [
    path.join(root, 'pipelines', `${instanceId}.json`),
    path.join(root, '.sevo', 'pipelines', `${instanceId}.json`),
    path.join(root, `${instanceId}.json`),
  ];
  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  if (existing) return existing;
  const fallback = candidates[0]!;
  fs.mkdirSync(path.dirname(fallback), { recursive: true });
  return fallback;
}

function readInstance(filePath: string, instanceId: string): StoredInstance {
  if (!fs.existsSync(filePath)) return { instanceId, status: 'gate-pending' };
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as StoredInstance;
}

function writeInstance(filePath: string, instance: StoredInstance): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(instance, null, 2) + '\n', 'utf8');
}
