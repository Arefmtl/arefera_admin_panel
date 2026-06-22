import { NextResponse } from "next/server";
import { logout, getClientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? undefined;
  await logout();
  await audit("login", "auth", {
    title: "Panel logout",
    detail: "Admin signed out of the panel",
    actor: "admin",
    ip,
    userAgent,
  }).catch(() => {});
  return NextResponse.json({ ok: true });
}
