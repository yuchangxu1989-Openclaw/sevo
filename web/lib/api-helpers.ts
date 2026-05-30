/**
 * Shared API helpers — error formatting, request parsing, response builders.
 */

import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import type { ApiError, CommandRequest } from '@/types';

/** Build a standardized error response (arc42 §8.1.1). */
export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): NextResponse<ApiError> {
  return NextResponse.json(
    { code, message, details, traceId: `trc_${randomUUID().slice(0, 12)}` },
    { status },
  );
}

/** Parse and validate command request body fields. Returns null + error response if invalid. */
export async function parseCommandBody(
  request: Request,
): Promise<{ body: CommandRequest; raw: Record<string, unknown> } | NextResponse<ApiError>> {
  let raw: Record<string, unknown>;
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON');
  }

  const actorId = raw['actorId'];
  const requestId = raw['requestId'];

  if (typeof actorId !== 'string' || actorId.length === 0) {
    return errorResponse(400, 'MISSING_FIELD', 'actorId is required', { field: 'actorId' });
  }
  if (typeof requestId !== 'string' || requestId.length === 0) {
    return errorResponse(400, 'MISSING_FIELD', 'requestId is required', { field: 'requestId' });
  }

  const expectedVersion = typeof raw['expectedVersion'] === 'number' ? raw['expectedVersion'] : undefined;

  return {
    body: { actorId, requestId, expectedVersion },
    raw,
  };
}

/** Parse pagination params from URL search params. */
export function parsePagination(searchParams: URLSearchParams): { page: number; pageSize: number } {
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '20', 10) || 20));
  return { page, pageSize };
}

/** Generate a trace ID for responses. */
export function traceId(): string {
  return `trc_${randomUUID().slice(0, 12)}`;
}
