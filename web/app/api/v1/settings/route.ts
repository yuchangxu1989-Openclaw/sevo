import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/engine-service';

export const dynamic = 'force-dynamic';

export function GET() {
  const data = getSettings();
  return NextResponse.json(data);
}
