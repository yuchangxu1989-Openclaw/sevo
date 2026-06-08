import { describe, it, expect } from 'vitest';
import * as mod from '../index.js';

// P1-3 (task list item 3): a completion must be claimed at most once so a
// re-delivered subagent_ended for the same (pipeline, stage, attempt, delivery)
// cannot double-advance the pipeline.
// P1-4 (task list item 4): completions for the same pipeline must serialize so
// two concurrent handler runs cannot interleave at their awaits.
describe('P1-3 completion idempotency claim', () => {
  it('claims a completion once and rejects the duplicate delivery', () => {
    const args = {
      pipelineId: `pipe-claim-${Date.now()}`,
      stageId: 'implement',
      attempt: 1,
      label: 'sevo:claimdemo:implement:1',
      status: 'succeeded',
      completionId: 'task:claim-123',
    };

    const first = mod.claimCompletionForAdvance(args);
    const second = mod.claimCompletionForAdvance(args);

    expect(first.claimed).toBe(true);
    expect(second.claimed).toBe(false);
    expect(second.key).toBe(first.key);
  });

  it('lets a genuine retry (new delivery id) claim independently', () => {
    const base = {
      pipelineId: `pipe-retry-${Date.now()}`,
      stageId: 'review',
      attempt: 1,
      label: 'sevo:retrydemo:review:1',
      status: 'succeeded',
    };

    const first = mod.claimCompletionForAdvance({ ...base, completionId: 'task:a' });
    const retry = mod.claimCompletionForAdvance({ ...base, completionId: 'task:b' });

    expect(first.claimed).toBe(true);
    expect(retry.claimed).toBe(true);
    expect(retry.key).not.toBe(first.key);
  });
});

describe('P1-4 per-pipeline async serialization', () => {
  it('serializes overlapping completion work for the same pipeline', async () => {
    const events: string[] = [];
    const slow = (tag: string, delay: number) => async () => {
      events.push(`${tag}:start`);
      await new Promise(r => setTimeout(r, delay));
      events.push(`${tag}:end`);
    };

    // Launch two locked sections for the same pipeline at once. Without the lock
    // the faster section would finish inside the slower one (interleaved).
    const p1 = mod.withPipelineLock('pipe-serial', slow('A', 40));
    const p2 = mod.withPipelineLock('pipe-serial', slow('B', 5));
    await Promise.all([p1, p2]);

    // A must fully complete before B starts.
    expect(events).toEqual(['A:start', 'A:end', 'B:start', 'B:end']);
  });

  it('runs different pipelines without blocking each other', async () => {
    const order: string[] = [];
    const p1 = mod.withPipelineLock('pipe-1', async () => {
      await new Promise(r => setTimeout(r, 30));
      order.push('one');
    });
    const p2 = mod.withPipelineLock('pipe-2', async () => {
      order.push('two');
    });
    await Promise.all([p1, p2]);
    // pipe-2 (no contention) finishes before the slow pipe-1.
    expect(order).toEqual(['two', 'one']);
  });

  it('does not let a thrown section break the chain for the next caller', async () => {
    await expect(
      mod.withPipelineLock('pipe-throw', async () => { throw new Error('boom'); })
    ).rejects.toThrow('boom');

    const result = await mod.withPipelineLock('pipe-throw', async () => 'recovered');
    expect(result).toBe('recovered');
  });
});
