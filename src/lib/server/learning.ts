import { db } from "./db";

// 学习数据（卡片/跟读记录/拍照识别/每日会话）统一以 JSON 整行存储，
// 按 user_id 隔离。素材(materials)与句子(sentences)仍留在前端 IndexedDB。

export const LEARN_TABLES = [
  "cards",
  "attempts",
  "recognitions",
  "sessions",
] as const;

export type LearnTable = (typeof LEARN_TABLES)[number];

// API 层名字 → 实际 SQL 表名（「sessions」与登录会话表撞名，落库用 study_sessions）
const SQL_TABLE: Record<LearnTable, string> = {
  cards: "cards",
  attempts: "attempts",
  recognitions: "recognitions",
  sessions: "study_sessions",
};

export function isLearnTable(t: string): t is LearnTable {
  return (LEARN_TABLES as readonly string[]).includes(t);
}

export function listRows<T>(userId: string, table: LearnTable): T[] {
  const t = SQL_TABLE[table];
  const rows = db
    .prepare(`SELECT data FROM ${t} WHERE user_id = ?`)
    .all(userId);
  return rows.map((r) => JSON.parse((r as { data: string }).data) as T);
}

export function getRow<T>(
  userId: string,
  table: LearnTable,
  id: string,
): T | null {
  const t = SQL_TABLE[table];
  const row = db
    .prepare(`SELECT data FROM ${t} WHERE user_id = ? AND id = ?`)
    .get(userId, id);
  return row ? (JSON.parse((row as { data: string }).data) as T) : null;
}

export function putRow<T>(
  userId: string,
  table: LearnTable,
  id: string,
  data: T,
): void {
  const t = SQL_TABLE[table];
  db.prepare(
    `INSERT INTO ${t} (user_id, id, data) VALUES (?, ?, ?)
     ON CONFLICT(user_id, id) DO UPDATE SET data = excluded.data`,
  ).run(userId, id, JSON.stringify(data));
}

export function deleteRows(
  userId: string,
  table: LearnTable,
  ids: string[],
): void {
  if (!ids.length) return;
  const t = SQL_TABLE[table];
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(
    `DELETE FROM ${t} WHERE user_id = ? AND id IN (${placeholders})`,
  ).run(userId, ...ids);
}
