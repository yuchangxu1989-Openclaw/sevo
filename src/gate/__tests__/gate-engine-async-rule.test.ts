import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ArtifactRef } from '../../types/index.js';
import { GateEngine } from '../gate-engine.js';
import type { GateRule } from '../gate-rule.js';

function artifact(): ArtifactRef {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'sevo-gate-async-'));
  const filePath = path.join(tempDir, 'artifact.md');
  writeFileSync(filePath, 'x', 'utf8');
  return {
    id: 'artifact:async',
    type: 'file',
    path: filePath,
    createdAt: '2026-05-24T00:00:00.000Z',
    metadata: { cleanupDir: tempDir },
  };
}

function cleanup(ref: ArtifactRef): void {
  const cleanupDir = ref.metadata?.['cleanupDir'];
  if (typeof cleanupDir === 'string') rmSync(cleanupDir, { recursive: true, force: true });
}

describe('GateEngine async rule evaluation', () => {
  it('blocks sync evaluation when a registered rule requires async LLM evaluation', () => {
    const engine = new GateEngine();
    const asyncRule: GateRule = {
      id: 'async-rule',
      appliesTo: ['spec-review-gate'],
      async evaluate() {
        return { pass: true, message: 'ok', severity: 'blocker' };
      },
    };
    engine.registerRule(asyncRule);
    const ref = artifact();

    try {
      const verdict = engine.evaluateGate('spec-review-gate', [ref]);
      expect(verdict.pass).toBe(false);
      expect(verdict.blockers[0]).toContain('requires asynchronous LLM evaluation');
    } finally {
      cleanup(ref);
    }
  });

  it('awaits async rules through evaluateGateAsync', async () => {
    const engine = new GateEngine();
    const asyncRule: GateRule = {
      id: 'async-rule',
      appliesTo: ['spec-review-gate'],
      async evaluate() {
        return { pass: true, message: 'ok', severity: 'blocker' };
      },
    };
    engine.registerRule(asyncRule);
    const ref = artifact();

    try {
      const verdict = await engine.evaluateGateAsync('spec-review-gate', [ref]);
      expect(verdict.pass).toBe(true);
      expect(verdict.blockers).toHaveLength(0);
    } finally {
      cleanup(ref);
    }
  });
});
