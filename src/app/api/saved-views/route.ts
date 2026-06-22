import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/saved-views
 * Returns all saved views, newest first. Auth required.
 */
export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rows = await db.savedView.findMany({
    orderBy: { updatedAt: "desc" },
  });
  // Parse the `filters` JSON column on the server so the client doesn't have
  // to. Invalid JSON falls back to an empty filter object.
  const views = rows.map((row) => {
    let filters: unknown = null;
    try {
      filters = JSON.parse(row.filters);
    } catch {
      filters = null;
    }
    return {
      id: row.id,
      name: row.name,
      filters,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });
  return NextResponse.json({ views });
}

/**
 * POST /api/saved-views
 * Create a new saved view. Body: { name: string, filters: { status, search, repeat } }
 *  - name must be non-empty and ≤60 chars
 *  - filters must be a plain object
 */
export async function POST(req: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (name.length > 60) {
    return NextResponse.json({ error: "Name must be 60 characters or fewer" }, { status: 400 });
  }
  const filters = body.filters;
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) {
    return NextResponse.json({ error: "filters must be an object" }, { status: 400 });
  }
  const filtersJson = JSON.stringify(filters);
  const created = await db.savedView.create({
    data: { name, filters: filtersJson },
  });
  await audit("create", "scheduled", {
    title: "Saved view created",
    detail: `Saved view "${name}" created`,
    entityId: created.id,
  }).catch(() => {});
  return NextResponse.json({
    view: {
      id: created.id,
      name: created.name,
      filters,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    },
  });
}
