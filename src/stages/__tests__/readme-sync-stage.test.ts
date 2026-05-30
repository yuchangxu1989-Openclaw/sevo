import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { ReadmeSyncStage } from '../readme-sync-stage.js';
import type { ReadmeSyncStageInput } from '../readme-sync-types.js';

function makeSpecJson() {
  return {
    functionalRequirements: [
      {
        id: 'FR-01',
        title: 'Generate release notes',
        description: 'Create release notes for each publish run',
        acceptanceCriteria: [
          { id: 'AC-1.1', description: 'Release notes include version and summary', requirementId: 'FR-01' },
        ],
      },
      {
        id: 'FR-02',
        title: 'Publish package',
        description: 'Publish package to npm and github',
        acceptanceCriteria: [
          { id: 'AC-2.1', description: 'Publish flow supports npm and github', requirementId: 'FR-02' },
        ],
      },
    ],
  };
}

function makeInput(tmpDir: string, overrides?: Partial<ReadmeSyncStageInput>): ReadmeSyncStageInput {
  const specPath = path.join(tmpDir, 'docs', 'product-requirements.json');
  const readmePath = path.join(tmpDir, 'README.md');
  fs.mkdirSync(path.dirname(specPath), { recursive: true });
  fs.writeFileSync(specPath, JSON.stringify(makeSpecJson(), null, 2));
  fs.writeFileSync(readmePath, '# Demo\n\nThis package can publish package artifacts to npm and github.\n');

  return {
    taskId: 'pipe-readme-001',
    pipelineId: 'pipe-readme-001',
    projectSlug: 'demo',
    specPath,
    readmePath,
    changedFRs: ['FR-02'],
    artifactBasePath: path.join(tmpDir, 'artifacts', 'readme-sync'),
    ...overrides,
  };
}

describe('ReadmeSyncStage', () => {
  it('passes when README already covers changed FRs', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-readme-pass-'));
    try {
      const stage = new ReadmeSyncStage({ now: () => '2026-05-30T23:00:00.000Z' });
      const output = await stage.execute(makeInput(tmpDir));

      expect(output.stageId).toBe('readme');
      expect(output.verdict).toBe('pass');
      expect(output.missingFrs).toEqual([]);
      expect(output.updateTask).toBeNull();
      expect(fs.existsSync(output.artifact.path)).toBe(true);

      const ledger = JSON.parse(fs.readFileSync(output.artifact.path, 'utf8'));
      expect(ledger.verdict).toBe('pass');
      expect(ledger.changedFRs).toEqual(['FR-02']);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('blocks and writes README update task when changed FR coverage is missing', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-readme-block-'));
    try {
      const readmePath = path.join(tmpDir, 'README.md');
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(readmePath, '# Demo\n\nBasic setup only.\n');

      const stage = new ReadmeSyncStage({ now: () => '2026-05-30T23:00:00.000Z' });
      const output = await stage.execute(makeInput(tmpDir, { changedFRs: ['FR-01'], readmePath }));

      expect(output.verdict).toBe('block');
      expect(output.missingFrs).toEqual(['FR-01']);
      expect(output.updateTask).not.toBeNull();
      expect(output.updateTask?.missingFrs[0]?.id).toBe('FR-01');

      const ledger = JSON.parse(fs.readFileSync(output.artifact.path, 'utf8'));
      expect(ledger.updateTask.title).toContain('Update README');
      expect(ledger.coverage[0].covered).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
