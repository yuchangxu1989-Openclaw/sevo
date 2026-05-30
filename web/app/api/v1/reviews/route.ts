import { NextResponse } from 'next/server';
import { getReviewTracking } from '@/lib/engine-service';

export const dynamic = 'force-dynamic';

export function GET() {
  const data = getReviewTracking();
  return NextResponse.json(data);
}
