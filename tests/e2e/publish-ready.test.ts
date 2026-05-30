/**
 * End-to-end test: validates the full publish-ready chain.
 *
 * Skill install → inject.ts → ContextInjector (via public API) → constraint text output.
 * This test imports from the package root (src/index.ts) to confirm the public API surface works.
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ContextInjector, PIPELINE_STAGES } from '../../src/index.js';
import { buildBootstrapInjection as specifyInject } from '../../skill/specify/scripts/inject.ts';
import { buildBootstrapInjection as contractInject } from '../../skill/contract/scripts/inject.ts';
import { buildBootstrapInjection as implementInject } from '../../skill/implement/scripts/inject.ts';
import { buildBootstrapInjection as reviewInject } from '../../skill/review/scripts/inject.ts';

const FIXTURE_ROOT = path.resolve(import.meta.dirname, '..', 'fixtures', 'skill-e2e-project');

describe('publish-ready e2e: Skill install → inject.ts → ContextInjector → constraint output', () => {
  it('ContextInjector is importable from package root and produces stage-aware output', () => {
    const injector = new ContextInjector();

    for (const stage of PIPELINE_STAGES) {
      const output = injector.buildInjection(FIXTURE_ROOT, stage);
      expect(output).toContain(`Stage: ${stage}`);
      expect(output.length).toBeGreaterThan(50);
    }
  });

  it('each skill inject.ts produces valid constraint text referencing ContextInjector output', () => {
    const cases = [
      { name: 'specify', fn: specifyInject, stage: 'specify', constraint: 'clarify vision' },
      { name: 'contract', fn: contractInject, stage: 'plan', constraint: 'architecture aligned' },
      { name: 'implement', fn: implementInject, stage: 'implement', constraint: '' },
      { name: 'review', fn: reviewInject, stage: 'review', constraint: '' },
    ] as const;

    for (const { name, fn, stage, constraint } of cases) {
      const output = fn(FIXTURE_ROOT);

      // Validates inject.ts → ContextInjector chain
      expect(output).toContain(`skill: ${name}`);
      expect(output).toContain(`mappedStage: ${stage}`);
      expect(output).toContain('SEVO bootstrap injection');
      expect(output).toContain(`Stage: ${stage}`);

      if (constraint) {
        expect(output).toContain(constraint);
      }
    }
  });

  it('PIPELINE_STAGES exports the correct 4 stages', () => {
    expect(PIPELINE_STAGES).toEqual(['specify', 'plan', 'implement', 'review']);
  });
});
