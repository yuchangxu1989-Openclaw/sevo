/**
 * GET /api/v1/clarifications/:id
 * UFR-03/UFR-11: 澄清上下文读取
 */

import { NextResponse } from 'next/server';
import { getClarification } from '@/lib/engine-service';
import { errorResponse } from '@/lib/api-helpers';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const clr = getClarification(params.id);
  if (!clr) {
    return errorResponse(404, 'NOT_FOUND', `Clarification not found: ${params.id}`, {
      resourceType: 'clarification',
      resourceId: params.id,
    });
  }
  return NextResponse.json(clr);
}
