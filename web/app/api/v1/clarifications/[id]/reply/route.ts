/**
 * POST /api/v1/clarifications/:id/reply
 * UFR-03/UFR-11: 澄清回复提交
 */

import { NextResponse } from 'next/server';
import { replyClarification } from '@/lib/engine-service';
import { errorResponse, parseCommandBody, traceId } from '@/lib/api-helpers';

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const parsed = await parseCommandBody(request);
  if (parsed instanceof NextResponse) return parsed;

  const content = parsed.raw['content'];
  if (typeof content !== 'string' || content.length === 0) {
    return errorResponse(400, 'MISSING_FIELD', 'content is required', { field: 'content' });
  }

  const result = replyClarification(params.id, parsed.body, content);
  if (!result.success) {
    const code = result.error === 'VERSION_CONFLICT' ? 'VERSION_CONFLICT'
      : result.error === 'DUPLICATE_REQUEST' ? 'DUPLICATE_REQUEST'
      : result.error?.includes('not found') ? 'NOT_FOUND' : 'CONFLICT';
    const status = code === 'NOT_FOUND' ? 404 : 409;
    return errorResponse(status, code, result.error ?? 'Reply failed');
  }

  return NextResponse.json(
    { code: 'ACCEPTED', requestId: parsed.body.requestId, traceId: traceId() },
    { status: 202 },
  );
}
