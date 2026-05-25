/**
 * Resolution Writer — writes clarification resolution content to files
 * based on ResolutionSink type.
 *
 * AC-4.44: applyResolution writes to different targets per ResolutionSink.
 * AC-4.47: ADR sink writes Architecture Decision Record format.
 */

import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import * as path from 'node:path';

import type { ArtifactRef } from '../types/index.js';
import { ResolutionSink } from './clarification-types.js';
import type { ClarificationRecord } from './clarification-record.js';

/** Map each ResolutionSink to its subdirectory under artifactBasePath. */
const SINK_SUBDIRS: Record<ResolutionSink, string> = {
  [ResolutionSink.SPEC_PACKAGE]: 'spec',
  [ResolutionSink.CONTRACT_PACKAGE]: 'contract',
  [ResolutionSink.TASK_DESCRIPTION]: 'tasks',
  [ResolutionSink.ADR]: 'decisions',
  [ResolutionSink.FACT]: 'facts',
  [ResolutionSink.METHODOLOGY]: 'methodology',
  [ResolutionSink.EXPERIENCE]: 'experience',
  [ResolutionSink.META]: 'meta',
};

/** Convert a question string into a filesystem-safe slug. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

/** Determine the next ADR sequence number by scanning existing files. */
function nextAdrSequence(decisionsDir: string): number {
  if (!existsSync(decisionsDir)) return 1;
  const files = readdirSync(decisionsDir);
  const adrNumbers = files
    .map((f) => {
      const match = f.match(/^ADR-(\d+)/);
      return match ? parseInt(match[1]!, 10) : 0;
    })
    .filter((n) => n > 0);
  return adrNumbers.length > 0 ? Math.max(...adrNumbers) + 1 : 1;
}

/** Format a ClarificationRecord as an ADR markdown document (AC-4.47). */
function formatAdr(record: ClarificationRecord, seq: number): string {
  const title =
    record.question.length > 80
      ? record.question.slice(0, 77) + '...'
      : record.question;
  const lines = [
    `# ADR-${seq}: ${title}`,
    '',
    '## Context',
    '',
    record.question,
    '',
    '## Decision',
    '',
    record.resolution ?? '(no resolution)',
    '',
    '## Consequences',
    '',
    record.impactScope.length > 0
      ? record.impactScope.map((s) => `- ${s}`).join('\n')
      : '- No specific impact scope identified.',
    '',
  ];
  return lines.join('\n');
}

/** Format a generic resolution markdown document for non-ADR sinks. */
function formatResolution(record: ClarificationRecord): string {
  const lines = [
    `# Resolution: ${record.clarificationId}`,
    '',
    `**Type**: ${record.type}`,
    `**Stage**: ${record.stageId}`,
    `**Resolved at**: ${record.resolvedAt ?? 'unknown'}`,
    '',
    '## Question',
    '',
    record.question,
    '',
    '## Resolution',
    '',
    record.resolution ?? '(no resolution)',
    '',
  ];
  if (record.impactScope.length > 0) {
    lines.push('## Impact Scope', '', ...record.impactScope.map((s) => `- ${s}`), '');
  }
  return lines.join('\n');
}

/**
 * Write resolution artifacts to disk based on the record's resolutionSinks.
 *
 * For each sink in `record.resolutionSinks`, creates the appropriate
 * subdirectory under `artifactBasePath` and writes a markdown file.
 *
 * ADR sinks get special formatting with title/context/decision/consequences.
 * All other sinks get a generic resolution format.
 *
 * @returns ArtifactRef[] for each file written.
 */
export function writeResolutionArtifacts(
  record: ClarificationRecord,
  artifactBasePath: string,
  now: string,
): ArtifactRef[] {
  const sinks = record.resolutionSinks;
  if (sinks.length === 0) return [];

  const artifacts: ArtifactRef[] = [];

  for (const sink of sinks) {
    const subdir = SINK_SUBDIRS[sink];
    const dir = path.join(artifactBasePath, subdir);
    mkdirSync(dir, { recursive: true });

    let filePath: string;
    let content: string;

    if (sink === ResolutionSink.ADR) {
      const seq = nextAdrSequence(dir);
      const slug = slugify(record.question);
      filePath = path.join(dir, `ADR-${seq}-${slug}.md`);
      content = formatAdr(record, seq);
    } else {
      filePath = path.join(dir, `${record.clarificationId}-resolution.md`);
      content = formatResolution(record);
    }

    writeFileSync(filePath, content, 'utf-8');

    artifacts.push({
      id: `${record.clarificationId}:${sink}`,
      type: `clarification-${sink}`,
      path: filePath,
      createdAt: now,
      metadata: {
        sink,
        clarificationId: record.clarificationId,
        stageId: record.stageId,
      },
    });
  }

  return artifacts;
}
