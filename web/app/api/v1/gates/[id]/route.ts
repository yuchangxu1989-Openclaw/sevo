/**
 * GET /api/v1/gates/:id
 * UFR-04: 门禁详情
 */

import { NextResponse } from 'next/server';
import { getGate } from '@/lib/engine-service';
import { errorResponse } from '@/lib/api-helpers';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const gate = getGate(params.id);
  if (!gate) {
    return errorResponse(404, 'NOT_FOUND', `Gate not found: ${params.id}`, {
      resourceType: 'gate',
      resourceId: params.id,
    });
  }
  return NextResponse.json(gate);
}
