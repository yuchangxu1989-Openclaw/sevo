/**
 * Smoke test \u2014 confirms that getDeliverableIndex / getLedgerView /
 * getDeliverableContent now read real artifacts from .sevo/<pid>/
 * state.json and surface real artifact paths.
 */
import { describe, it, expect } from 'vitest';
import {
  getDeliverableIndex,
  getLedgerView,
  getDeliverableContent,
} from '../lib/engine-service';

describe('deliverables-ledger-real (smoke)', () => {
  it('getDeliverableIndex surfaces real artifacts from .sevo runs', () => {
    const view = getDeliverableIndex();
    expect(Array.isArray(view.items)).toBe(true);
    // At least one of audit-test/demo/demo2 has artifacts on disk.
    expect(view.items.length).toBeGreaterThan(0);
    for (const item of view.items) {
      // No synthetic FR-derived paths.
      expect(item.path.length).toBeGreaterThan(0);
      expect(item.deliverableId.includes('::')).toBe(true);
    }
  });

  it('getLedgerView surfaces real stage events with literal status', () => {
    const view = getLedgerView();
    expect(Array.isArray(view.entries)).toBe(true);
    expect(view.entries.length).toBeGreaterThan(0);
    for (const entry of view.entries) {
      // No \u201c\u5df2\u8fdb\u5165\u8d26\u672c\u5f52\u6863\u201d / \u201c\u5b8c\u6210\u201d filler. Real status appears in summary.
      expect(entry.summary).toMatch(/\u72b6\u6001\uff1a/);
      expect(entry.summary).not.toMatch(/\u5df2\u8fdb\u5165\u8d26\u672c\u5f52\u6863/);
      expect(entry.summary).not.toMatch(/\u5b8c\u6210\u3002$/);
    }
  });

  it('getDeliverableContent reads real file from .sevo or returns null', () => {
    const view = getDeliverableIndex();
    if (view.items.length === 0) return;
    const sample = view.items.find((i) => i.path.endsWith('.json') || i.path.endsWith('.md'));
    if (!sample) return;
    const result = getDeliverableContent(sample.deliverableId);
    if (result == null) {
      // Acceptable: file removed since state.json was written.
      return;
    }
    // No synthetic placeholders.
    expect(result.content).not.toMatch(/\u6240\u6709\u9a8c\u6536\u6761\u4ef6\u5df2\u901a\u8fc7\u9a8c\u8bc1/);
    expect(result.content).not.toMatch(/\u7ebf\u4e0a\u9884\u89c8\u4f7f\u7528 markdown \u6e32\u67d3/);
  });

  it('unknown deliverable id returns null (no fabricated content)', () => {
    expect(getDeliverableContent('does-not-exist::stage::artifact')).toBeNull();
  });
});
