import { describe, expect, it } from 'vitest';
import { buildCompletionDedupeKey, getCompletionDeliveryId } from '../index.js';

describe('completion dedupe regression guard', () => {
  it('dedupes duplicate deliveries from the same completion instance', () => {
    const event = {
      taskId: 'task-123',
      sessionId: 'session-ignored-when-task-exists',
      id: 'evt-ignored-when-task-exists',
    };

    const deliveryId = getCompletionDeliveryId(event);
    expect(deliveryId).toBe('task:task-123');
    expect(buildCompletionDedupeKey('pipe-1', 'implement', 1, deliveryId)).toBe(
      'pipe-1:implement:1:task:task-123'
    );
  });

  it('does not collapse legitimate retries when task ids differ', () => {
    const first = buildCompletionDedupeKey('pipe-1', 'implement', 1, getCompletionDeliveryId({ taskId: 'task-1' }));
    const retry = buildCompletionDedupeKey('pipe-1', 'implement', 1, getCompletionDeliveryId({ taskId: 'task-2' }));

    expect(first).not.toBe(retry);
  });

  it('does not collapse legitimate retries when attempt increments without a delivery id', () => {
    const first = buildCompletionDedupeKey('pipe-1', 'implement', 1, null);
    const retry = buildCompletionDedupeKey('pipe-1', 'implement', 2, null);

    expect(first).toBe('pipe-1:implement:1');
    expect(retry).toBe('pipe-1:implement:2');
    expect(first).not.toBe(retry);
  });
});
