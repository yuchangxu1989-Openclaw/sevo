/**
 * Tests for FR-12 Pipeline Create.
 *
 * Covers all 5 acceptance criteria:
 *   AC-4.56: Instance ID format fr-<slug>-<yyyyMMdd>-<seq>
 *   AC-4.57: Reject when active instance exists
 *   AC-4.58: Directory structure matches §3.6
 *   AC-4.59: Routing result in output
 *   AC-4.60: Existing content not overwritten
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { createPipelineInstance, type InstanceStore } from '../pipeline-create.js';
import { generateInstanceId, isValidInstanceId } from '../instance-id.js';
import { initProjectDirectory } from '../directory-init.js';
import { ALL_STAGES } from '../../constants.js';
import type {
  PipelineInstance,
  PipelineCreateRequest,
  PipelineTask,
} from '../../types/index.js';

// ── Helpers ─────────────────────────────────────────────────────

function makeTask(overrides?: Partial<PipelineTask>): PipelineTask {
  return {
    taskId: 'task-001',
    title: 'Implement FR-12',
    scope: { estimatedFiles: 5, estimatedLines: 200 },
    ...overrides,
  };
}

function makeRequest(overrides?: Partial<PipelineCreateRequest>): PipelineCreateRequest {
  return {
    projectSlug: 'sevo',
    task: makeTask(),
    ...overrides,
  };
}

/** In-memory InstanceStore for testing. */
function createMemoryStore(initial: PipelineInstance[] = []): InstanceStore {
  const instances = [...initial];
  return {
    listByProject(slug) {
      return instances.filter((i) => i.projectSlug === slug);
    },
    save(inst) {
      instances.push(inst);
    },
  };
}

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-fr12-'));
}

// ── Instance ID (AC-4.56) ───────────────────────────────────────

describe('instance-id (AC-4.56)', () => {
  it('generates ID in fr-<slug>-<yyyyMMdd>-<seq> format', async () => {
    const id = generateInstanceId('sevo', [], new Date('2026-04-20T12:00:00Z'));
    expect(id).toBe('fr-sevo-20260420-001');
    expect(isValidInstanceId(id)).toBe(true);
  });

  it('increments seq when existing instances share the same date', async () => {
    const existing = [
      { instanceId: 'fr-sevo-20260420-001' },
      { instanceId: 'fr-sevo-20260420-002' },
    ];
    const id = generateInstanceId('sevo', existing, new Date('2026-04-20T12:00:00Z'));
    expect(id).toBe('fr-sevo-20260420-003');
  });

  it('starts at 001 for a new date', async () => {
    const existing = [{ instanceId: 'fr-sevo-20260419-005' }];
    const id = generateInstanceId('sevo', existing, new Date('2026-04-20T12:00:00Z'));
    expect(id).toBe('fr-sevo-20260420-001');
  });

  it('rejects malformed IDs', async () => {
    expect(isValidInstanceId('not-valid')).toBe(false);
    expect(isValidInstanceId('fr-sevo-2026042-001')).toBe(false); // 7-digit date
    expect(isValidInstanceId('fr-SEVO-20260420-001')).toBe(false); // uppercase
  });
});

// ── Directory Init (AC-4.58, AC-4.60) ───────────────────────────

describe('directory-init (AC-4.58, AC-4.60)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates full standard directory structure from scratch (AC-4.58)', async () => {
    const result = initProjectDirectory(tmpDir, 'my-project');

    expect(result.complete).toBe(true);
    expect(result.projectRoot).toBe(path.join(tmpDir, 'projects', 'my-project'));

    // All standard dirs created
    const expectedDirs = [
      'docs', 'docs/architecture', 'docs/architecture/decisions',
      'docs/test-cases', 'src', 'tests', 'skill', 'reports', 'artifacts',
    ];
    for (const dir of expectedDirs) {
      expect(result.createdDirs).toContain(dir);
      expect(fs.existsSync(path.join(result.projectRoot, dir))).toBe(true);
    }

    // Placeholder files created
    expect(result.createdFiles).toContain('README.md');
    expect(result.createdFiles).toContain('package.json');
    expect(result.createdFiles).toContain('tsconfig.json');
    expect(result.createdFiles).toContain('LICENSE');
  });

  it('does not overwrite existing files (AC-4.60)', async () => {
    const projectRoot = path.join(tmpDir, 'projects', 'my-project');
    fs.mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'README.md'), '# Custom README\n', 'utf-8');

    const result = initProjectDirectory(tmpDir, 'my-project');

    // src was existing, not created
    expect(result.existingDirs).toContain('src');
    expect(result.createdDirs).not.toContain('src');

    // README.md was existing, not overwritten
    expect(result.existingFiles).toContain('README.md');
    expect(result.createdFiles).not.toContain('README.md');
    const content = fs.readFileSync(path.join(projectRoot, 'README.md'), 'utf-8');
    expect(content).toBe('# Custom README\n');

    // Missing dirs were still created
    expect(result.createdDirs).toContain('tests');
    expect(result.createdDirs).toContain('reports');
  });

  it('completes partially existing structure without damage (AC-4.60)', async () => {
    const projectRoot = path.join(tmpDir, 'projects', 'my-project');
    fs.mkdirSync(path.join(projectRoot, 'docs', 'architecture'), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, 'artifacts'), { recursive: true });

    const result = initProjectDirectory(tmpDir, 'my-project');

    expect(result.existingDirs).toContain('docs');
    expect(result.existingDirs).toContain('docs/architecture');
    expect(result.existingDirs).toContain('artifacts');
    expect(result.createdDirs).toContain('docs/architecture/decisions');
    expect(result.createdDirs).toContain('src');
    expect(result.createdDirs).toContain('tests');
    expect(result.complete).toBe(true);
  });
});

