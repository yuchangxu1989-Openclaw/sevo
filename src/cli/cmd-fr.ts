/**
 * sevo fr add|list — manage functional requirements for a pipeline.
 */

import type { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import { createFileInstanceStore, projectRoot } from './helpers.js';
import { enqueuePendingAdvanceFile, registerToActiveState } from './active-state-bridge.js';
import { createPipelineInstance } from '../pipeline/pipeline-create.js';
import { PipelineEngine } from '../pipeline/pipeline-engine.js';
import { transitionInstanceStatus } from '../pipeline/status-history.js';
import type { PipelineInstance, PipelineTask } from '../types/index.js';

interface FREntry {
  id: string;
  projectSlug: string;
  pipelineId: string;
  description: string;
  createdAt: string;
}

function getFRFilePath(root: string): string {
  return path.join(root, 'pipelines', '_fr-registry.json');
}

function loadFRs(root: string): FREntry[] {
  const filePath = getFRFilePath(root);
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return [];
  }
}

function saveFRs(root: string, frs: FREntry[]): void {
  const filePath = getFRFilePath(root);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(frs, null, 2));
}

export function registerFR(program: Command): void {
  const fr = program
    .command('fr')
    .description('Manage functional requirements for a pipeline');

  fr.command('add <project-slug> <description>')
    .description('Record a functional requirement and auto-create a pipeline when needed')
    .action(async (projectSlug: string, description: string) => {
      const root = projectRoot();
      const store = createFileInstanceStore(root);
      const frs = loadFRs(root);
      const existing = store.listByProject(projectSlug);
      const active = existing.find((item) => ['created', 'active', 'paused'].includes(item.status));
      let pipelineInstanceId = active?.instanceId;

      if (!pipelineInstanceId) {
        const task: PipelineTask = {
          taskId: `fr-${projectSlug}-${Date.now().toString(36)}`,
          title: description.slice(0, 80),
          description,
          scope: {
            estimatedFiles: 3,
            estimatedLines: 120,
          },
        };

        const created = await createPipelineInstance(
          { projectSlug, task },
          { store, workspaceRoot: root },
        );
        if (!created.ok) {
          console.error(`Failed to create pipeline: ${created.error.message}`);
          process.exitCode = 1;
          return;
        }

        const instance = created.value;
        const engine = new PipelineEngine(path.join(root, '.sevo'));
        const state = engine.create(instance.routingResult);
        transitionInstanceStatus(instance, 'active', 'fr-add-auto-create');
        pipelineInstanceId = instance.instanceId;

        const persisted = Object.assign({}, instance, {
          pipelineId: state.pipelineId,
          currentStage: state.currentStage,
          stages: state.stages,
        }) as PipelineInstance;
        store.save(persisted);

        const projectRootRelative = `projects/${path.basename(root)}`;
        registerToActiveState({
          root,
          pipelineId: state.pipelineId,
          projectSlug,
          projectRoot: projectRootRelative,
          tier: 3,
          source: 'cli-fr-add',
          instanceId: persisted.instanceId,
        });

        const firstActiveStage = state.requiredStages.find((stageId) => state.stages[stageId]?.status === 'active');
        if (firstActiveStage) {
          enqueuePendingAdvanceFile({
            root,
            pipelineId: state.pipelineId,
            projectSlug,
            projectRoot: projectRootRelative,
            stageId: firstActiveStage,
            source: 'cli-fr-add',
            instanceId: persisted.instanceId,
          });
        }
      }

      const entry: FREntry = {
        id: `FR-${randomUUID().slice(0, 8)}`,
        projectSlug,
        pipelineId: pipelineInstanceId,
        description,
        createdAt: new Date().toISOString(),
      };

      frs.push(entry);
      saveFRs(root, frs);

      console.log(`Added ${entry.id}: "${description}" to project ${projectSlug}`);
      console.log(`  Pipeline: ${pipelineInstanceId}`);
    });

  fr.command('list <project-slug>')
    .description('List functional requirements for a project')
    .action((projectSlug: string) => {
      const root = projectRoot();
      const frs = loadFRs(root);
      const filtered = frs.filter((f) => f.projectSlug === projectSlug);

      if (filtered.length === 0) {
        console.log(`No FRs found for project "${projectSlug}".`);
        return;
      }

      console.log(`\nFRs for project "${projectSlug}" (${filtered.length}):\n`);
      for (const fr of filtered) {
        console.log(`  ${fr.id}  ${fr.description}  [pipeline ${fr.pipelineId}]`);
      }
    });
}
