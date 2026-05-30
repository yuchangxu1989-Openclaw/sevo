/**
 * GET /api/v1/events/stream
 * SSE 实时事件推送 (arc42 §8.4B)
 *
 * Uses ReadableStream + TextEncoder per task requirements.
 * Sends heartbeat every 30s to keep connection alive.
 * Event topics: project.updated, fr.updated, todo.updated, notification.created, health.changed
 */

import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();
  const abortController = new AbortController();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      const connectEvent = formatSseEvent('connected', {
        eventType: 'connected' as const,
        targetType: 'system',
        targetId: 'sevo',
        occurredAt: new Date().toISOString(),
        traceId: `trc_${randomUUID().slice(0, 12)}`,
        payload: { message: 'SSE connection established' },
      });
      controller.enqueue(encoder.encode(connectEvent));

      // Heartbeat every 30 seconds
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30_000);

      // Example: periodic mock event every 60s (in production, engine events drive this)
      const mockEvents = setInterval(() => {
        try {
          const event = formatSseEvent('fr.updated', {
            eventType: 'fr.updated' as const,
            targetType: 'fr',
            targetId: 'pi-sevo-20260420-001',
            occurredAt: new Date().toISOString(),
            traceId: `trc_${randomUUID().slice(0, 12)}`,
            payload: { stage: 'contract', status: 'active' },
          });
          controller.enqueue(encoder.encode(event));
        } catch {
          clearInterval(mockEvents);
        }
      }, 60_000);

      // Cleanup on abort signal
      abortController.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        clearInterval(mockEvents);
      });
    },
    cancel() {
      abortController.abort();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

function formatSseEvent(eventType: string, data: Record<string, unknown>): string {
  return `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}
