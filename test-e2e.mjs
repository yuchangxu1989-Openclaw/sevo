/**
 * SEVO Pipeline E2E Smoke Test
 * Tests plugin load, setup, hook registration, and simulated hook calls.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const results = [];
let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(() => {
        results.push({ name, status: 'PASS' });
        passCount++;
      }).catch(err => {
        results.push({ name, status: 'FAIL', error: String(err?.message || err) });
        failCount++;
      });
    }
    results.push({ name, status: 'PASS' });
    passCount++;
  } catch (err) {
    results.push({ name, status: 'FAIL', error: String(err?.message || err) });
    failCount++;
  }
  return Promise.resolve();
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

// ═══════════════════════════════════════════════════════════
// Test Suite
// ═══════════════════════════════════════════════════════════

console.log('=== SEVO Pipeline E2E Smoke Test ===\n');

// ── 1. Module Loading ──

await test('label-protocol: import succeeds', async () => {
  const mod = await import('./label-protocol.js');
  assert(typeof mod.encode === 'function', 'encode not a function');
  assert(typeof mod.decode === 'function', 'decode not a function');
  assert(typeof mod.isSevoLabel === 'function', 'isSevoLabel not a function');
});
await test('label-protocol: encode/decode roundtrip', async () => {
  const { encode, decode, isSevoLabel } = await import('./label-protocol.js');
  const label = encode('pipe-1', 'spec', 2);
  assert(label === 'sevo:pipe-1:spec:2', `unexpected label: ${label}`);
  assert(isSevoLabel(label), 'isSevoLabel should be true');
  const parsed = decode(label);
  assert(parsed.pipelineId === 'pipe-1', 'pipelineId mismatch');
  assert(parsed.stageId === 'spec', 'stageId mismatch');
  assert(parsed.attempt === 2, 'attempt mismatch');
});

await test('label-protocol: decode invalid returns null', async () => {
  const { decode } = await import('./label-protocol.js');
  assert(decode(null) === null, 'null should return null');
  assert(decode('') === null, 'empty should return null');
  assert(decode('not-sevo:x:y') === null, 'non-sevo prefix should return null');
});

await test('utils: import succeeds', async () => {
  const mod = await import('./utils.js');
  assert(typeof mod.normalizePlainObject === 'function');
  assert(typeof mod.readStateConfig === 'function');
  assert(typeof mod.resolveConfiguredPath === 'function');
});

await test('utils: normalizePlainObject', async () => {
  const { normalizePlainObject } = await import('./utils.js');
  assert(JSON.stringify(normalizePlainObject(null)) === '{}');
  assert(JSON.stringify(normalizePlainObject([1])) === '{}');
  assert(JSON.stringify(normalizePlainObject({ a: 1 })) === '{"a":1}');
});

await test('utils: resolveConfiguredPath', async () => {
  const { resolveConfiguredPath } = await import('./utils.js');
  assert(resolveConfiguredPath('/base', null, '/fallback') === '/fallback');
  assert(resolveConfiguredPath('/base', '', '/fallback') === '/fallback');
  assert(resolveConfiguredPath('/base', '/abs/path', '/fallback') === '/abs/path');
  const rel = resolveConfiguredPath('/base', 'rel/path', '/fallback');
  assert(rel === path.resolve('/base', 'rel/path'), `relative resolve failed: ${rel}`);
});

// ── 2. Legacy Bridge Module ──

await test('bridge: removed from v2 package surface', async () => {
  assert(!fs.existsSync(path.join(__dirname, 'dist')), 'dist/ should not exist in v2 package');
});

await test('bridge: source compatibility file is absent or no dist-backed runtime is available', async () => {
  const bridgePath = path.join(__dirname, 'bridge.js');
  if (!fs.existsSync(bridgePath)) return;
  const mod = await import('./bridge.js');
  const availability = mod.isAvailable();
  assert(availability !== true, 'dist-backed bridge should not report active availability');
});

// ── 3. Task Mapper ──

await test('task-mapper: import succeeds', async () => {
  const mod = await import('./task-mapper.js');
  assert(typeof mod.buildTaskPrompt === 'function');
  assert(typeof mod.getStageMapping === 'function');
  assert(typeof mod.setTaskMapperConfig === 'function');
  assert(typeof mod.extractACsFromSpec === 'function');
  assert(typeof mod.collectArtifactPaths === 'function');
});

await test('task-mapper: getStageMapping returns 14 stages', async () => {
  const { getStageMapping } = await import('./task-mapper.js');
  const stages = ['spec', 'spec-review-gate', 'test-case-authoring',
    'ux-acceptance-authoring', 'commercial-acceptance-authoring',
    'contract', 'contract-review-gate', 'implement', 'review', 'regression',
    'publish-generalization-gate', 'deploy', 'verify', 'ledger'];
  for (const s of stages) {
    const m = getStageMapping(s);
    assert(m && typeof m === 'object', `stage ${s} mapping missing`);
    assert(typeof m.tier === 'string' || m.tier === null, `stage ${s} tier invalid`);
  }
});

// ── 4. Plugin Default Export ──

await test('index: default export has correct shape', async () => {
  const mod = await import('./index.js');
  const plugin = mod.default;
  assert(plugin, 'default export missing');
  assert(plugin.id === 'sevo-pipeline', `id mismatch: ${plugin.id}`);
  assert(typeof plugin.register === 'function', 'register not a function');
});

// ── 5. Plugin Register ──

await test('index: register() in active mode', async () => {
  const mod = await import('./index.js');
  const plugin = mod.default;
  const logs = { info: [], warn: [], error: [] };
  const hooks = {};
  const fakeApi = {
    config: {},
    logger: {
      info: (msg) => logs.info.push(msg),
      warn: (msg) => logs.warn.push(msg),
      error: (msg) => logs.error.push(msg),
    },
    on: (event, handler, opts) => {
      hooks[event] = hooks[event] || [];
      hooks[event].push({ handler, opts });
    },
  };
  plugin.register(fakeApi);
  const hookNames = Object.keys(hooks);
  console.log(`    Registered hooks: ${hookNames.join(', ')}`);
  assert(hookNames.length > 0, 'should register hooks in active mode');
  assert(hookNames.includes('subagent_ended'), 'should register subagent_ended hook');
  assert(hookNames.includes('before_prompt_build'), 'should register before_prompt_build hook');
  assert(hookNames.includes('before_tool_call'), 'should register before_tool_call hook');
});

// ── 6. sevoGlobal initialization ──

await test('index: sevoGlobal Maps initialized', async () => {
  const SEVO_KEY = Symbol.for('openclaw.sevo-pipeline.instance');
  const g = globalThis[SEVO_KEY];
  assert(g, 'sevoGlobal not found');
  assert(g.pendingAdvances instanceof Map, 'pendingAdvances not a Map');
  assert(g.pendingClarifications instanceof Map, 'pendingClarifications not a Map');
  assert(g.activeStageTimers instanceof Map, 'activeStageTimers not a Map');
  assert(g.failureHistory instanceof Map, 'failureHistory not a Map');
  assert(g.reviewFixLoops instanceof Map, 'reviewFixLoops not a Map');
  assert(Array.isArray(g.pendingNotices), 'pendingNotices not an array');
});

// ── 7. Hook Simulation: subagent_ended with sevo label ──

await test('hook: subagent_ended ignores non-sevo labels', async () => {
  const mod = await import('./index.js');
  const plugin = mod.default;
  const hooks = {};
  const fakeApi = {
    config: {},
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    on: (event, handler, opts) => {
      hooks[event] = hooks[event] || [];
      hooks[event].push({ handler, opts });
    },
  };
  plugin.register(fakeApi);
  const subagentHandlers = hooks['subagent_ended'] || [];
  assert(subagentHandlers.length > 0, 'no subagent_ended handlers');
  // Call with non-sevo label — should return without error
  const result = await subagentHandlers[0].handler({ label: 'not-sevo', status: 'succeeded' });
  // safeSevoHook wraps, so null/undefined is fine
});

await test('hook: subagent_ended processes sevo label', async () => {
  const { encode } = await import('./label-protocol.js');
  const mod = await import('./index.js');
  const plugin = mod.default;
  const hooks = {};
  const fakeApi = {
    config: {},
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    on: (event, handler, opts) => {
      hooks[event] = hooks[event] || [];
      hooks[event].push({ handler, opts });
    },
  };
  plugin.register(fakeApi);
  const label = encode('test-pipe', 'implement', 1);
  const subagentHandlers = hooks['subagent_ended'] || [];
  // Should not throw — may log events
  await subagentHandlers[0].handler({
    label,
    status: 'succeeded',
    exitCode: 0,
    output: 'task completed',
  });
});

// ── 8. Hook Simulation: before_tool_call ──

await test('hook: before_tool_call ignores non-spawn tools', async () => {
  const mod = await import('./index.js');
  const plugin = mod.default;
  const hooks = {};
  const fakeApi = {
    config: {},
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    on: (event, handler, opts) => {
      hooks[event] = hooks[event] || [];
      hooks[event].push({ handler, opts });
    },
  };
  plugin.register(fakeApi);
  const btcHandlers = hooks['before_tool_call'] || [];
  assert(btcHandlers.length > 0, 'no before_tool_call handlers');
  const result = await btcHandlers[0].handler({ tool: 'Read', params: {} });
});

// ═══════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════

console.log('\n--- Results ---');
for (const r of results) {
  const mark = r.status === 'PASS' ? '✓' : '✗';
  console.log(`  ${mark} ${r.name}${r.error ? ` — ${r.error}` : ''}`);
}
console.log(`\nTotal: ${results.length} | Pass: ${passCount} | Fail: ${failCount}`);

if (failCount > 0) {
  console.log('\n[FAILURES]');
  for (const r of results.filter(r => r.status === 'FAIL')) {
    console.log(`  ${r.name}: ${r.error}`);
  }
}

process.exit(failCount > 0 ? 1 : 0);
