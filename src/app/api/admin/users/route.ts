import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/guard";
import { listUsersWithStats } from "@/lib/server/admin";

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ users: listUsersWithStats() });
}
