/**
 * CLI unit tests — argument parsing and command registration.
 */

import { describe, it, expect } from 'vitest';
import { createProgram } from '../index.js';

describe('CLI createProgram', () => {
  it('creates a program with correct name and version', () => {
    const program = createProgram();
    expect(program.name()).toBe('sevo');
    // Locked-in regression check (1.13.0 returned 'unknown' due to wrong package name).
    // Real package.json must resolve to a semver string, never 'unknown' from this repo.
    expect(program.version()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('registers all CLI commands (excluding help which is built-in)', () => {
    const program = createProgram();
    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain('init');
    expect(commandNames).toContain('create');
    expect(commandNames).toContain('status');
    expect(commandNames).toContain('advance');
    expect(commandNames).toContain('doctor');
    expect(commandNames).toContain('list');
    expect(commandNames).toContain('show');
    expect(commandNames).toContain('config');
    expect(commandNames).toContain('export');
    expect(commandNames).toContain('fr');
    expect(commandNames).toContain('pause');
    expect(commandNames).toContain('resume');
    expect(commandNames).toContain('cancel');
    expect(commandNames).toContain('ledger');
    expect(commandNames).toContain('demo');
    expect(commandNames).toContain('goal');
    expect(commandNames).toContain('from');
    expect(commandNames).toContain('verify');
    expect(commandNames).toContain('scan');
    expect(commandNames).toContain('gate');
    expect(commandNames).toContain('project');
    expect(commandNames).toHaveLength(21);
  });

  it('init command has --name, --adapter, --force options', () => {
    const program = createProgram();
    const init = program.commands.find((c) => c.name() === 'init')!;
    const optNames = init.options.map((o) => o.long);
    expect(optNames).toContain('--name');
    expect(optNames).toContain('--adapter');
    expect(optNames).toContain('--force');
  });

  it('create command requires project-slug argument', () => {
    const program = createProgram();
    const create = program.commands.find((c) => c.name() === 'create')!;
    // Commander stores registered args
    const args = create.registeredArguments ?? [];
    expect(args.length).toBeGreaterThanOrEqual(1);
    expect(args[0]?.name()).toBe('project-slug');
    expect(args[0]?.required).toBe(true);
  });

  it('status command accepts optional instance-id', () => {
    const program = createProgram();
    const status = program.commands.find((c) => c.name() === 'status')!;
    const args = status.registeredArguments ?? [];
    expect(args.length).toBeGreaterThanOrEqual(1);
    expect(args[0]?.name()).toBe('instance-id');
    expect(args[0]?.required).toBe(false);
  });

  it('advance command requires pipeline-id and has --dry-run', () => {
    const program = createProgram();
    const advance = program.commands.find((c) => c.name() === 'advance')!;
    const args = advance.registeredArguments ?? [];
    expect(args[0]?.name()).toBe('pipeline-id');
    expect(args[0]?.required).toBe(true);
    const optNames = advance.options.map((o) => o.long);
    expect(optNames).toContain('--dry-run');
    expect(optNames).toContain('--stage');
    expect(optNames).toContain('--force');
    expect(optNames).toContain('--auto-advance');
  });

  it('doctor command has --json option', () => {
    const program = createProgram();
    const doctor = program.commands.find((c) => c.name() === 'doctor')!;
    const optNames = doctor.options.map((o) => o.long);
    expect(optNames).toContain('--json');
  });

  it('show command requires instance-id and has --json, --stages', () => {
    const program = createProgram();
    const show = program.commands.find((c) => c.name() === 'show')!;
    const args = show.registeredArguments ?? [];
    expect(args[0]?.name()).toBe('instance-id');
    expect(args[0]?.required).toBe(true);
    const optNames = show.options.map((o) => o.long);
    expect(optNames).toContain('--json');
    expect(optNames).toContain('--stages');
  });

  it('config command has --get, --set, --json options', () => {
    const program = createProgram();
    const config = program.commands.find((c) => c.name() === 'config')!;
    const optNames = config.options.map((o) => o.long);
    expect(optNames).toContain('--get');
    expect(optNames).toContain('--set');
    expect(optNames).toContain('--json');
  });

  it('export command has --output, --format, --project options', () => {
    const program = createProgram();
    const exp = program.commands.find((c) => c.name() === 'export')!;
    const optNames = exp.options.map((o) => o.long);
    expect(optNames).toContain('--output');
    expect(optNames).toContain('--format');
    expect(optNames).toContain('--project');
  });

  it('list command has --projects and --pipelines options', () => {
    const program = createProgram();
    const list = program.commands.find((c) => c.name() === 'list')!;
    const optNames = list.options.map((o) => o.long);
    expect(optNames).toContain('--projects');
    expect(optNames).toContain('--pipelines');
  });
});
