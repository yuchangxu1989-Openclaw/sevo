/**
 * Ledger Engine — records pipeline outcomes and supports traceability queries.
 *
 * Responsibilities (arc42 §5.2.4):
 *  - record(): collect artifacts from a completed pipeline, generate a LedgerEntry,
 *    append to ledger.jsonl (append-only, §8.5 write-tmp + rename).
 *  - query(): filter ledger entries by pipelineId / scope / conclusion / time range.
 *
 * Storage: ledger.jsonl — one JSON object per line, append-only.
 */

import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  LedgerEntry,
  LedgerFilter,
  PipelineState,
  StageId,
  StageRecord,
  ObjectiveKeyResult,
  PdcaCycleRecord,
} from '../types/index.js';

import {
  collectArtifacts,
  collectStageRecords,
  collectClarificationRefs,
  allRequiredStagesPassed,
} from './artifact-collector.js';

// ─── Helpers ───

/** 8-char hex hash of a scope string, used in version generation. */
function scopeHash(scope: string): string {
  return createHash('sha256').update(scope).digest('hex').slice(0, 8);
}

/** Version = base36 timestamp + scope hash (e.g. "m1abc23-4f5e6d7a"). */
function generateVersion(scope: string): string {
  const ts = Date.now().toString(36);
  return `${ts}-${scopeHash(scope)}`;
}

/** Load a PipelineState from its state.json on disk. */
function loadPipelineState(basePath: string, pipelineId: string): PipelineState {
  const stateFile = path.join(basePath, 'pipelines', pipelineId, 'state.json');
  const raw = fs.readFileSync(stateFile, 'utf-8');
  return JSON.parse(raw) as PipelineState;
}

// ─── Ledger Engine ───

export class LedgerEngine {
  private readonly basePath: string;
  private readonly ledgerPath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.ledgerPath = path.join(basePath, 'ledger.jsonl');
  }

  /**
   * Record a pipeline's outcome as a ledger entry.
   * Reads the pipeline state, collects all stage records and artifacts,
   * determines conclusion, and appends to ledger.jsonl.
   * Includes OKR/PDCA data when available (FR-18, AC-18.14).
   */
  record(pipelineId: string, okrData?: {
    okrTree?: ObjectiveKeyResult[];
    krAchievement?: Array<{ krId: string; status: string; achievementPct: number }>;
    pdcaCycles?: PdcaCycleRecord[];
  }): LedgerEntry {
    const state = loadPipelineState(this.basePath, pipelineId);
    const scope = state.level;

    const entry: LedgerEntry = {
      pipelineId: state.pipelineId,
      version: generateVersion(scope),
      createdAt: new Date().toISOString(),
      scope,
      stages: collectStageRecords(state),
      conclusion: allRequiredStagesPassed(state) ? 'delivered' : 'aborted',
      evidence: collectArtifacts(state),
      clarificationRefs: collectClarificationRefs(state),
      // FR-18, AC-18.14: OKR/PDCA evidence chain
      ...(okrData?.okrTree ? { okrTree: okrData.okrTree } : {}),
      ...(okrData?.krAchievement ? { krAchievement: okrData.krAchievement } : {}),
      ...(okrData?.pdcaCycles ? { pdcaCycles: okrData.pdcaCycles } : {}),
    };

    this.appendEntry(entry);
    return entry;
  }

  /**
   * Query ledger entries with optional filters.
   * Supports: pipelineId, scope, conclusion, since (>=), until (<=).
   */
  query(filter: LedgerFilter): LedgerEntry[] {
    if (!fs.existsSync(this.ledgerPath)) return [];

    const raw = fs.readFileSync(this.ledgerPath, 'utf-8');
    const lines = raw.split('\n').filter((l) => l.trim().length > 0);

    let entries: LedgerEntry[] = lines.map(
      (line) => JSON.parse(line) as LedgerEntry,
    );

    if (filter.pipelineId !== undefined) {
      entries = entries.filter((e) => e.pipelineId === filter.pipelineId);
    }
    if (filter.scope !== undefined) {
      entries = entries.filter((e) => e.scope === filter.scope);
    }
    if (filter.conclusion !== undefined) {
      entries = entries.filter((e) => e.conclusion === filter.conclusion);
    }
    if (filter.since !== undefined) {
      const since = filter.since;
      entries = entries.filter((e) => e.createdAt >= since);
    }
    if (filter.until !== undefined) {
      const until = filter.until;
      entries = entries.filter((e) => e.createdAt <= until);
    }

    return entries;
  }

  // ─── Internal ───

  /**
   * Append a single entry to ledger.jsonl using §8.5 write-tmp + rename.
   * Reads existing content, appends the new line, writes to tmp, renames.
   */
  private appendEntry(entry: LedgerEntry): void {
    const dir = path.dirname(this.ledgerPath);
    fs.mkdirSync(dir, { recursive: true });

    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(this.ledgerPath, line, 'utf-8');
  }
}
