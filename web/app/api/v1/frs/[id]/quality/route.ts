/**
 * GET /api/v1/frs/:id/quality
 * UFR-05: FR 质量概览 — Review/Regression/Verify 摘要
 */

import { NextResponse } from 'next/server';
import { getFrQuality } from '@/lib/engine-service';
import { errorResponse } from '@/lib/api-helpers';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const quality = getFrQuality(params.id);
  if (!quality) {
    return errorResponse(404, 'NOT_FOUND', `FR not found: ${params.id}`, {
      resourceType: 'fr',
      resourceId: params.id,
    });
  }
  return NextResponse.json(quality);
}
