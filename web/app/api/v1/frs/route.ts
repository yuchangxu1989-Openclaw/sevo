/**
 * GET /api/v1/frs
 * UFR-01a: FR 列表 — 筛选、分页、排序
 */

import { NextResponse, type NextRequest } from 'next/server';
import { listFrs } from '@/lib/engine-service';
import { parsePagination } from '@/lib/api-helpers';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const { page, pageSize } = parsePagination(searchParams);

  const stage = searchParams.get('stage') ?? undefined;
  const status = searchParams.get('status') ?? undefined;
  const sort = searchParams.get('sort') ?? undefined;

  const result = listFrs({ stage, status, sort, page, pageSize });

  return NextResponse.json({
    items: result.items,
    total: result.total,
    page,
    pageSize,
  });
}
