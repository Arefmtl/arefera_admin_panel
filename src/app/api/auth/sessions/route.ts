import { NextResponse } from "next/server";
import { requireAuth, getCurrentSessionId, getClientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/sessions — list all active sessions.
 *
 * Returns the sessions sorted by `lastSeenAt` desc, with the current
 * session (matching the cookie's signature) flagged via `isCurrent: true`.
 * Each row includes parsed `browser` + `os` strings derived from the
 * stored User-Agent.
 */
export async function GET(req: Request) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const currentId = await getCurrentSessionId();

  const rows = await db.session.findMany({
    where: { active: true },
    orderBy: { lastSeenAt: "desc" },
  });

  const sessions = rows.map((row) => {
    const parsed = parseUserAgent(row.userAgent);
    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      lastSeenAt: row.lastSeenAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      ip: row.ip,
      userAgent: row.userAgent,
      isCurrent: row.id === currentId,
      browser: parsed.browser,
      os: parsed.os,
    };
  });

  return NextResponse.json({ sessions });
}

/**
 * POST /api/auth/sessions — revoke all sessions EXCEPT the current one.
 *
 * Convenience bulk endpoint used by the "Revoke all other sessions" button.
 * Returns `{ ok: true, revoked: <count> }`. Audit-logs the action.
 */
export async function POST(req: Request) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const currentId = await getCurrentSessionId();
  if (!currentId) {
    return NextResponse.json({ error: "No current session" }, { status: 400 });
  }

  // Find the rows we're about to revoke so we can describe them in the
  // audit log (count + sample of IPs).
  const others = await db.session.findMany({
    where: { active: true, id: { not: currentId } },
    select: { id: true, ip: true, userAgent: true },
  });

  await db.session.updateMany({
    where: { active: true, id: { not: currentId } },
    data: { active: false },
  });

  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? undefined;
  await audit("bulk", "auth", {
    title: "Revoked all other sessions",
    detail: `${others.length} session(s) signed out.`,
    actor: "admin",
    ip,
    userAgent,
    meta: {
      revokedIds: others.map((o) => o.id),
      revokedIps: others.map((o) => o.ip).filter(Boolean),
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, revoked: others.length });
}

/**
 * Parse a User-Agent string into `{ browser, os }`.
 *
 * Intentionally simple regex-based detection — no library dependency. The
 * goal is a friendly label in the UI ("Chrome on macOS"), not a complete
 * device fingerprint. Unknown values fall back to "Unknown".
 */
function parseUserAgent(ua: string | null): { browser: string; os: string } {
  if (!ua) return { browser: "Unknown", os: "Unknown" };

  // Browser detection — order matters because some UAs include multiple
  // browser keywords (e.g. "Chrome" appears in Edge UAs, "Safari" appears
  // in Chrome UAs). We check the more specific ones first.
  let browser = "Unknown";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browser = "Chrome";
  else if (/Chromium\//i.test(ua)) browser = "Chromium";
  else if (/Safari\//i.test(ua)) browser = "Safari";
  else if (/MSIE|Trident\//i.test(ua)) browser = "Internet Explorer";

  // OS detection — match the major desktop + mobile platforms.
  let os = "Unknown";
  if (/Windows NT 10/i.test(ua)) os = "Windows";
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/Linux/i.test(ua)) os = "Linux";
  else if (/CrOS/i.test(ua)) os = "Chrome OS";

  return { browser, os };
}
