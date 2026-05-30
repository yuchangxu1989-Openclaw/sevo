/**
 * GET /api/v1/frs/:id
 * UFR-02: FR 详情 — 含阶段时间线、当前细阶段、工件列表
 */

import { NextResponse } from 'next/server';
import { getFrDetail } from '@/lib/engine-service';
import { errorResponse } from '@/lib/api-helpers';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const detail = getFrDetail(params.id);
  if (!detail) {
    return errorResponse(404, 'NOT_FOUND', `FR not found: ${params.id}`, {
      resourceType: 'fr',
      resourceId: params.id,
    });
  }
  return NextResponse.json(detail);
}
