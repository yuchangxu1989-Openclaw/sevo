/**
 * GET /api/v1/deliverables/:id/content
 * Returns raw content of a deliverable for preview/download
 */

import { NextResponse } from 'next/server';
import { getDeliverableContent } from '@/lib/engine-service';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const result = getDeliverableContent(params.id);
  if (!result) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(result);
}
