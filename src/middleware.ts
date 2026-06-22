import { NextResponse, type NextRequest } from "next/server";

/**
 * Authentication middleware.
 *
 * Protects all `/api/*` routes except `/api/auth/login` and `/api/auth/me`
 * (the latter returns whether the session is active, so it must be public).
 * The page itself (`/`) handles its own auth state client-side.
 *
 * Note: We can't use the full HMAC verification here (middleware runs in the
 * edge runtime without access to the database), so we only do a lightweight
 * presence check on the cookie. The real verification happens in
 * `requireAuth()` on each API route via `getSession()`.
 */

const PUBLIC_API_ROUTES = new Set([
  "/api/auth/login",
  "/api/auth/login/2fa",
  "/api/auth/me",
]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/api/")) {
    if (PUBLIC_API_ROUTES.has(pathname)) {
      return NextResponse.next();
    }
    const cookie = req.cookies.get("tg_admin_session")?.value;
    if (!cookie) {
      return NextResponse.json(
        { error: "Authentication required", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    // Cookie present — let the request through; the route handler will
    // run the full signature verification via requireAuth().
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
