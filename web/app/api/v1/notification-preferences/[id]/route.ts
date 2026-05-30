/**
 * PATCH /api/v1/notification-preferences/:id — 更新通知偏好
 */

import { NextResponse } from 'next/server';
import { updateNotificationPreference, deleteNotificationPreference } from '@/lib/engine-service';
import { errorResponse } from '@/lib/api-helpers';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON');
  }

  const patch: Record<string, unknown> = {};
  if (body['channels'] !== undefined) patch['channels'] = body['channels'];
  if (body['severityFilter'] !== undefined) patch['severityFilter'] = body['severityFilter'];
  if (body['quietHours'] !== undefined) patch['quietHours'] = body['quietHours'];
  if (body['enabled'] !== undefined) patch['enabled'] = body['enabled'];

  const updated = updateNotificationPreference(params.id, patch as Parameters<typeof updateNotificationPreference>[1]);
  if (!updated) {
    return errorResponse(404, 'NOT_FOUND', `Notification preference not found: ${params.id}`, {
      resourceType: 'notification-preference',
      resourceId: params.id,
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const deleted = deleteNotificationPreference(params.id);
  if (!deleted) {
    return errorResponse(404, 'NOT_FOUND', `Notification preference not found: ${params.id}`, {
      resourceType: 'notification-preference',
      resourceId: params.id,
    });
  }

  return new NextResponse(null, { status: 204 });
}
