/**
 * GET /api/v1/cockpit/projects/:projectId
 * Cockpit project detail (FR-45a AC-45a.2) — all pipelines for the project
 * (active + historical) plus FR coverage. Real runtime only.
 */

import { NextResponse } from 'next/server';
import { getCockpitProjectDetail } from '@/lib/engine-service';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } },
) {
  const detail = getCockpitProjectDetail(params.projectId);
  if (!detail) {
    return NextResponse.json({ code: 'NOT_FOUND', message: '项目不存在或暂无运行态数据' }, { status: 404 });
  }
  return NextResponse.json(detail);
}
