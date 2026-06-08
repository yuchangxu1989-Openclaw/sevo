import * as fs from 'node:fs';
import * as path from 'node:path';

export interface EventLogRotationOptions {
  maxBytes?: number;
  retention?: number;
}

export interface NormalizedEventLogRotationOptions {
  maxBytes: number;
  retention: number;
}

export const DEFAULT_EVENT_LOG_ROTATION: Readonly<NormalizedEventLogRotationOptions> = Object.freeze({
  maxBytes: 10 * 1024 * 1024,
  retention: 5,
});

function toPositiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export function normalizeEventLogRotation(options: EventLogRotationOptions = {}): NormalizedEventLogRotationOptions {
  return {
    maxBytes: toPositiveInteger(options.maxBytes, DEFAULT_EVENT_LOG_ROTATION.maxBytes),
    retention: toPositiveInteger(options.retention, DEFAULT_EVENT_LOG_ROTATION.retention),
  };
}

function rotatedPath(filePath: string, index: number): string {
  return `${filePath}.${index}`;
}

export function rotateEventLogIfNeeded(
  filePath: string,
  incomingBytes: number,
  options: EventLogRotationOptions = {},
): boolean {
  const rotation = normalizeEventLogRotation(options);
  if (rotation.retention <= 0 || incomingBytes <= 0) return false;

  let currentSize = 0;
  try {
    currentSize = fs.statSync(filePath).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }

  if (currentSize === 0 || currentSize + incomingBytes <= rotation.maxBytes) return false;

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  try { fs.rmSync(rotatedPath(filePath, rotation.retention), { force: true }); } catch { /* best-effort */ }

  for (let index = rotation.retention - 1; index >= 1; index -= 1) {
    const from = rotatedPath(filePath, index);
    const to = rotatedPath(filePath, index + 1);
    if (!fs.existsSync(from)) continue;
    try { fs.renameSync(from, to); } catch { /* best-effort */ }
  }

  try {
    fs.renameSync(filePath, rotatedPath(filePath, 1));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export function appendJsonLineWithRotation(
  filePath: string,
  entry: unknown,
  options: EventLogRotationOptions = {},
): void {
  const line = `${JSON.stringify(entry)}\n`;
  const bytes = Buffer.byteLength(line, 'utf8');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  rotateEventLogIfNeeded(filePath, bytes, options);
  fs.appendFileSync(filePath, line, 'utf8');
}
