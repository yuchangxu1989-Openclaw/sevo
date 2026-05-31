import * as path from 'node:path';

import type { ArtifactRef } from '../types/index.js';
import type { FunctionalRequirement } from './spec-types.js';
import type {
  ReadmeCoverageMatch,
  ReadmeSyncLedgerEntry,
  ReadmeSyncSpecDocument,
  ReadmeSyncStageInput,
  ReadmeSyncStageOptions,
  ReadmeSyncStageOutput,
  ReadmeUpdateTask,
} from './readme-sync-types.js';
import { ensureDir, makeArtifact, nowIso, readJsonIfExists, readTextIfExists, writeFileEnsure } from '../stage-handlers/utils.js';

const TOKEN_MIN_LENGTH = 4;

export class ReadmeSyncStage {
  readonly stageId = 'readme' as const;
  private readonly now: () => string;

  constructor(private readonly options: ReadmeSyncStageOptions = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async execute(input: ReadmeSyncStageInput): Promise<ReadmeSyncStageOutput> {
    const checkedAt = nowIso(this.now);
    const specDoc = readJsonIfExists<ReadmeSyncSpecDocument>(input.specPath) ?? {};
    const readmeContent = readTextIfExists(input.readmePath) ?? '';
    const targetFrs = this.resolveTargetFrs(specDoc.functionalRequirements ?? [], input.changedFRs ?? []);

    const coverage = targetFrs.map((fr) => this.evaluateReadmeCoverage(fr, readmeContent));
    const missingFrs = coverage.filter((item) => !item.covered).map((item) => item.frId);
    const updateTask = missingFrs.length > 0
      ? this.buildUpdateTask(input, targetFrs.filter((fr) => missingFrs.includes(fr.id)))
      : null;

    const verdict = missingFrs.length === 0 ? 'pass' : 'block';
    const ledgerEntry: ReadmeSyncLedgerEntry = {
      pipelineId: input.pipelineId,
      projectSlug: input.projectSlug,
      checkedAt,
      readmePath: input.readmePath,
      specPath: input.specPath,
      changedFRs: targetFrs.map((fr) => fr.id),
      coverage,
      missingFrs,
      updateTask,
      verdict,
    };

    const artifact = this.writeArtifact(input, ledgerEntry, checkedAt);

    return {
      stageId: this.stageId,
      verdict,
      coverage,
      missingFrs,
      updateTask,
      ledgerEntry,
      artifact,
    };
  }

  private resolveTargetFrs(functionalRequirements: FunctionalRequirement[], changedFrs: string[]): FunctionalRequirement[] {
    const normalizedFrs = functionalRequirements.map((fr, index) => ({
      ...fr,
      id: fr.id ?? `FR-${String(index + 1).padStart(2, '0')}`,
      title: fr.title ?? `Requirement ${index + 1}`,
      description: fr.description ?? '',
      acceptanceCriteria: fr.acceptanceCriteria ?? [],
    }));

    if (normalizedFrs.length === 0) return [];
    if (changedFrs.length === 0) return normalizedFrs;

    const wanted = new Set(changedFrs.map((id) => id.trim()).filter(Boolean));
    const matched = normalizedFrs.filter((fr) => wanted.has(fr.id));
    return matched.length > 0 ? matched : normalizedFrs;
  }

  private evaluateReadmeCoverage(fr: FunctionalRequirement, readmeContent: string): ReadmeCoverageMatch {
    const normalizedReadme = readmeContent.toLowerCase();
    const titleTokens = this.extractTokens(fr.title ?? '');
    const descTokens = this.extractTokens(fr.description ?? '');
    const acTokens = (fr.acceptanceCriteria ?? []).flatMap((ac) => this.extractTokens(ac.description ?? ''));
    const tokens = Array.from(new Set([...titleTokens, ...descTokens, ...acTokens]));

    const presentTokens = tokens.filter((token) => normalizedReadme.includes(token));
    const covered = normalizedReadme.includes(fr.id.toLowerCase())
      || presentTokens.length >= Math.min(2, Math.max(1, titleTokens.length));

    return {
      frId: fr.id,
      title: fr.title ?? fr.id,
      covered,
      rationale: covered
        ? `README mentions ${presentTokens.slice(0, 4).join(', ') || fr.id}.`
        : `README is missing capability cues for ${fr.id}: ${tokens.slice(0, 6).join(', ') || fr.title || fr.id}.`,
    };
  }

  private extractTokens(text: string | undefined): string[] {
    return (text ?? '')
      .toLowerCase()
      .split(/[^a-z0-9\u4e00-\u9fff]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= TOKEN_MIN_LENGTH);
  }

  private buildUpdateTask(input: ReadmeSyncStageInput, missingFrs: FunctionalRequirement[]): ReadmeUpdateTask {
    return {
      taskId: `${input.taskId}-readme-sync`,
      title: 'Update README for newly changed functional requirements',
      description: [
        `Update ${input.readmePath} so it accurately documents the changed capabilities in ${input.specPath}.`,
        'Use projects/sevo/docs/readme-standard.md as mandatory writing guidance.',
        'Add user-facing wording for each missing FR, including what the capability does and how to use it.',
        'Keep the README aligned with first-time user entrypoint requirements: hero, tagline, proof chips, Quickstart, user-visible outcomes, how it works, usage boundaries, production setup, and docs/community links.',
        `Missing FRs: ${missingFrs.map((fr) => `${fr.id} ${fr.title || fr.id}`).join('; ')}`,
      ].join(' '),
      missingFrs: missingFrs.map((fr) => ({
        id: fr.id,
        title: fr.title ?? fr.id,
        description: fr.description ?? '',
        acceptanceCriteria: fr.acceptanceCriteria ?? [],
      })),
      targetPath: input.readmePath,
    };
  }

  private writeArtifact(input: ReadmeSyncStageInput, ledgerEntry: ReadmeSyncLedgerEntry, createdAt: string): ArtifactRef {
    const artifactBasePath = input.artifactBasePath
      ?? path.join(path.dirname(input.readmePath), 'artifacts', 'readme-sync');
    ensureDir(artifactBasePath);

    const filePath = path.join(artifactBasePath, `${input.taskId}-readme-sync-ledger.json`);
    writeFileEnsure(filePath, JSON.stringify(ledgerEntry, null, 2) + '\n');

    return makeArtifact({
      id: `${input.taskId}:readme-sync`,
      type: 'readme-sync-ledger',
      filePath,
      createdAt,
      metadata: {
        verdict: ledgerEntry.verdict,
        changedFrs: ledgerEntry.changedFRs.length,
        missingFrs: ledgerEntry.missingFrs.length,
      },
    });
  }
}
