/**
 * GET /api/v1/dashboard/summary
 * UFR-01: 全局概览 — FR 总数、各宏阶段分布、健康评分
 */

import { NextResponse } from 'next/server';
import { getDashboardSummary } from '@/lib/engine-service';

export async function GET() {
  const summary = getDashboardSummary();
  return NextResponse.json(summary);
}
