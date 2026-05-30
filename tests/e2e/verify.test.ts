import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBootstrapInjection } from '../../skill/verify/scripts/inject.ts';

const FIXTURE_ROOT = path.resolve(import.meta.dirname, '..', 'fixtures', 'skill-e2e-project');

describe('verify skill e2e', () => {
  it('inject.ts returns the expected bootstrap constraints', () => {
    const output = buildBootstrapInjection(FIXTURE_ROOT);

    expect(output).toContain('skill: verify');
    expect(output).toContain('mappedStage: review');

    for (const keyword of [
      "Stage: review",
      "Acceptance Criteria",
      "Stage constraint: confirm acceptance criteria",
    ]) {
      expect(output).toContain(keyword);
    }
  });
});
