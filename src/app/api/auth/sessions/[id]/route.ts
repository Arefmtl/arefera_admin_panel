import { NextResponse } from "next/server";
import { requireAuth, revokeSession, getCurrentSessionId, getClientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/auth/sessions/[id] — revoke a specific session.
 *
 * Marks the Session row as `active=false`. The row is preserved for the
 * audit trail (IP + UA + lastSeenAt). The current session cannot be
 * revoked via this endpoint — the user must use the Sign out button
 * instead (which clears the cookie in addition to deactivating the row).
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Session id required" }, { status: 400 });
  }

  // Don't allow revoking the current session through this endpoint — the
  // user should use Sign out instead, which also clears the cookie.
  const currentId = await getCurrentSessionId();
  if (currentId && id === currentId) {
    return NextResponse.json(
      { error: "Use Sign out to end your current session" },
      { status: 400 },
    );
  }

  // Look up the row first so we can return 404 for missing/already-inactive
  // sessions and include useful context in the audit log.
  const row = await db.session.findUnique({ where: { id } });
  if (!row || !row.active) {
    return NextResponse.json(
      { error: "Session not found or already revoked" },
      { status: 404 },
    );
  }

  const ok = await revokeSession(id);
  if (!ok) {
    return NextResponse.json(
      { error: "Session not found or already revoked" },
      { status: 404 },
    );
  }

  await audit("delete", "auth", {
    entityId: id,
    title: "Session revoked",
    detail: `Admin revoked a session (IP: ${row.ip ?? "unknown"}, UA: ${row.userAgent ?? "unknown"})`,
    actor: "admin",
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
    meta: {
      revokedIp: row.ip,
      revokedUserAgent: row.userAgent,
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
