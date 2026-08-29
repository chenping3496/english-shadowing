import { randomBytes } from "node:crypto";
import { db } from "./db";

// 管理后台数据：邀请码管理 + 用户列表（含学习数据统计）。

export interface InviteRow {
  code: string;
  createdBy: string | null;
  usedBy: string | null;
  usedByEmail: string | null;
  usedAt: number | null;
  createdAt: number;
}

export interface AdminUser {
  id: string;
  email: string;
  role: string;
  createdAt: number;
  cards: number;
  attempts: number;
  recognitions: number;
  sessions: number;
}

export function listInvites(): InviteRow[] {
  const rows = db
    .prepare(
      `SELECT i.code, i.created_by, i.used_by, i.used_at, i.created_at,
              u.email AS used_by_email
       FROM invites i LEFT JOIN users u ON u.id = i.used_by
       ORDER BY i.created_at DESC`,
    )
    .all() as unknown as {
    code: string;
    created_by: string | null;
    used_by: string | null;
    used_at: number | null;
    created_at: number;
    used_by_email: string | null;
  }[];
  return rows.map((r) => ({
    code: r.code,
    createdBy: r.created_by,
    usedBy: r.used_by,
    usedByEmail: r.used_by_email,
    usedAt: r.used_at,
    createdAt: r.created_at,
  }));
}

/** 生成 n 个 8 位大写 hex 邀请码（与 scripts/create-invite.mjs 同格式），返回新码列表。 */
export function generateInvites(n: number, createdBy: string | null): string[] {
  const codes: string[] = [];
  for (let i = 0; i < n; i++) {
    const code = randomBytes(4).toString("hex").toUpperCase();
    db.prepare(
      "INSERT INTO invites (code, created_by, created_at) VALUES (?, ?, ?)",
    ).run(code, createdBy, Date.now());
    codes.push(code);
  }
  return codes;
}

/** 删除未使用的邀请码（已使用的不可删）。返回是否成功。 */
export function deleteInvite(code: string): boolean {
  const info = db
    .prepare("DELETE FROM invites WHERE code = ? AND used_by IS NULL")
    .run(code);
  return Number((info as { changes?: number }).changes ?? 0) > 0;
}

export function inviteStats(): { total: number; unused: number } {
  const total = Number(
    (db.prepare("SELECT COUNT(*) AS c FROM invites").get() as { c: number }).c ??
      0,
  );
  const unused = Number(
    (
      db
        .prepare("SELECT COUNT(*) AS c FROM invites WHERE used_by IS NULL")
        .get() as { c: number }
    ).c ?? 0,
  );
  return { total, unused };
}

export function listUsersWithStats(): AdminUser[] {
  const users = db
    .prepare("SELECT id, email, role, created_at FROM users ORDER BY created_at ASC")
    .all() as unknown as {
    id: string;
    email: string;
    role: string;
    created_at: number;
  }[];

  // 各学习表按 user_id 计数（表名是硬编码常量，无注入风险）
  const countMap = (table: string): Map<string, number> => {
    const m = new Map<string, number>();
    const rows = db
      .prepare(`SELECT user_id, COUNT(*) AS c FROM ${table} GROUP BY user_id`)
      .all() as unknown as { user_id: string; c: number }[];
    for (const r of rows) m.set(r.user_id, Number(r.c));
    return m;
  };

  const cards = countMap("cards");
  const attempts = countMap("attempts");
  const recognitions = countMap("recognitions");
  const sessions = countMap("study_sessions");

  return users.map((u) => ({
    id: u.id,
    email: u.email,
    role: u.role,
    createdAt: u.created_at,
    cards: cards.get(u.id) ?? 0,
    attempts: attempts.get(u.id) ?? 0,
    recognitions: recognitions.get(u.id) ?? 0,
    sessions: sessions.get(u.id) ?? 0,
  }));
}
