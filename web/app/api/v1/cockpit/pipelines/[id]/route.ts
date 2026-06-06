/**
 * GET /api/v1/cockpit/pipelines/:id
 * Cockpit pipeline detail (FR-45a AC-45a.4, AC-45a.5) — stage timeline with
 * entered/completed times and artifacts, plus current blocker. Real runtime only.
 */

import { NextResponse } from 'next/server';
import { getCockpitPipelineDetail } from '@/lib/engine-service';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const detail = getCockpitPipelineDetail(params.id);
  if (!detail) {
    return NextResponse.json({ code: 'NOT_FOUND', message: '流水线不存在或暂无运行态数据' }, { status: 404 });
  }
  return NextResponse.json(detail);
}
