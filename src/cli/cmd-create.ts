/**
 * sevo create <project-slug> — create a new project skeleton AND a pipeline
 * state file rooted at `.sevo/<project-slug>/state.json`.
 *
 * In a workspace with `sevo.json` (full SEVO project), the command also
 * scaffolds the project's directory structure under `projects/<slug>/`.
 * In a bare directory (no sevo.json), the command operates in
 * pipeline-only mode: it just creates `.sevo/<slug>/state.json` so that
 * `sevo advance <slug>` can drive the pipeline forward.
 */

import type { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { findConfigFile, loadConfig, projectRoot, printJson } from './helpers.js';
import { CliPipelineEngine } from '../engine/index.js';

function createProject(slug: string, opts: { description?: string }): void {
  const configPath = findConfigFile();
  const cwd = process.cwd();

  if (!configPath) {
    // Pipeline-only mode (no sevo.json found). Create .sevo/<slug>/state.json.
    const sevoBase = path.join(cwd, '.sevo');
    const engine = new CliPipelineEngine(sevoBase);

    if (engine.exists(slug)) {
      console.error(`Pipeline "${slug}" already exists at ${path.join(sevoBase, slug, 'state.json')}`);
      process.exitCode = 1;
      return;
    }

    const state = engine.create(slug, { description: opts.description });
    console.log(`Pipeline "${slug}" created.`);
    console.log(`  State:   ${path.join(sevoBase, slug, 'state.json')}`);
    console.log(`  Stages:  ${state.requiredStages.length}`);
    console.log(`  Next:    sevo advance ${slug}`);
    return;
  }

  // Project-scaffolding mode (sevo.json present).
  const root = projectRoot();
  const config = loadConfig();
  const projectDir = path.join(root, 'projects', slug);

  if (fs.existsSync(projectDir)) {
    console.error(`Project "${slug}" already exists at ${projectDir}`);
    process.exitCode = 1;
    return;
  }

  const subdirs = [
    'specs',
    'contracts',
    'artifacts',
    'pipelines',
    'docs',
    'docs/design',
    'docs/architecture',
    'docs/architecture/decisions',
    'src',
    'tests',
    'reports',
    'scripts',
  ];
  const created: string[] = [];
  for (const sub of subdirs) {
    const dir = path.join(projectDir, sub);
    fs.mkdirSync(dir, { recursive: true });
    created.push(sub);
  }

  const meta = {
    slug,
    description: opts.description ?? '',
    parentProject: config.projectName,
    createdAt: new Date().toISOString(),
    stages: config.stages,
  };
  fs.writeFileSync(
    path.join(projectDir, 'project.json'),
    JSON.stringify(meta, null, 2) + '\n',
  );

  // Also create a CLI pipeline state under <root>/.sevo/<slug>/state.json so
  // `sevo advance <slug>` works from the project root.
  const sevoBase = path.join(root, '.sevo');
  const engine = new CliPipelineEngine(sevoBase);
  if (!engine.exists(slug)) {
    engine.create(slug, { description: opts.description });
  }

  console.log(`Project "${slug}" created.`);
  console.log(`  Directory: ${projectDir}`);
  console.log(`  Subdirs: ${created.join(', ')}`);
  console.log(`  Pipeline: ${path.join(sevoBase, slug, 'state.json')}`);
  console.log(`  Next: sevo advance ${slug}`);
  printJson(meta);
}

export function registerCreate(program: Command): void {
  program
    .command('create <project-slug>')
    .description('Create a new project skeleton and pipeline state')
    .option('-d, --description <desc>', 'Project description')
    .action((slug: string, opts: { description?: string }) => {
      createProject(slug, opts);
    });

  const project = program
    .command('project')
    .description('Project-level commands');

  project
    .command('create <project-slug>')
    .description('Create a new project skeleton and pipeline state')
    .option('-d, --description <desc>', 'Project description')
    .action((slug: string, opts: { description?: string }) => {
      createProject(slug, opts);
    });
}
