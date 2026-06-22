import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function GET() {
  const admins = await db.admin.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(admins);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !body.telegramId) {
    return NextResponse.json({ error: "telegramId is required" }, { status: 400 });
  }
  const telegramId = String(body.telegramId).trim();
  if (!/^-?\d+$/.test(telegramId)) {
    return NextResponse.json({ error: "Telegram ID must be numeric" }, { status: 400 });
  }
  const existing = await db.admin.findUnique({ where: { telegramId } });
  if (existing) {
    return NextResponse.json({ error: "This admin already exists" }, { status: 409 });
  }
  const created = await db.admin.create({
    data: { telegramId, name: body.name?.trim() || null },
  });
  await audit("create", "admin", {
    entityId: created.id,
    title: created.name || created.telegramId,
    detail: `Added admin ${created.name || created.telegramId}`,
    meta: { telegramId },
  });
  return NextResponse.json(created, { status: 201 });
}
