import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "./session";

/** 要求登录：未登录返回 401 响应对象，已登录返回用户。 */
export async function requireUser(): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  return user;
}

/** 要求管理员：未登录返回 401，非管理员返回 403。 */
export async function requireAdmin(): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  return user;
}
