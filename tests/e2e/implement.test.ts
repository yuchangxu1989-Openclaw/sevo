import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBootstrapInjection } from '../../skill/implement/scripts/inject.ts';

const FIXTURE_ROOT = path.resolve(import.meta.dirname, '..', 'fixtures', 'skill-e2e-project');

describe('implement skill e2e', () => {
  it('inject.ts returns the expected bootstrap constraints', () => {
    const output = buildBootstrapInjection(FIXTURE_ROOT);

    expect(output).toContain('skill: implement');
    expect(output).toContain('mappedStage: implement');

    for (const keyword of [
      "Stage: implement",
      "Skill Interface Definitions",
      "Stage constraint: honor Skill interface definitions",
    ]) {
      expect(output).toContain(keyword);
    }
  });
});
