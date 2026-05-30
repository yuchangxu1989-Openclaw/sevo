/**
 * GET /api/v1/frs/:id/artifacts
 * FR 工件列表
 */

import { NextResponse } from 'next/server';
import { getFrArtifacts } from '@/lib/engine-service';
import { errorResponse } from '@/lib/api-helpers';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const artifacts = getFrArtifacts(params.id);
  if (!artifacts) {
    return errorResponse(404, 'NOT_FOUND', `FR not found: ${params.id}`, {
      resourceType: 'fr',
      resourceId: params.id,
    });
  }
  return NextResponse.json({ artifacts });
}
