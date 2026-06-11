import { describe, expect, it } from 'vitest';
import fs from 'fs';
import plugin from '../index.js';

const INDEX_PATH = new URL('../index.js', import.meta.url);

describe('SEVO plugin entrypoint', () => {
  it('stays a thin V2 entrypoint without legacy V1 route handlers', () => {
    const source = fs.readFileSync(INDEX_PATH, 'utf8');
    const lineCount = source.trimEnd().split('\n').length;

    expect(lineCount).toBeLessThan(100);
    expect(source).toContain("from './src/index.js'");
    expect(source).toContain("from './src/fr37-audit-reminder.js'");
    expect(source).not.toContain('routeFn');
    expect(source).not.toContain('resolveCompletionSevoLabel');
    expect(source).not.toContain('loadActivePipelinesWithMigration');
  });

  it('exports OpenClaw plugin metadata and register hook', () => {
    expect(plugin.id).toBe('sevo-pipeline');
    expect(plugin.name).toBe('SEVO Pipeline Auto-Advance');
    expect(plugin.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(typeof plugin.register).toBe('function');
  });
});
