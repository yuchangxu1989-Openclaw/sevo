import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBootstrapInjection } from '../../skill/gate/scripts/inject.ts';

const FIXTURE_ROOT = path.resolve(import.meta.dirname, '..', 'fixtures', 'skill-e2e-project');

describe('gate skill e2e', () => {
  it('inject.ts returns the expected bootstrap constraints', () => {
    const output = buildBootstrapInjection(FIXTURE_ROOT);

    expect(output).toContain('skill: gate');
    expect(output).toContain('mappedStage: review');

    for (const keyword of [
      "Stage: review",
      "Acceptance Criteria",
      "Governance constraint: aggregate reviewer verdicts",
    ]) {
      expect(output).toContain(keyword);
    }
  });
});
