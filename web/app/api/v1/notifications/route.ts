/**
 * GET /api/v1/notifications
 * UFR-07: 通知记录列表
 */

import { NextResponse, type NextRequest } from 'next/server';
import { listNotifications } from '@/lib/engine-service';
import { parsePagination } from '@/lib/api-helpers';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const { page, pageSize } = parsePagination(searchParams);

  const severity = searchParams.get('severity') ?? undefined;
  const read = searchParams.get('read') ?? undefined;

  const result = listNotifications({ severity, read, page, pageSize });

  return NextResponse.json({
    items: result.items,
    total: result.total,
    page,
    pageSize,
  });
}