// ── Pipeline Create (full flow) ─────────────────────────────────

describe('createPipelineInstance', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates instance with correct ID format (AC-4.56)', async () => {
    const store = createMemoryStore();
    const result = await createPipelineInstance(makeRequest(), {
      store,
      workspaceRoot: tmpDir,
      now: new Date('2026-04-20T14:00:00Z'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.instanceId).toBe('fr-sevo-20260420-001');
    expect(isValidInstanceId(result.value.instanceId)).toBe(true);
    expect(result.value.status).toBe('created');
  });

  it('rejects when active instance exists (AC-4.57)', async () => {
    const activeInstance: PipelineInstance = {
      instanceId: 'fr-sevo-20260420-001',
      projectSlug: 'sevo',
      status: 'active',
      routingResult: {
        taskId: 'old-task',
        level: 'L0',
        requiredStages: ['implement'],
        skippedStages: [],
        matchedRules: [],
      needsUxDesign: false, uxDesignReason: '', needsArchDesign: false, archDesignReason: '',
      },
      directoryStructure: {
        projectRoot: '/tmp/x',
        createdDirs: [],
        existingDirs: [],
        createdFiles: [],
        existingFiles: [],
        complete: true,
      },
      createdAt: '2026-04-20T10:00:00Z',
      updatedAt: '2026-04-20T10:00:00Z',
    };

    const store = createMemoryStore([activeInstance]);
    const result = await createPipelineInstance(makeRequest(), {
      store,
      workspaceRoot: tmpDir,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('ACTIVE_INSTANCE_EXISTS');
    expect(result.error.activeInstanceId).toBe('fr-sevo-20260420-001');
  });

  it('also rejects when instance is in "created" or "paused" status (AC-4.57)', async () => {
    for (const status of ['created', 'paused'] as const) {
      const inst: PipelineInstance = {
        instanceId: `fr-sevo-20260420-001`,
        projectSlug: 'sevo',
        status,
        routingResult: {
          taskId: 'old', level: 'L0', requiredStages: ['implement'],
          skippedStages: [], matchedRules: [],
      needsUxDesign: false, uxDesignReason: '', needsArchDesign: false, archDesignReason: '',
        },
        directoryStructure: {
          projectRoot: '/tmp/x', createdDirs: [], existingDirs: [],
          createdFiles: [], existingFiles: [], complete: true,
        },
        createdAt: '2026-04-20T10:00:00Z',
        updatedAt: '2026-04-20T10:00:00Z',
      };

      const store = createMemoryStore([inst]);
      const result = await createPipelineInstance(makeRequest(), {
        store,
        workspaceRoot: tmpDir,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ACTIVE_INSTANCE_EXISTS');
      }
    }
  });

  it('allows creation when previous instance is completed or failed (AC-4.57)', async () => {
    for (const status of ['completed', 'failed'] as const) {
      const inst: PipelineInstance = {
        instanceId: `fr-sevo-20260420-001`,
        projectSlug: 'sevo',
        status,
        routingResult: {
          taskId: 'old', level: 'L0', requiredStages: ['implement'],
          skippedStages: [], matchedRules: [],
      needsUxDesign: false, uxDesignReason: '', needsArchDesign: false, archDesignReason: '',
        },
        directoryStructure: {
          projectRoot: '/tmp/x', createdDirs: [], existingDirs: [],
          createdFiles: [], existingFiles: [], complete: true,
        },
        createdAt: '2026-04-20T10:00:00Z',
        updatedAt: '2026-04-20T10:00:00Z',
      };

      const freshTmp = makeTmpDir();
      const store = createMemoryStore([inst]);
      const result = await createPipelineInstance(makeRequest(), {
        store,
        workspaceRoot: freshTmp,
        now: new Date('2026-04-20T14:00:00Z'),
      });
      expect(result.ok).toBe(true);
      fs.rmSync(freshTmp, { recursive: true, force: true });
    }
  });

  it('initializes project directory on creation (AC-4.58)', async () => {
    const store = createMemoryStore();
    const result = await createPipelineInstance(makeRequest(), {
      store,
      workspaceRoot: tmpDir,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const dir = result.value.directoryStructure;
    expect(dir.complete).toBe(true);
    expect(fs.existsSync(path.join(dir.projectRoot, 'src'))).toBe(true);
    expect(fs.existsSync(path.join(dir.projectRoot, 'tests'))).toBe(true);
    expect(fs.existsSync(path.join(dir.projectRoot, 'docs'))).toBe(true);
    expect(fs.existsSync(path.join(dir.projectRoot, 'reports'))).toBe(true);
    expect(fs.existsSync(path.join(dir.projectRoot, 'artifacts'))).toBe(true);
    expect(fs.existsSync(path.join(dir.projectRoot, 'skill'))).toBe(true);
  });

  it('routing result contains level, required/skipped stages (AC-4.59)', async () => {
    const store = createMemoryStore();

    // L0 task — small scope
    const result = await createPipelineInstance(
      makeRequest({ task: makeTask({ scope: { estimatedFiles: 1, estimatedLines: 10 } }) }),
      { store, workspaceRoot: tmpDir },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rr = result.value.routingResult;
    expect(rr.level).toBeDefined();
    expect(Array.isArray(rr.requiredStages)).toBe(true);
    expect(rr.requiredStages.length).toBeGreaterThan(0);
    expect(Array.isArray(rr.skippedStages)).toBe(true);
    // Every skipped stage has a reason
    for (const skip of rr.skippedStages) {
      expect(skip.reason).toBeTruthy();
    }
  });

  it('L2+ task routes through all 19 stages (AC-4.59)', async () => {
    const store = createMemoryStore();
    const result = await createPipelineInstance(
      makeRequest({
        task: makeTask({
          scope: {
            estimatedFiles: 20,
            estimatedLines: 600,
            affectedDomains: ['router', 'pipeline', 'gate'],
            isNewModule: true,
          },
        }),
      }),
      { store, workspaceRoot: tmpDir },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.routingResult.level).toBe('L2+');
    expect(result.value.routingResult.requiredStages).toHaveLength(ALL_STAGES.length);
    expect(result.value.routingResult.skippedStages).toHaveLength(0);
  });

  it('rejects invalid project slug', async () => {
    const store = createMemoryStore();
    for (const bad of ['', 'A', '-bad', 'bad-', 'has spaces', 'UPPER']) {
      const result = await createPipelineInstance(
        makeRequest({ projectSlug: bad }),
        { store, workspaceRoot: tmpDir },
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_PROJECT_SLUG');
      }
    }
  });

  it('rejects when task validation fails (missing taskId)', async () => {
    const store = createMemoryStore();
    const result = await createPipelineInstance(
      makeRequest({ task: makeTask({ taskId: '' }) }),
      { store, workspaceRoot: tmpDir },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ROUTING_FAILED');
    }
  });

  it('persists instance to store', async () => {
    const store = createMemoryStore();
    const result = await createPipelineInstance(makeRequest(), {
      store,
      workspaceRoot: tmpDir,
      now: new Date('2026-04-20T14:00:00Z'),
    });

    expect(result.ok).toBe(true);
    const saved = store.listByProject('sevo');
    expect(saved).toHaveLength(1);
    expect(saved[0]!.instanceId).toBe('fr-sevo-20260420-001');
  });

  it('different projects can have concurrent instances (§3.5 parallel rule)', async () => {
    const store = createMemoryStore();

    const r1 = await createPipelineInstance(
      makeRequest({ projectSlug: 'project-a' }),
      { store, workspaceRoot: tmpDir, now: new Date('2026-04-20T14:00:00Z') },
    );
    expect(r1.ok).toBe(true);

    const r2 = await createPipelineInstance(
      makeRequest({ projectSlug: 'project-b' }),
      { store, workspaceRoot: tmpDir, now: new Date('2026-04-20T14:00:00Z') },
    );
    expect(r2.ok).toBe(true);
  });

  it('initializes statusHistory on creation (AC-3.7)', async () => {
    const store = createMemoryStore();
    const result = await createPipelineInstance(makeRequest(), {
      store,
      workspaceRoot: tmpDir,
      now: new Date('2026-04-20T14:00:00Z'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.statusHistory).toBeDefined();
    expect(result.value.statusHistory).toHaveLength(1);
    expect(result.value.statusHistory![0]).toEqual({
      from: 'none',
      to: 'created',
      timestamp: '2026-04-20T14:00:00.000Z',
      trigger: 'pipeline-create',
    });
  });
});
