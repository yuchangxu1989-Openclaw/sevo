import { describe, expect, it } from 'vitest';
import fs from 'fs';

const INDEX_PATH = new URL('../index.js', import.meta.url);

function collectRouteFnCallsMissingAwait(source: string) {
  const missingAwaitCalls: Array<{ line: number; column: number }> = [];
  const callPattern = /\brouteFn\s*\(/g;

  for (const match of source.matchAll(callPattern)) {
    const matchIndex = match.index ?? 0;
    const beforeCall = source.slice(0, matchIndex).trimEnd();

    if (!/\bawait$/.test(beforeCall)) {
      const line = source.slice(0, matchIndex).split('\n').length;
      const lineStart = source.lastIndexOf('\n', matchIndex - 1) + 1;
      missingAwaitCalls.push({ line, column: matchIndex - lineStart + 1 });
    }
  }

  return missingAwaitCalls;
}

describe('routeFn async regression guard', () => {
  it('awaits every routeFn invocation in index.js', () => {
    const source = fs.readFileSync(INDEX_PATH, 'utf8');
    const routeFnCalls = Array.from(source.matchAll(/\brouteFn\s*\(/g));
    const missingAwaitCalls = collectRouteFnCallsMissingAwait(source);

    expect(routeFnCalls.length).toBeGreaterThanOrEqual(4);
    expect(missingAwaitCalls).toEqual([]);
  });
});
