/**
 * GET /api/v1/analytics
 * UFR-10: 跨项目统计面板
 */

import { NextResponse } from 'next/server';
import { getCrossProjectAnalytics } from '@/lib/engine-service';
import type { AnalyticsTimeRange } from '@/types';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const range = (searchParams.get('range') as AnalyticsTimeRange | null) ?? '30d';
  const payload = getCrossProjectAnalytics(range);
  return NextResponse.json(payload);
}
