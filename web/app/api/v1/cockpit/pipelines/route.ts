/**
 * GET /api/v1/cockpit/pipelines
 * Cockpit pipeline list (FR-45a AC-45a.3) — status, current stage, created
 * time, last advanced time per pipeline. Real runtime only.
 */

import { NextResponse } from 'next/server';
import { getCockpitPipelines } from '@/lib/engine-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ pipelines: getCockpitPipelines() });
}
