/**
 * GET /api/v1/todos
 * UFR-03: 待办决策队列 — 聚合 gate/clarification/failure 待办
 */

import { NextResponse } from 'next/server';
import { listTodos } from '@/lib/engine-service';

export async function GET() {
  const todos = listTodos();
  return NextResponse.json({ items: todos, total: todos.length });
}
