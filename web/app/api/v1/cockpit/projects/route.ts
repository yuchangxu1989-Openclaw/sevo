/**
 * GET /api/v1/cockpit/projects
 * Cockpit project list (FR-45a AC-45a.1) — name, active pipeline count,
 * last advanced time. All fields derived from real pipeline runtime state.
 */

import { NextResponse } from 'next/server';
import { getCockpitProjects } from '@/lib/engine-service';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ projects: getCockpitProjects() });
}
