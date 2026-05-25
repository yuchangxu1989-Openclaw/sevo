/**
 * GET  /api/v1/notification-preferences — 获取通知偏好
 * POST /api/v1/notification-preferences — 创建通知偏好
 */

import { NextResponse, type NextRequest } from 'next/server';
import {
  getNotificationPreferences,
  createNotificationPreference,
} from '@/lib/engine-service';
import { errorResponse } from '@/lib/api-helpers';

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId') ?? undefined;
  const prefs = getNotificationPreferences(userId);
  return NextResponse.json({ items: prefs });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON');
  }

  const userId = body['userId'];
  const channels = body['channels'];
  const severityFilter = body['severityFilter'];

  if (typeof userId !== 'string' || userId.length === 0) {
    return errorResponse(400, 'MISSING_FIELD', 'userId is required', { field: 'userId' });
  }
  if (!Array.isArray(channels) || channels.length === 0) {
    return errorResponse(400, 'MISSING_FIELD', 'channels is required', { field: 'channels' });
  }
  if (!Array.isArray(severityFilter) || severityFilter.length === 0) {
    return errorResponse(400, 'MISSING_FIELD', 'severityFilter is required', { field: 'severityFilter' });
  }

  const pref = createNotificationPreference({
    userId,
    channels: channels as ('web' | 'im')[],
    severityFilter: severityFilter as ('info' | 'warning' | 'critical')[],
    quietHours: body['quietHours'] as { start: string; end: string; timezone: string } | undefined,
    enabled: typeof body['enabled'] === 'boolean' ? body['enabled'] : undefined,
  });

  return NextResponse.json(pref, { status: 201 });
}
