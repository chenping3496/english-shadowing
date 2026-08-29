import { NextResponse } from "next/server";
import { getUserByEmail } from "@/lib/server/db";
import { verifyPassword } from "@/lib/server/password";
import { createSession } from "@/lib/server/session";

export async function POST(request: Request) {
  let email = "";
  let password = "";
  try {
    const body = await request.json();
    email = String(body?.email ?? "").trim().toLowerCase();
    password = String(body?.password ?? "");
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  const user = getUserByEmail(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 });
  }
  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
