/**
 * POST /api/v1/notifications/:id/read
 * UFR-07: 标记通知为已读
 */

import { NextResponse } from 'next/server';
import { markNotificationRead } from '@/lib/engine-service';
import { errorResponse } from '@/lib/api-helpers';

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const result = markNotificationRead(params.id);
  if (!result) {
    return errorResponse(404, 'NOT_FOUND', `Notification not found: ${params.id}`, {
      resourceType: 'notification',
      resourceId: params.id,
    });
  }

  return NextResponse.json(result);
}
