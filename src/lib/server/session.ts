import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { db, getUserById, type Role } from "./db";

const COOKIE_NAME = "session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
}

/** 创建会话：写一条会话记录 + 下发 httpOnly cookie。 */
export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  db.prepare(
    "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
  ).run(hashToken(token), userId, expiresAt, Date.now());
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

/** 从 cookie 解析当前登录用户（无 cookie / 过期 / 用户不存在返回 null）。 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const row = db
    .prepare("SELECT user_id, expires_at FROM sessions WHERE token_hash = ?")
    .get(hashToken(token)) as { user_id: string; expires_at: number } | undefined;
  if (!row) return null;
  if (Number(row.expires_at) < Date.now()) return null;
  const user = getUserById(row.user_id);
  if (!user) return null;
  return { id: user.id, email: user.email, role: user.role };
}

/** 退出登录：删除会话记录 + 清除 cookie。 */
export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (token) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  }
  cookieStore.delete(COOKIE_NAME);
}
