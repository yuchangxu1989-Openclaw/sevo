import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBootstrapInjection } from '../../skill/pipeline-create/scripts/inject.ts';

const FIXTURE_ROOT = path.resolve(import.meta.dirname, '..', 'fixtures', 'skill-e2e-project');

describe('pipeline-create skill e2e', () => {
  it('inject.ts returns the expected bootstrap constraints', () => {
    const output = buildBootstrapInjection(FIXTURE_ROOT);

    expect(output).toContain('skill: pipeline-create');
    expect(output).toContain('mappedStage: specify');

    for (const keyword of [
      "Stage: specify",
      "Vision:",
      "Entry constraint: classify task level",
    ]) {
      expect(output).toContain(keyword);
    }
  });
});
