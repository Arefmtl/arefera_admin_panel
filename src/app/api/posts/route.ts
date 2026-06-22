import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/** GET /api/posts — broadcast history (saved Post rows). */
export async function GET() {
  const posts = await db.post.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  return NextResponse.json(posts);
}
