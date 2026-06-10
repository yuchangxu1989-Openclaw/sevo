import fs from 'node:fs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as mod from '../index.js';

const GLOBAL_KEY = Symbol.for('openclaw.sevo-pipeline.instance');
const g = () => (globalThis as any)[GLOBAL_KEY];

// V2 disables the old V1 durable replay queue. Pending runtime state may still be
// persisted as an empty cleanup marker, but restart hydration must not resurrect
// stale notices or advances from disk.
describe('V2 pending-runtime cleanup + injection ledger lifecycle', () => {
  beforeEach(() => {
    const state = g();
    state.pendingNotices = [];
    state.pendingAdvances = new Map();
    state.injectedAdvances = new Map();
    try { fs.unlinkSync(mod.PENDING_RUNTIME_PATH); } catch { /* fresh */ }
  });

  afterEach(() => {
    const state = g();
    state.pendingNotices = [];
    state.pendingAdvances = new Map();
    state.injectedAdvances = new Map();
    try { fs.unlinkSync(mod.PENDING_RUNTIME_PATH); } catch { /* best-effort */ }
  });

  it('does not hydrate stale V1 notices or advances after a restart', () => {
    const state = g();
    state.pendingNotices.push('[SEVO 恢复] restart-survivor notice');
    state.pendingAdvances.set('pipe-restart', [{
      stageId: 'implement',
      label: 'sevo:demo:implement:1',
      taskDescription: 'do the thing',
      agentId: 'codex',
      timeout: 1200,
    }]);

    mod.persistPendingRuntimeState();
    expect(fs.existsSync(mod.PENDING_RUNTIME_PATH)).toBe(true);

    // Simulate restart: wipe in-memory state, then hydrate from disk.
    state.pendingNotices = [];
    state.pendingAdvances = new Map();
    state.injectedAdvances = new Map();

    mod.hydratePendingRuntimeState();

    expect(g().pendingNotices).toEqual([]);
    expect(g().pendingAdvances.size).toBe(0);
    expect(g().injectedAdvances.size).toBe(0);
  });

  it('consume moves advances into the injected ledger instead of dropping them', () => {
    const state = g();
    state.pendingAdvances.set('pipe-ack', [{
      stageId: 'implement',
      label: 'sevo:ackdemo:implement:1',
      taskDescription: 'task body',
      agentId: 'codex',
      timeout: 1200,
    }]);

    const { advances } = mod.consumePendingAdvances();
    expect(advances.map((a: any) => a.label)).toContain('sevo:ackdemo:implement:1');
    // In-memory queue cleared, but the advance is tracked as injected (unacked).
    expect(g().pendingAdvances.size).toBe(0);
    expect(g().injectedAdvances.has('sevo:ackdemo:implement:1')).toBe(true);
    expect(g().injectedAdvances.get('sevo:ackdemo:implement:1').injectedCount).toBe(1);
  });

});
