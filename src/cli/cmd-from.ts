/**
 * sevo from <project-slug> <stage> — start pipeline from a specific stage (FR-27).
 *
 * Allows existing projects to enter the pipeline at any valid stage,
 * skipping all preceding stages.
 */

import type { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { loadConfig, projectRoot, printJson } from './helpers.js';
import {
  createPipelineFromStage,
  VALID_ENTRY_STAGES,
  type PipelineFromOptions,
} from '../pipeline/pipeline-from.js';
import type { InstanceStore } from '../pipeline/pipeline-create.js';
import type { PipelineInstance, PipelineTask, TaskLevel, TaskScope } from '../types/index.js';
import { inferScopeFromDescription } from '../router/description-scope-inferrer.js';

interface FromCliOptions {
  title: string;
  description?: string;
  level?: string;
}

const VALID_LEVELS: ReadonlySet<TaskLevel> = new Set<TaskLevel>(['L0', 'L1', 'L2+']);

function parseExplicitLevel(raw: string | undefined): TaskLevel | undefined {
  if (!raw) return undefined;
  const normalized = raw.toUpperCase().trim();
  if (VALID_LEVELS.has(normalized as TaskLevel)) return normalized as TaskLevel;
  throw new Error(`Invalid --level value "${raw}". Valid: L0, L1, L2+`);
}

export function registerFrom(program: Command): void {
  program
    .command('from <project-slug> <stage>')
    .description(
      `Start pipeline from a specific stage (skip preceding stages). Valid stages: ${VALID_ENTRY_STAGES.join(', ')}`,
    )
    .option('-t, --title <title>', 'Task title', 'Flexible stage entry')
    .option('-d, --description <desc>', 'Task description')
    .option('--level <level>', 'Explicit routing level override (L0|L1|L2+); bypasses auto-classification')
    .action(async (slug: string, stage: string, opts: FromCliOptions) => {
      const root = projectRoot();
      const config = loadConfig();

      // FR-3: explicit --level wins over inference.
      let explicitLevel: TaskLevel | undefined;
      try {
        explicitLevel = parseExplicitLevel(opts.level);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exitCode = 1;
        return;
      }

      // FR-1 + FR-2: build scope from description so the router has real signal
      // instead of the historical empty `{}` that always fell to false-L0.
      const scope: TaskScope = {};
      if (explicitLevel) {
        scope.userExplicitLevel = explicitLevel;
        if (explicitLevel === 'L0') scope.userExplicitL0 = true;
        if (explicitLevel === 'L2+') scope.userExplicitFullPipeline = true;
      } else {
        try {
          const inferred = await inferScopeFromDescription(opts.description);
          Object.assign(scope, inferred);
        } catch {
          // Inference must never block CLI — empty scope falls to L1 default.
        }
      }

      // Build a minimal task
      const task: PipelineTask = {
        taskId: `from-${slug}-${stage}-${Date.now()}`,
        title: opts.title,
        description: opts.description,
        scope,
      };

      // Build a file-based instance store
      const pipelinesDir = path.join(root, 'projects', slug, 'pipelines');
      const store = createFileStore(pipelinesDir);

      // Build options with filesystem checks
      const options: PipelineFromOptions = {
        store,
        workspaceRoot: root,
        projectExists: (wsRoot, projSlug) => {
          return fs.existsSync(path.join(wsRoot, 'projects', projSlug));
        },
        specFileExists: (wsRoot, projSlug) => {
          const specPath = path.join(wsRoot, 'projects', projSlug, 'docs', 'product-requirements.md');
          const altSpecPath = path.join(wsRoot, 'projects', projSlug, 'specs', 'product-requirements.md');
          return fs.existsSync(specPath) || fs.existsSync(altSpecPath);
        },
        contractFileExists: (wsRoot, projSlug) => {
          const contractPath = path.join(wsRoot, 'projects', projSlug, 'docs', 'arc42-architecture.md');
          const altContractPath = path.join(wsRoot, 'projects', projSlug, 'contracts', 'architecture.md');
          return fs.existsSync(contractPath) || fs.existsSync(altContractPath);
        },
        onWarning: (msg) => {
          console.warn(msg);
        },
      };

      const result = await createPipelineFromStage(
        { projectSlug: slug, stage, task },
        options,
      );

      if (!result.ok) {
        console.error(`Error: ${result.error.message}`);
        process.exitCode = 1;
        return;
      }

      const instance = result.value;
      console.log(`Pipeline created from stage "${stage}" for project "${slug}".`);
      console.log(`  Instance ID: ${instance.instanceId}`);
      console.log(`  Skipped stages: ${instance.routingResult.skippedStages.length}`);
      console.log(`  Required stages: ${instance.routingResult.requiredStages.length}`);
      printJson({
        instanceId: instance.instanceId,
        projectSlug: instance.projectSlug,
        entryStage: stage,
        skippedStages: instance.routingResult.skippedStages,
        requiredStages: instance.routingResult.requiredStages,
      });
    });
}

/** Simple file-based InstanceStore for CLI usage. */
function createFileStore(pipelinesDir: string): InstanceStore {
  fs.mkdirSync(pipelinesDir, { recursive: true });

  return {
    listByProject(_projectSlug: string): PipelineInstance[] {
      const instances: PipelineInstance[] = [];
      if (!fs.existsSync(pipelinesDir)) return instances;

      const files = fs.readdirSync(pipelinesDir).filter(f => f.endsWith('.json'));
      for (const file of files) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(pipelinesDir, file), 'utf-8'));
          instances.push(data as PipelineInstance);
        } catch {
          // Skip malformed files
        }
      }
      return instances;
    },
    save(instance: PipelineInstance): void {
      const filePath = path.join(pipelinesDir, `${instance.instanceId}.json`);
      fs.mkdirSync(pipelinesDir, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(instance, null, 2) + '\n');
    },
  };
}
