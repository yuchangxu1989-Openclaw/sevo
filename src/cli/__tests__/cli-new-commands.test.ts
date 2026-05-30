/**
 * CLI tests — new commands: fr, pause, resume, cancel, ledger.
 */

import { describe, it, expect } from 'vitest';
import { createProgram } from '../index.js';

describe('CLI new commands registration', () => {
  it('registers fr command', () => {
    const program = createProgram();
    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain('fr');
  });

  it('registers pause command', () => {
    const program = createProgram();
    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain('pause');
  });

  it('registers resume command', () => {
    const program = createProgram();
    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain('resume');
  });

  it('registers cancel command', () => {
    const program = createProgram();
    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain('cancel');
  });

  it('registers ledger command', () => {
    const program = createProgram();
    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain('ledger');
  });

  it('fr command has add and list subcommands', () => {
    const program = createProgram();
    const fr = program.commands.find((c) => c.name() === 'fr')!;
    const subNames = fr.commands.map((c) => c.name());
    expect(subNames).toContain('add');
    expect(subNames).toContain('list');
  });

  it('pause command requires pipeline-id argument', () => {
    const program = createProgram();
    const pause = program.commands.find((c) => c.name() === 'pause')!;
    const args = pause.registeredArguments ?? [];
    expect(args.length).toBeGreaterThanOrEqual(1);
    expect(args[0]?.name()).toBe('pipeline-id');
    expect(args[0]?.required).toBe(true);
  });

  it('resume command requires pipeline-id argument', () => {
    const program = createProgram();
    const resume = program.commands.find((c) => c.name() === 'resume')!;
    const args = resume.registeredArguments ?? [];
    expect(args.length).toBeGreaterThanOrEqual(1);
    expect(args[0]?.name()).toBe('pipeline-id');
    expect(args[0]?.required).toBe(true);
  });

  it('cancel command requires pipeline-id argument', () => {
    const program = createProgram();
    const cancel = program.commands.find((c) => c.name() === 'cancel')!;
    const args = cancel.registeredArguments ?? [];
    expect(args.length).toBeGreaterThanOrEqual(1);
    expect(args[0]?.name()).toBe('pipeline-id');
    expect(args[0]?.required).toBe(true);
  });

  it('ledger command requires pipeline-id argument', () => {
    const program = createProgram();
    const ledger = program.commands.find((c) => c.name() === 'ledger')!;
    const args = ledger.registeredArguments ?? [];
    expect(args.length).toBeGreaterThanOrEqual(1);
    expect(args[0]?.name()).toBe('pipeline-id');
    expect(args[0]?.required).toBe(true);
  });

  it('ledger command has --limit and --json options', () => {
    const program = createProgram();
    const ledger = program.commands.find((c) => c.name() === 'ledger')!;
    const optNames = ledger.options.map((o) => o.long);
    expect(optNames).toContain('--limit');
    expect(optNames).toContain('--json');
  });

  it('now registers 20 commands total', () => {
    const program = createProgram();
    const commandNames = program.commands.map((c) => c.name());
    expect(commandNames).toContain('verify');
    expect(commandNames).toContain('scan');
    expect(commandNames).toContain('gate');
    expect(commandNames).toContain('project');
    expect(commandNames).toHaveLength(21);
  });
});
