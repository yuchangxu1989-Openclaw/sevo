/**
 * POST /api/v1/gates/:id/request-review
 * UFR-04: 门禁请求复审
 */

import { NextResponse } from 'next/server';
import { requestGateReview } from '@/lib/engine-service';
import { errorResponse, parseCommandBody, traceId } from '@/lib/api-helpers';

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const parsed = await parseCommandBody(request);
  if (parsed instanceof NextResponse) return parsed;

  const reason = typeof parsed.raw['reason'] === 'string' ? parsed.raw['reason'] : undefined;
  const result = requestGateReview(params.id, parsed.body, reason);
  if (!result.success) {
    const code = result.error === 'VERSION_CONFLICT' ? 'VERSION_CONFLICT'
      : result.error === 'DUPLICATE_REQUEST' ? 'DUPLICATE_REQUEST'
      : result.error?.includes('not found') ? 'NOT_FOUND' : 'CONFLICT';
    const status = code === 'NOT_FOUND' ? 404 : 409;
    return errorResponse(status, code, result.error ?? 'Request review failed');
  }

  return NextResponse.json(
    { code: 'ACCEPTED', requestId: parsed.body.requestId, traceId: traceId() },
    { status: 202 },
  );
}
