import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// 服务端 SQLite（Node 24 内置 node:sqlite，零原生依赖）。
// 分工：账号/卡片/进度等「学习数据」走这里（按 userId 隔离）；
//      自己导入的素材文件、识别去重缓存仍留在前端 IndexedDB(Dexie)。
// 注意：本文件只允许被服务端（route handler）导入，勿在前端组件里 import。

const DB_PATH =
  process.env.DATABASE_PATH ?? join(process.cwd(), "data", "shadowing.db");

export type Role = "admin" | "user";

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: Role;
  created_at: number;
}

// 惰性单例：连接放到 globalThis，dev 热更新 / 多路由复用同一连接
const globalForDb = globalThis as unknown as { __shadowingDb?: DatabaseSync };

function getDb(): DatabaseSync {
  if (globalForDb.__shadowingDb) return globalForDb.__shadowingDb;
  if (DB_PATH !== ":memory:") {
    mkdirSync(dirname(DB_PATH), { recursive: true });
  }
  const instance = new DatabaseSync(DB_PATH);
  instance.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invites (
      code TEXT PRIMARY KEY,
      created_by TEXT,
      used_by TEXT,
      used_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    -- 学习数据（卡片/跟读记录/拍照识别/每日会话），整行 JSON，按 user_id 隔离
    CREATE TABLE IF NOT EXISTS cards (
      user_id TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (user_id, id)
    );

    CREATE TABLE IF NOT EXISTS attempts (
      user_id TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (user_id, id)
    );

    CREATE TABLE IF NOT EXISTS recognitions (
      user_id TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (user_id, id)
    );

    CREATE TABLE IF NOT EXISTS study_sessions (
      user_id TEXT NOT NULL,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (user_id, id)
    );

    -- 共享素材（管理端上传，用户可导入练习；视频存本地磁盘或 COS，字幕存整行 JSON）
    CREATE TABLE IF NOT EXISTS shared_materials (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      video_key TEXT NOT NULL DEFAULT '',
      duration_sec INTEGER NOT NULL DEFAULT 0,
      sentences TEXT NOT NULL DEFAULT '[]',
      created_by TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
  `);
  globalForDb.__shadowingDb = instance;
  return instance;
}

// 用 Proxy 惰性打开数据库：首次真正调用 prepare/exec 才建连接，
// 避免 next build 收集路由配置时 15 个 worker 并发打开触发 database is locked
export const db = new Proxy({} as DatabaseSync, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

// —— 用户 ——

export function getUserById(id: string): UserRow | null {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  return (row as unknown as UserRow) ?? null;
}

export function getUserByEmail(email: string): UserRow | null {
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  return (row as unknown as UserRow) ?? null;
}

export function countUsers(): number {
  const row = db.prepare("SELECT COUNT(*) AS c FROM users").get();
  return Number((row as { c: number }).c ?? 0);
}

export function createUser(
  email: string,
  passwordHash: string,
  role: Role,
): string {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO users (id, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, email, passwordHash, role, Date.now());
  return id;
}
