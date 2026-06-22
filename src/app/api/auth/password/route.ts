import { NextResponse } from "next/server";
import { getSession, setPanelPassword, getClientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.authenticated) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { current?: string; next?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* ignore */
  }
  const next = (body.next ?? "").trim();
  if (!next) {
    return NextResponse.json({ error: "New password required" }, { status: 400 });
  }
  if (next.length < 4) {
    return NextResponse.json({ error: "Password must be at least 4 characters" }, { status: 400 });
  }
  try {
    await setPanelPassword(next);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
  await audit("settings", "auth", {
    title: "Panel password changed",
    detail: "Admin updated the panel login password",
    actor: "admin",
    ip: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
  }).catch(() => {});
  return NextResponse.json({ ok: true });
}
