import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

type AuditMeta = { ip?: string; userAgent?: string } & Record<string, unknown>;

/**
 * Parse the `meta` JSON column of an audit log row and extract the
 * `ip` + `userAgent` fields (if present) so they can be surfaced as
 * top-level fields in the API response. This keeps the activity-log UI
 * backward compatible — it still gets `meta` as a string, and now also
 * gets dedicated `ip` / `userAgent` fields when available.
 */
function unpackMeta(metaRaw: string | null): {
  meta: string | null;
  ip: string | null;
  userAgent: string | null;
} {
  if (!metaRaw) return { meta: null, ip: null, userAgent: null };
  let parsed: AuditMeta | null = null;
  try {
    parsed = JSON.parse(metaRaw) as AuditMeta;
  } catch {
    // Corrupt JSON — leave as-is.
    return { meta: metaRaw, ip: null, userAgent: null };
  }
  const { ip, userAgent, ...rest } = parsed;
  const hasOther = Object.keys(rest).length > 0;
  return {
    meta: hasOther ? JSON.stringify(rest) : null,
    ip: typeof ip === "string" ? ip : null,
    userAgent: typeof userAgent === "string" ? userAgent : null,
  };
}

/**
 * GET /api/audit-logs
 * Returns recent audit log entries with optional filters: ?action=, ?entity=,
 * ?limit= (default 100), ?since=ISO-date.
 */
export async function GET(req: NextRequest) {
  // Defense in depth: the middleware already gates this route, but we also
  // verify the session signature explicitly here.
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action") || undefined;
  const entity = url.searchParams.get("entity") || undefined;
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10) || 100, 500);
  const sinceRaw = url.searchParams.get("since");
  const since = sinceRaw ? new Date(sinceRaw) : undefined;

  // Combine filters via Prisma `AND` so all active filters narrow the result set
  // together. Existing `?since=`, `?action=`, and `?entity=` params continue to
  // work, and any combination of them is supported.
  const andClauses: Record<string, unknown>[] = [];
  if (action) andClauses.push({ action });
  if (entity) andClauses.push({ entity });
  if (since && !Number.isNaN(since.getTime())) andClauses.push({ createdAt: { gte: since } });
  const where = andClauses.length > 0 ? { AND: andClauses } : {};

  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    db.auditLog.count({ where }),
  ]);

  // Unpack ip + userAgent from each row's `meta` JSON so the activity log UI
  // can display them as dedicated columns without parsing JSON client-side.
  const rowsWithMeta = rows.map((row) => {
    const { meta, ip, userAgent } = unpackMeta(row.meta);
    return { ...row, meta, ip, userAgent };
  });

  // Per-entity and per-action breakdowns for the UI.
  // Prisma 6 groupBy requires explicit field for _count; we use id and sort
  // manually after fetching.
  const allLogsForGroups = await db.auditLog.findMany({
    where,
    select: { entity: true, action: true },
  });
  const entityCounts = new Map<string, number>();
  const actionCounts = new Map<string, number>();
  for (const log of allLogsForGroups) {
    entityCounts.set(log.entity, (entityCounts.get(log.entity) || 0) + 1);
    actionCounts.set(log.action, (actionCounts.get(log.action) || 0) + 1);
  }
  const entities = Array.from(entityCounts.entries())
    .map(([entity, count]) => ({ entity, count }))
    .sort((a, b) => b.count - a.count);
  const actions = Array.from(actionCounts.entries())
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    rows: rowsWithMeta,
    total,
    entities,
    actions,
  });
}

/**
 * DELETE /api/audit-logs
 * Clears audit logs older than ?before=ISO-date. If no date is given, clears
 * everything. Useful for privacy / storage cleanup.
 */
export async function DELETE(req: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const beforeRaw = url.searchParams.get("before");
  const before = beforeRaw ? new Date(beforeRaw) : undefined;
  const where = before && !Number.isNaN(before.getTime()) ? { createdAt: { lt: before } } : {};
  const result = await db.auditLog.deleteMany({ where });
  return NextResponse.json({ deleted: result.count });
}
