/**
 * GET /api/v1/deliverables
 * UFR-06: 全局交付物索引
 */

import { NextResponse } from 'next/server';
import { getDeliverableIndex } from '@/lib/engine-service';

export async function GET() {
  const payload = getDeliverableIndex();
  return NextResponse.json(payload);
}
