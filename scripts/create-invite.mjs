// 生成邀请码：npm run create-invite [数量]
// 例：node scripts/create-invite.mjs 3 → 生成 3 个邀请码
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const DB_PATH =
  process.env.DATABASE_PATH ?? join(process.cwd(), "data", "shadowing.db");
mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS invites (
    code TEXT PRIMARY KEY,
    created_by TEXT,
    used_by TEXT,
    used_at INTEGER,
    created_at INTEGER NOT NULL
  );
`);

const count = Math.max(1, Number(process.argv[2] ?? 1) || 1);
const codes = [];
for (let i = 0; i < count; i++) {
  const code = randomBytes(4).toString("hex").toUpperCase();
  db.prepare(
    "INSERT INTO invites (code, created_by, created_at) VALUES (?, ?, ?)",
  ).run(code, null, Date.now());
  codes.push(code);
}
console.log("已生成 " + count + " 个邀请码：");
console.log(codes.join("\n"));
db.close();
