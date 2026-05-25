import { NextResponse } from "next/server";
import { hasSession } from "@/lib/session-store";

export async function GET(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(/sevo_session=([^;]+)/);
  const token = match?.[1];

  if (!token || !hasSession(token)) {
    return NextResponse.json({ valid: false }, { status: 401 });
  }

  return NextResponse.json({ valid: true });
}
