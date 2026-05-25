import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBootstrapInjection } from '../../skill/specify/scripts/inject.ts';

const FIXTURE_ROOT = path.resolve(import.meta.dirname, '..', 'fixtures', 'skill-e2e-project');

describe('specify skill e2e', () => {
  it('inject.ts returns the expected bootstrap constraints', () => {
    const output = buildBootstrapInjection(FIXTURE_ROOT);

    expect(output).toContain('skill: specify');
    expect(output).toContain('mappedStage: specify');

    for (const keyword of [
      "Stage: specify",
      "Vision:",
      "Stage constraint: clarify vision",
    ]) {
      expect(output).toContain(keyword);
    }
  });
});
