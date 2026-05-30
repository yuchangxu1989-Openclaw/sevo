import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBootstrapInjection } from '../../skill/ledger/scripts/inject.ts';

const FIXTURE_ROOT = path.resolve(import.meta.dirname, '..', 'fixtures', 'skill-e2e-project');

describe('ledger skill e2e', () => {
  it('inject.ts returns the expected bootstrap constraints', () => {
    const output = buildBootstrapInjection(FIXTURE_ROOT);

    expect(output).toContain('skill: ledger');
    expect(output).toContain('mappedStage: review');

    for (const keyword of [
      "Stage: review",
      "Acceptance Criteria",
      "Governance constraint: preserve end-to-end evidence",
    ]) {
      expect(output).toContain(keyword);
    }
  });
});
