/**
 * GET /api/v1/events/stream
 * SSE 实时事件推送 (arc42 §8.4B)
 *
 * Uses ReadableStream + TextEncoder per task requirements.
 * Sends heartbeat every 30s to keep connection alive.
 * Event topics: project.updated, fr.updated, todo.updated, notification.created, health.changed
 */

import { getEventStreamEvents } from '@/lib/engine-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  const encoder = new TextEncoder();
  const events = getEventStreamEvents();
  const abortController = new AbortController();

  const stream = new ReadableStream({
    start(controller) {
      for (const data of events) {
        const eventType = String(data.eventType ?? data.type ?? 'runtime.event');
        controller.enqueue(encoder.encode(formatSseEvent(eventType, data)));
      }

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30_000);

      abortController.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
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
