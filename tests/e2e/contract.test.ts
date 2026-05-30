import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBootstrapInjection } from '../../skill/contract/scripts/inject.ts';

const FIXTURE_ROOT = path.resolve(import.meta.dirname, '..', 'fixtures', 'skill-e2e-project');

describe('contract skill e2e', () => {
  it('inject.ts returns the expected bootstrap constraints', () => {
    const output = buildBootstrapInjection(FIXTURE_ROOT);

    expect(output).toContain('skill: contract');
    expect(output).toContain('mappedStage: plan');

    for (const keyword of [
      "Stage: plan",
      "Product Requirements Spec (full)",
      "Stage constraint: keep architecture aligned",
    ]) {
      expect(output).toContain(keyword);
    }
  });
});
