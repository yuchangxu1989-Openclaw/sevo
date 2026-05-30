/**
 * POST /api/v1/frs/:id/pause
 * UFR-08: 暂停 FR
 */

import { NextResponse } from 'next/server';
import { pauseFr } from '@/lib/engine-service';
import { errorResponse, parseCommandBody, traceId } from '@/lib/api-helpers';

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const parsed = await parseCommandBody(request);
  if (parsed instanceof NextResponse) return parsed;

  const result = pauseFr(params.id, parsed.body);
  if (!result.success) {
    const code = result.error === 'VERSION_CONFLICT' ? 'VERSION_CONFLICT'
      : result.error === 'DUPLICATE_REQUEST' ? 'DUPLICATE_REQUEST'
      : result.error?.includes('not found') ? 'NOT_FOUND' : 'CONFLICT';
    const status = code === 'NOT_FOUND' ? 404 : 409;
    return errorResponse(status, code, result.error ?? 'Pause failed');
  }

  return NextResponse.json(
    { code: 'ACCEPTED', requestId: parsed.body.requestId, traceId: traceId() },
    { status: 202 },
  );
}
