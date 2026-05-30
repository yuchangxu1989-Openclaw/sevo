/**
 * CLI helpers — shared utilities for all CLI commands.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { SevoConfig } from '../config.js';
import { mergeConfig } from '../config.js';
import type { InstanceStore } from '../pipeline/pipeline-create.js';
import type { PipelineInstance } from '../types/index.js';

/** Default config filename. */
export const CONFIG_FILE = 'sevo.json';

/** Locate sevo.json by walking up from cwd. Returns absolute path or null. */
export function findConfigFile(startDir?: string): string | null {
  let dir = startDir ?? process.cwd();
  const root = path.parse(dir).root;

  while (dir !== root) {
    const candidate = path.join(dir, CONFIG_FILE);
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  return null;
}

/** Load and validate sevo.json. Throws on missing/invalid. */
export function loadConfig(configPath?: string): SevoConfig {
  const resolved = configPath ?? findConfigFile();
  if (!resolved || !fs.existsSync(resolved)) {
    throw new Error(
      `No ${CONFIG_FILE} found. Run 'sevo init' to create one.`,
    );
  }
  const raw = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
  return mergeConfig(raw);
}

/** Resolve the project root (directory containing sevo.json). */
export function projectRoot(configPath?: string): string {
  const resolved = configPath ?? findConfigFile();
  if (!resolved) {
    throw new Error(`No ${CONFIG_FILE} found.`);
  }
  return path.dirname(resolved);
}

/** Pretty-print JSON to stdout. */
export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

/** Print a simple key-value table. */
export function printTable(rows: Array<[string, string]>): void {
  const maxKey = Math.max(...rows.map(([k]) => k.length));
  for (const [key, value] of rows) {
    console.log(`  ${key.padEnd(maxKey)}  ${value}`);
  }
}

/** Format a date string for display. */
export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/** Simple file-backed pipeline instance store used by CLI commands. */
export function createFileInstanceStore(root: string): InstanceStore {
  const pipelinesDir = path.join(root, 'pipelines');
  fs.mkdirSync(pipelinesDir, { recursive: true });

  return {
    listByProject(projectSlug: string): PipelineInstance[] {
      if (!fs.existsSync(pipelinesDir)) return [];
      return fs.readdirSync(pipelinesDir)
        .filter((file) => file.endsWith('.json'))
        .flatMap((file) => {
          try {
            const data = JSON.parse(fs.readFileSync(path.join(pipelinesDir, file), 'utf-8')) as PipelineInstance;
            return data.projectSlug === projectSlug ? [data] : [];
          } catch {
            return [];
          }
        });
    },
    save(instance: PipelineInstance): void {
      const filePath = path.join(pipelinesDir, `${instance.instanceId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(instance, null, 2) + '\n', 'utf-8');
    },
  };
}
