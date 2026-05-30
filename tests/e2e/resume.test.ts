import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBootstrapInjection } from '../../skill/resume/scripts/inject.ts';

const FIXTURE_ROOT = path.resolve(import.meta.dirname, '..', 'fixtures', 'skill-e2e-project');

describe('resume skill e2e', () => {
  it('inject.ts returns the expected bootstrap constraints', () => {
    const output = buildBootstrapInjection(FIXTURE_ROOT);

    expect(output).toContain('skill: resume');
    expect(output).toContain('mappedStage: implement');

    for (const keyword of [
      "Stage: implement",
      "Module Boundaries",
      "Governance constraint: recover execution",
    ]) {
      expect(output).toContain(keyword);
    }
  });
});
