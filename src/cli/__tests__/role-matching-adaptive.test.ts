import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { createProgram } from '../index.js';

function writeOpenClawConfig(filePath: string, agents: Array<string | Record<string, unknown>>): void {
  fs.writeFileSync(filePath, JSON.stringify({ agents: { list: agents } }, null, 2));
}

async function runCli(argv: string[]): Promise<{ exitCode?: number; output: string; error: string }> {
  const program = createProgram();
  program.exitOverride();
  const logs: string[] = [];
  const errors: string[] = [];
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')); });
  const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => { errors.push(args.join(' ')); });
  const oldExitCode = process.exitCode;
  process.exitCode = undefined;
  try {
    await program.parseAsync(['node', 'sevo', ...argv]);
  } catch (err) {
    if (typeof err === 'object' && err && 'exitCode' in err) {
      process.exitCode = (err as { exitCode?: number }).exitCode;
    } else {
      throw err;
    }
  } finally {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  }
  const exitCode = typeof process.exitCode === 'number' ? process.exitCode : undefined;
  process.exitCode = oldExitCode;
  return { exitCode, output: logs.join('\n'), error: errors.join('\n') };
}

describe('role-matching adaptive degradation init/doctor', () => {
  let tmpDir: string;
  let openclawConfigPath: string;
  const originalEnv = { ...process.env };
  const originalCwd = process.cwd();

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sevo-role-adapt-'));
    openclawConfigPath = path.join(tmpDir, 'openclaw.json');
    process.env.OPENCLAW_CONFIG_PATH = openclawConfigPath;
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    process.env = { ...originalEnv };
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('standard host maps all five role pools and doctor has zero errors', async () => {
    writeOpenClawConfig(openclawConfigPath, [
      { id: 'main' },
      { id: 'pm-01', description: 'product manager' },
      { id: 'ux-01', description: 'ux designer' },
      { id: 'sa-01', description: 'architect' },
      { id: 'dev-01', description: 'coder' },
      { id: 'audit-01', description: 'auditor' },
    ]);

    const init = await runCli(['init', '--name', 'standard']);
    expect(init.exitCode).toBeUndefined();
    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'sevo.json'), 'utf8'));
    expect(config.strictRoleMatching).toBe(false);
    expect(config.roleAssignment.roles).toMatchObject({
      product: ['pm-01'],
      ux: ['ux-01'],
      architect: ['sa-01'],
      coder: ['dev-01'],
      auditor: ['audit-01'],
    });
    expect(config.roleAssignment.autoFallback).toBe(false);

    const doctor = await runCli(['doctor']);
    expect(doctor.exitCode).toBeUndefined();
    expect(doctor.output).toContain('Errors: 0');
    expect(doctor.output).toContain('role-matching');
  });

  it('missing role host warns and init completes', async () => {
    writeOpenClawConfig(openclawConfigPath, [
      { id: 'main' },
      { id: 'pm-01', description: 'product manager' },
      { id: 'dev-01', description: 'coder' },
    ]);

    const init = await runCli(['init', '--name', 'partial']);
    expect(init.exitCode).toBeUndefined();
    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'sevo.json'), 'utf8'));
    expect(config.roleAssignment.autoFallback).toBe(true);
    expect(config.roleAssignment.roles.ux).toEqual(['pm-01']);
    expect(config.roleAssignment.roles.architect).toEqual(['pm-01']);
    expect(config.roleAssignment.roles.auditor).toEqual(['pm-01']);

    const doctor = await runCli(['doctor']);
    expect(doctor.exitCode).toBeUndefined();
    expect(doctor.output).toContain('Errors: 0');
    expect(doctor.output).toContain('Warnings:');
    expect(doctor.output).toContain('角色降级模式');
  });

  it('single agent host degrades to one agent for every role', async () => {
    writeOpenClawConfig(openclawConfigPath, [{ id: 'solo-01', description: 'general agent' }]);

    const init = await runCli(['init', '--name', 'solo']);
    expect(init.exitCode).toBeUndefined();
    expect(init.output).toContain('检测到单 Agent 环境（solo-01）');
    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'sevo.json'), 'utf8'));
    expect(config.roleAssignment.roles).toEqual({
      product: ['solo-01'],
      ux: ['solo-01'],
      architect: ['solo-01'],
      coder: ['solo-01'],
      auditor: ['solo-01'],
    });
    expect(config.roleAssignment.fallbackAgentId).toBe('solo-01');

    const doctor = await runCli(['doctor']);
    expect(doctor.exitCode).toBeUndefined();
    expect(doctor.output).toContain('Errors: 0');
    expect(doctor.output).toContain('trust-level: low');
  });

  it('zero agent host writes self placeholder and doctor stays unblocked', async () => {
    writeOpenClawConfig(openclawConfigPath, [{ id: 'main' }]);

    const init = await runCli(['init', '--name', 'zero']);
    expect(init.exitCode).toBeUndefined();
    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, 'sevo.json'), 'utf8'));
    expect(config.roleAssignment.agentRoles).toEqual({ self: 'Any' });
    expect(config.roleAssignment.roles.coder).toEqual(['self']);

    const doctor = await runCli(['doctor']);
    expect(doctor.exitCode).toBeUndefined();
    expect(doctor.output).toContain('Errors: 0');
  });

  it('strictRoleMatching=true turns role mismatch into doctor error', async () => {
    fs.writeFileSync(path.join(tmpDir, 'sevo.json'), JSON.stringify({
      projectName: 'strict',
      adapter: 'standalone',
      stages: ['spec', 'implement', 'review'],
      rules: [],
      strictRoleMatching: true,
      roleAssignment: {
        agentRoles: { 'dev-01': 'Coder', 'audit-01': 'Auditor' },
        stageRoles: { spec: 'Product', implement: 'Coder', review: 'Auditor' },
      },
    }, null, 2));
    for (const dir of ['specs', 'contracts', 'artifacts', 'pipelines']) fs.mkdirSync(path.join(tmpDir, dir));

    const doctor = await runCli(['doctor']);
    expect(doctor.exitCode).toBe(1);
    expect(doctor.output).toContain('blocked dispatch');
    expect(doctor.output).toContain('Errors: 1');
  });
});
