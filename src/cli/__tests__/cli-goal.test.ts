/**
 * Tests for sevo goal update — FR-18 AC-18.2.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createProgram } from '../index.js';

describe('sevo goal update (AC-18.2)', () => {
  let tmpDir: string;
  let pipelinesDir: string;
  const instanceId = 'test-instance-001';

  function writeInstance(data: Record<string, unknown>): string {
    const file = path.join(pipelinesDir, `${instanceId}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    return file;
  }

  function readInstance(): Record<string, unknown> {
    const file = path.join(pipelinesDir, `${instanceId}.json`);
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-goal-'));
    pipelinesDir = path.join(tmpDir, 'pipelines');
    fs.mkdirSync(pipelinesDir, { recursive: true });
    // Create sevo.json so projectRoot() finds it
    fs.writeFileSync(
      path.join(tmpDir, 'sevo.json'),
      JSON.stringify({ projectSlug: 'test-project' }),
    );
    // Override cwd so CLI finds the temp project
    process.chdir(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('registers goal command with update subcommand', () => {
    const program = createProgram();
    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain('goal');
  });

  it('updates endStateGoal and records change log entry', async () => {
    writeInstance({
      instanceId,
      status: 'running',
      endStateGoal: {
        description: 'Original goal',
        lockedAt: '2026-05-01T00:00:00.000Z',
      },
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    });

    const program = createProgram();
    program.exitOverride();
    await program.parseAsync([
      'node',
      'sevo',
      'goal',
      'update',
      instanceId,
      '--description',
      'Updated goal description',
      '--reason',
      'Scope changed after spec review',
    ]);

    const data = readInstance();
    const goal = data.endStateGoal as { description: string; lockedAt: string };
    expect(goal.description).toBe('Updated goal description');
    expect(goal.lockedAt).toBeTruthy();

    const changeLog = data.goalChangeLog as Array<{
      changedAt: string;
      previousDescription: string;
      newDescription: string;
      reason: string;
    }>;
    expect(changeLog).toHaveLength(1);
    expect(changeLog[0]!.previousDescription).toBe('Original goal');
    expect(changeLog[0]!.newDescription).toBe('Updated goal description');
    expect(changeLog[0]!.reason).toBe('Scope changed after spec review');
  });

  it('appends to existing change log on subsequent updates', async () => {
    writeInstance({
      instanceId,
      status: 'running',
      endStateGoal: {
        description: 'Goal v2',
        lockedAt: '2026-05-01T00:00:00.000Z',
      },
      goalChangeLog: [
        {
          changedAt: '2026-05-01T01:00:00.000Z',
          previousDescription: 'Goal v1',
          newDescription: 'Goal v2',
          reason: 'First change',
        },
      ],
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T01:00:00.000Z',
    });

    const program = createProgram();
    program.exitOverride();
    await program.parseAsync([
      'node',
      'sevo',
      'goal',
      'update',
      instanceId,
      '--description',
      'Goal v3',
      '--reason',
      'Second change',
    ]);

    const data = readInstance();
    const changeLog = data.goalChangeLog as Array<Record<string, string>>;
    expect(changeLog).toHaveLength(2);
    expect(changeLog[0]!.newDescription).toBe('Goal v2');
    expect(changeLog[1]!.previousDescription).toBe('Goal v2');
    expect(changeLog[1]!.newDescription).toBe('Goal v3');
    expect(changeLog[1]!.reason).toBe('Second change');
  });

  it('fails when instance has no endStateGoal', async () => {
    writeInstance({
      instanceId,
      status: 'running',
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
    });

    const program = createProgram();
    process.exitCode = undefined;
    await program.parseAsync([
      'node',
      'sevo',
      'goal',
      'update',
      instanceId,
      '--description',
      'New goal',
      '--reason',
      'Some reason',
    ]);

    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });

  it('fails when instance does not exist', async () => {
    const program = createProgram();
    process.exitCode = undefined;
    await program.parseAsync([
      'node',
      'sevo',
      'goal',
      'update',
      'nonexistent-id',
      '--description',
      'New goal',
      '--reason',
      'Some reason',
    ]);

    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
  });

  it('updates updatedAt timestamp', async () => {
    const oldDate = '2026-05-01T00:00:00.000Z';
    writeInstance({
      instanceId,
      status: 'running',
      endStateGoal: {
        description: 'Original',
        lockedAt: oldDate,
      },
      createdAt: oldDate,
      updatedAt: oldDate,
    });

    const program = createProgram();
    program.exitOverride();
    await program.parseAsync([
      'node',
      'sevo',
      'goal',
      'update',
      instanceId,
      '--description',
      'Updated',
      '--reason',
      'Test',
    ]);

    const data = readInstance();
    expect(data.updatedAt).not.toBe(oldDate);
  });
});
