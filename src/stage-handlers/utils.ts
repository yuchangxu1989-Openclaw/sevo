/**
 * Shared filesystem and timestamp helpers for stage handlers.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ArtifactRef } from '../types/index.js';

export function nowIso(now?: () => string): string {
  return (now ?? (() => new Date().toISOString()))();
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function writeFileEnsure(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

export function makeArtifact(args: {
  id: string;
  type: string;
  filePath: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}): ArtifactRef {
  return {
    id: args.id,
    type: args.type,
    path: args.filePath,
    createdAt: args.createdAt,
    metadata: args.metadata,
  };
}

export function readJsonIfExists<T = unknown>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function readTextIfExists(filePath: string): string | null {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

/** Slugify a free-form string into a safe filename component. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'item';
}

/**
 * Try to extract a fenced JSON block from an LLM response.
 * Falls back to parsing the whole string. Returns null on failure.
 */
export function parseLlmJson<T = unknown>(text: string): T | null {
  if (!text) return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced?.[1] ?? text).trim();
  try {
    return JSON.parse(body) as T;
  } catch {
    // Try to find first { ... } or [ ... ] block.
    const obj = body.match(/[\[{][\s\S]*[\]}]/);
    if (obj) {
      try {
        return JSON.parse(obj[0]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
