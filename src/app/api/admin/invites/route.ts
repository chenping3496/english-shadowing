import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/guard";
import {
  listInvites,
  generateInvites,
  deleteInvite,
  inviteStats,
} from "@/lib/server/admin";

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ invites: listInvites(), ...inviteStats() });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let count = 1;
  try {
    const body = await request.json();
    const n = Number(body?.count);
    if (Number.isFinite(n)) count = Math.max(1, Math.min(50, Math.floor(n)));
  } catch {
    // 缺省 1
  }

  const codes = generateInvites(count, auth.email);
  return NextResponse.json({ ok: true, codes });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let code = "";
  try {
    const body = await request.json();
    code = String(body?.code ?? "").trim().toUpperCase();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: "缺少 code" }, { status: 400 });
  }
  if (!deleteInvite(code)) {
    return NextResponse.json(
      { error: "邀请码不存在或已被使用" },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
