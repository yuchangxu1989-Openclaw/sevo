/**
 * GET /api/v1/projects
 * Projects list — grouped FR summary per project
 */

import { NextResponse } from 'next/server';
import { listProjects } from '@/lib/engine-service';

export async function GET() {
  const projects = listProjects();
  return NextResponse.json({ projects });
}
