import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ParsedAcceptanceCriterion, ParsedFunctionalRequirement } from './types.js';

export function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function writeJson(filePath: string, data: unknown): void {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function truncateText(text: string, max = 1024): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function safeJsonParse<T>(raw: string, fallback: T): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end < start) return fallback;

  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return fallback;
  }
}

export function listSourceFiles(sourceDir: string): string[] {
  if (!fs.existsSync(sourceDir)) return [];

  const ignored = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '.next']);
  const results: string[] = [];

  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
        results.push(full);
      }
    }
  };

  walk(sourceDir);
  return results.sort();
}

export function parseSpecMarkdown(specPath: string): ParsedFunctionalRequirement[] {
  const content = fs.readFileSync(specPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const frs: ParsedFunctionalRequirement[] = [];
  let current: ParsedFunctionalRequirement | undefined;

  for (const line of lines) {
    const frMatch = line.match(/^#{2,5}\s+(FR-\d+[A-Za-z0-9.-]*)\s+(.+)$/);
    if (frMatch?.[1]) {
      current = {
        frId: frMatch[1],
        title: (frMatch[2] ?? '').trim(),
        description: '',
        acceptanceCriteria: [],
      };
      frs.push(current);
      continue;
    }

    if (!current) continue;

    const acMatch = line.match(/AC-(\d+(?:\.\d+)?[A-Za-z0-9.-]*)[^：:]*[：:]\s*(.+)$/);
    if (acMatch?.[1]) {
      const acId = `AC-${acMatch[1]}`;
      current.acceptanceCriteria.push({
        frId: current.frId,
        acId,
        text: (acMatch[2] ?? '').trim(),
      });
      continue;
    }

    if (line.trim().startsWith('- **') || line.trim().startsWith('####')) continue;
    if (line.trim() && current.description.length < 500) {
      current.description = `${current.description} ${line.trim()}`.trim();
    }
  }

  return frs;
}

export function readFileExcerpt(filePath: string, maxChars = 6000): string {
  const content = fs.readFileSync(filePath, 'utf8');
  return content.length > maxChars ? content.slice(0, maxChars) : content;
}

export function relativeTo(base: string, filePath: string): string {
  return path.relative(base, filePath).replace(/\\/g, '/');
}
