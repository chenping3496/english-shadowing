"use client";

// 前端认证客户端：调用 /api/auth/*，cookie 由浏览器自动带上。

export interface AuthUser {
  id: string;
  email: string;
  role: "admin" | "user";
}

export async function fetchMe(): Promise<AuthUser | null> {
  try {
    const res = await fetch("/api/auth/me");
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.user as AuthUser) ?? null;
  } catch {
    return null;
  }
}

async function post(
  path: string,
  body: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.error ?? "请求失败" };
    return { ok: true };
  } catch {
    return { ok: false, error: "网络错误，请重试" };
  }
}

export function login(email: string, password: string) {
  return post("/api/auth/login", { email, password });
}

export function register(email: string, password: string, invite: string) {
  return post("/api/auth/register", { email, password, invite });
}

export async function logout(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // 忽略
  }
}
