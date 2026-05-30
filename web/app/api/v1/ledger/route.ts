/**
 * GET /api/v1/ledger
 * UFR-12: 交付账本浏览
 */

import { NextResponse } from 'next/server';
import { getLedgerView } from '@/lib/engine-service';

export async function GET() {
  const payload = getLedgerView();
  return NextResponse.json(payload);
}
