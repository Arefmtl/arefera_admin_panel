import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  return NextResponse.json({
    authenticated: session.authenticated,
    expiresAt: session.expiresAt ?? null,
  });
}
