import { describe, it, expect, beforeEach } from 'vitest';
import { EventLedger } from '../ledger.js';

describe('EventLedger', () => {
  let ledger: EventLedger;

  beforeEach(() => {
    ledger = new EventLedger();
  });

  it('appends events and retrieves history', () => {
    const evt = ledger.append('p1', { type: 'pipeline_created', detail: { slug: 'test' } });

    expect(evt.pipelineId).toBe('p1');
    expect(evt.type).toBe('pipeline_created');
    expect(evt.timestamp).toBeTruthy();
    expect(evt.detail).toEqual({ slug: 'test' });

    const history = ledger.getHistory('p1');
    expect(history).toHaveLength(1);
    expect(history[0]).toBe(evt);
  });

  it('returns empty array for unknown pipeline', () => {
    expect(ledger.getHistory('unknown')).toEqual([]);
  });

  it('keeps events per pipeline isolated', () => {
    ledger.append('p1', { type: 'pipeline_created' });
    ledger.append('p2', { type: 'pipeline_created' });
    ledger.append('p1', { type: 'pipeline_running' });

    expect(ledger.getHistory('p1')).toHaveLength(2);
    expect(ledger.getHistory('p2')).toHaveLength(1);
  });

  it('getAllEvents returns all events sorted by timestamp descending', () => {
    ledger.append('p1', { type: 'pipeline_created' });
    ledger.append('p2', { type: 'pipeline_created' });
    ledger.append('p1', { type: 'pipeline_running' });

    const all = ledger.getAllEvents();
    expect(all).toHaveLength(3);
    // Most recent first
    for (let i = 0; i < all.length - 1; i++) {
      expect(all[i]!.timestamp >= all[i + 1]!.timestamp).toBe(true);
    }
  });

  it('clear removes all events', () => {
    ledger.append('p1', { type: 'pipeline_created' });
    ledger.clear();
    expect(ledger.getHistory('p1')).toEqual([]);
    expect(ledger.getAllEvents()).toEqual([]);
  });

  it('appends events with stageId', () => {
    const evt = ledger.append('p1', { type: 'stage_started', stageId: 'spec' });
    expect(evt.stageId).toBe('spec');
  });
});
