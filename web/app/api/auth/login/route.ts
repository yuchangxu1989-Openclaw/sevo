import { NextResponse } from "next/server";
import { timingSafeEqual, randomUUID } from "crypto";
import { addSession } from "@/lib/session-store";

const COOKIE_NAME = "sevo_session";
const MAX_AGE = 7 * 24 * 60 * 60; // 7 days

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");
  if (bufA.length !== bufB.length) {
    // Compare against self to keep constant time, then return false
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export async function POST(request: Request) {
  const authPassword = process.env.AUTH_PASSWORD;

  // m6: Don't reveal whether password is configured or not
  if (!authPassword) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  try {
    const { password } = await request.json();

    if (!password || !safeCompare(password, authPassword)) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    // M2: Random session token instead of deterministic hash
    const sessionToken = randomUUID();
    addSession(sessionToken);

    const response = NextResponse.json({ ok: true });
    response.cookies.set(COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: MAX_AGE,
      path: "/sevo",
    });

    return response;
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
