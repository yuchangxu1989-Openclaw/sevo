/**
 * GET /api/v1/projects/:projectId/fr-matrix
 * UFR-13: FR 全景矩阵视图 — FR × 4 宏阶段矩阵
 */

import { NextResponse } from 'next/server';
import { getFrMatrix } from '@/lib/engine-service';

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } },
) {
  const matrix = getFrMatrix(params.projectId);
  return NextResponse.json(matrix);
}
