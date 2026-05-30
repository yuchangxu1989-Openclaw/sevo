import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { writeResolutionArtifacts } from '../resolution-writer.js';
import { ResolutionSink, ClarificationType, BlockingLevel, Status } from '../clarification-types.js';
import type { ClarificationRecord } from '../clarification-record.js';

function makeRecord(overrides?: Partial<ClarificationRecord>): ClarificationRecord {
  return {
    schema_version: '1.0',
    clarificationId: 'clr-test-001',
    pipelineId: 'pipe-1',
    stageId: 'spec',
    stageAttempt: 1,
    type: ClarificationType.DECISION,
    blockingLevel: BlockingLevel.BLOCKING,
    status: Status.RESOLVED,
    targetType: 'user',
    sourceArtifacts: [],
    impactScope: ['FR-11', 'FR-12'],
    question: 'Should we use event sourcing for the ledger?',
    resolution: 'Yes, use append-only event log with snapshots.',
    resolutionSinks: [ResolutionSink.SPEC_PACKAGE],
    createdAt: '2026-04-20T09:00:00.000Z',
    resolvedAt: '2026-04-20T09:15:00.000Z',
    ...overrides,
  };
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-resolution-writer-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('writeResolutionArtifacts', () => {
  it('returns empty array when record has no resolution sinks', () => {
    const record = makeRecord({ resolutionSinks: [] });
    const artifacts = writeResolutionArtifacts(record, tmpDir, '2026-04-20T10:00:00.000Z');
    expect(artifacts).toHaveLength(0);
  });

  it('writes to spec subdirectory for SPEC_PACKAGE sink (AC-4.44)', () => {
    const record = makeRecord({ resolutionSinks: [ResolutionSink.SPEC_PACKAGE] });
    const artifacts = writeResolutionArtifacts(record, tmpDir, '2026-04-20T10:00:00.000Z');

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]!.id).toBe('clr-test-001:spec-package');
    expect(artifacts[0]!.type).toBe('clarification-spec-package');

    const filePath = artifacts[0]!.path;
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('Should we use event sourcing');
    expect(content).toContain('Yes, use append-only event log');
  });

  it('writes to different subdirectories for each sink type (AC-4.44)', () => {
    const record = makeRecord({
      resolutionSinks: [
        ResolutionSink.FACT,
        ResolutionSink.METHODOLOGY,
        ResolutionSink.EXPERIENCE,
        ResolutionSink.META,
        ResolutionSink.CONTRACT_PACKAGE,
        ResolutionSink.TASK_DESCRIPTION,
      ],
    });
    const artifacts = writeResolutionArtifacts(record, tmpDir, '2026-04-20T10:00:00.000Z');

    expect(artifacts).toHaveLength(6);

    const expectedSubdirs = ['facts', 'methodology', 'experience', 'meta', 'contract', 'tasks'];
    for (const subdir of expectedSubdirs) {
      expect(fs.existsSync(path.join(tmpDir, subdir))).toBe(true);
    }

    for (const art of artifacts) {
      expect(fs.existsSync(art.path)).toBe(true);
    }
  });

  it('writes ADR format file for ADR sink (AC-4.47)', () => {
    const record = makeRecord({
      resolutionSinks: [ResolutionSink.ADR],
      question: 'Should we use event sourcing for the ledger?',
      resolution: 'Yes, use append-only event log with snapshots.',
      impactScope: ['FR-11', 'FR-12'],
    });
    const artifacts = writeResolutionArtifacts(record, tmpDir, '2026-04-20T10:00:00.000Z');

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]!.id).toBe('clr-test-001:adr');
    expect(artifacts[0]!.type).toBe('clarification-adr');

    const filePath = artifacts[0]!.path;
    expect(filePath).toMatch(/decisions\/ADR-1-/);
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('# ADR-1:');
    expect(content).toContain('## Context');
    expect(content).toContain('Should we use event sourcing');
    expect(content).toContain('## Decision');
    expect(content).toContain('Yes, use append-only event log');
    expect(content).toContain('## Consequences');
    expect(content).toContain('- FR-11');
    expect(content).toContain('- FR-12');
  });

  it('increments ADR sequence number for subsequent ADRs (AC-4.47)', () => {
    const record1 = makeRecord({
      clarificationId: 'clr-adr-1',
      resolutionSinks: [ResolutionSink.ADR],
      question: 'First decision',
      resolution: 'Answer one',
    });
    const record2 = makeRecord({
      clarificationId: 'clr-adr-2',
      resolutionSinks: [ResolutionSink.ADR],
      question: 'Second decision',
      resolution: 'Answer two',
    });

    writeResolutionArtifacts(record1, tmpDir, '2026-04-20T10:00:00.000Z');
    const artifacts2 = writeResolutionArtifacts(record2, tmpDir, '2026-04-20T10:01:00.000Z');

    expect(artifacts2[0]!.path).toMatch(/ADR-2-/);
    const content = fs.readFileSync(artifacts2[0]!.path, 'utf-8');
    expect(content).toContain('# ADR-2:');
  });

  it('writes to multiple sinks including ADR in a single call (AC-4.44 + AC-4.47)', () => {
    const record = makeRecord({
      resolutionSinks: [ResolutionSink.ADR, ResolutionSink.SPEC_PACKAGE],
    });
    const artifacts = writeResolutionArtifacts(record, tmpDir, '2026-04-20T10:00:00.000Z');

    expect(artifacts).toHaveLength(2);
    expect(artifacts.map((a) => a.type)).toContain('clarification-adr');
    expect(artifacts.map((a) => a.type)).toContain('clarification-spec-package');

    for (const art of artifacts) {
      expect(fs.existsSync(art.path)).toBe(true);
    }
  });

  it('includes metadata on each artifact ref', () => {
    const record = makeRecord({ resolutionSinks: [ResolutionSink.FACT] });
    const artifacts = writeResolutionArtifacts(record, tmpDir, '2026-04-20T10:00:00.000Z');

    expect(artifacts[0]!.metadata).toEqual({
      sink: 'fact',
      clarificationId: 'clr-test-001',
      stageId: 'spec',
    });
    expect(artifacts[0]!.createdAt).toBe('2026-04-20T10:00:00.000Z');
  });
});
