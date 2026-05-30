import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StageId } from '../types/index.js';

export interface StageStandard {
  title?: string;
  principles: string[];
  requiredSections?: string[];
}

export type StageStandards = Partial<Record<StageId, StageStandard>> & Record<string, StageStandard>;

function defaultStandardsPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), 'default-stage-standards.json');
}

function parseStandards(raw: string): StageStandards {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const standards: StageStandards = {};
  for (const [stageId, value] of Object.entries(parsed)) {
    if (!value || typeof value !== 'object') continue;
    const entry = value as { title?: unknown; principles?: unknown; requiredSections?: unknown };
    const principles = Array.isArray(entry.principles)
      ? entry.principles.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
    if (principles.length === 0) continue;
    standards[stageId] = {
      ...(typeof entry.title === 'string' ? { title: entry.title } : {}),
      principles,
      ...(Array.isArray(entry.requiredSections)
        ? { requiredSections: entry.requiredSections.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) }
        : {}),
    };
  }
  return standards;
}

function readStandardsFile(filePath: string): StageStandards {
  return parseStandards(readFileSync(filePath, 'utf8'));
}

export interface LoadStageStandardsOptions {
  projectRoot?: string;
  overridePath?: string;
  warn?: (message: string) => void;
}

export function loadStageStandards(options: LoadStageStandardsOptions = {}): StageStandards {
  const warn = options.warn ?? (() => undefined);
  let defaults: StageStandards = {};

  try {
    defaults = readStandardsFile(defaultStandardsPath());
  } catch (err) {
    warn(`[SEVO] Failed to load default stage standards: ${err instanceof Error ? err.message : String(err)}`);
  }

  const overridePath = options.overridePath
    ?? join(resolve(options.projectRoot ?? process.cwd()), 'sevo-standards.json');
  if (!existsSync(overridePath)) return defaults;

  try {
    return { ...defaults, ...readStandardsFile(overridePath) };
  } catch (err) {
    warn(`[SEVO] Failed to load project stage standards from ${overridePath}: ${err instanceof Error ? err.message : String(err)}`);
    return defaults;
  }
}

export function getStageStandard(stageId: StageId, options: LoadStageStandardsOptions = {}): StageStandard | null {
  return loadStageStandards(options)[stageId] ?? null;
}

export function formatStageStandardForPrompt(stageId: StageId, standard: StageStandard | null): string {
  if (!standard || standard.principles.length === 0) return '';
  const title = standard.title ?? `Stage standards — ${stageId}`;
  const lines = [`[SEVO Stage Standards — ${stageId}]`, title, ...standard.principles.map((item) => `- ${item}`)];
  if (standard.requiredSections && standard.requiredSections.length > 0) {
    lines.push(`Required sections: ${standard.requiredSections.join(', ')}`);
  }
  return lines.join('\n');
}
