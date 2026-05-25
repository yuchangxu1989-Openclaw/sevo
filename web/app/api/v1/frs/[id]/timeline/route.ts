/**
 * GET /api/v1/frs/:id/timeline
 * FR 阶段时间线
 */

import { NextResponse } from 'next/server';
import { getFrTimeline } from '@/lib/engine-service';
import { errorResponse } from '@/lib/api-helpers';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const timeline = getFrTimeline(params.id);
  if (!timeline) {
    return errorResponse(404, 'NOT_FOUND', `FR not found: ${params.id}`, {
      resourceType: 'fr',
      resourceId: params.id,
    });
  }
  return NextResponse.json({ timeline });
}
