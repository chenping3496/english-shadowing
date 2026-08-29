import { NextResponse } from "next/server";
import { countUsers, createUser, db, getUserByEmail } from "@/lib/server/db";
import { hashPassword } from "@/lib/server/password";
import { createSession } from "@/lib/server/session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let email = "";
  let password = "";
  let invite = "";
  try {
    const body = await request.json();
    email = String(body?.email ?? "").trim().toLowerCase();
    password = String(body?.password ?? "");
    invite = String(body?.invite ?? "").trim().toUpperCase();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
  }
  if (getUserByEmail(email)) {
    return NextResponse.json({ error: "该邮箱已注册" }, { status: 409 });
  }

  // 首个用户免邀请码、自动成为管理员；之后的注册需有效且未使用的邀请码
  const isFirst = countUsers() === 0;
  let inviteRow: { code: string; used_by: string | null } | undefined;
  if (!isFirst) {
    if (!invite) {
      return NextResponse.json({ error: "需要邀请码" }, { status: 400 });
    }
    inviteRow = db
      .prepare("SELECT code, used_by FROM invites WHERE code = ?")
      .get(invite) as { code: string; used_by: string | null } | undefined;
    if (!inviteRow) {
      return NextResponse.json({ error: "邀请码无效" }, { status: 400 });
    }
    if (inviteRow.used_by) {
      return NextResponse.json({ error: "邀请码已被使用" }, { status: 400 });
    }
  }

  const id = createUser(email, hashPassword(password), isFirst ? "admin" : "user");
  if (inviteRow) {
    db.prepare("UPDATE invites SET used_by = ?, used_at = ? WHERE code = ?").run(
      id,
      Date.now(),
      inviteRow.code,
    );
  }
  await createSession(id);
  return NextResponse.json({ ok: true });
}
