import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "sevo_session";
// UUID v4 format check
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname ?? "/";

  if (pathname === "/login") {
    const portalUrl = request.nextUrl.clone();
    portalUrl.pathname = "/portal";
    return NextResponse.redirect(portalUrl);
  }

  // Public routes — no auth required
  if (
    pathname === "/" ||
    pathname === "/portal" ||
    pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next();
  }

  // Allow static assets and Next.js internals
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get(COOKIE_NAME)?.value;

  if (!sessionToken || !UUID_RE.test(sessionToken)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/portal";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
