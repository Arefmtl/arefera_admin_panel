import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function GET() {
  const templates = await db.template.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !body.name || !body.text) {
    return NextResponse.json({ error: "name and text are required" }, { status: 400 });
  }
  const created = await db.template.create({
    data: {
      name: String(body.name).trim(),
      text: String(body.text),
      format: body.format === "html" ? "html" : "markdown",
      buttons: body.buttons ? JSON.stringify(body.buttons) : null,
      category: typeof body.category === "string" ? body.category.trim() || "general" : "general",
    },
  });
  await audit("create", "template", {
    entityId: created.id,
    title: created.name,
    detail: `Created template \"${created.name}\" (category: ${created.category})`,
    meta: { category: created.category, format: created.format },
  });
  return NextResponse.json(created, { status: 201 });
}
