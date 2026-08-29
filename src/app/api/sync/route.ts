import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { putRow, type LearnTable } from "@/lib/server/learning";

const TABLES: LearnTable[] = ["cards", "attempts", "recognitions", "sessions"];

/** 批量导入学习数据（迁移工具）：逐行 upsert，幂等。 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  const imported: Record<string, number> = {};
  for (const table of TABLES) {
    const arr = Array.isArray(body[table]) ? (body[table] as unknown[]) : [];
    let n = 0;
    for (const row of arr) {
      if (row && typeof (row as { id?: unknown }).id === "string") {
        putRow(user.id, table, (row as { id: string }).id, row);
        n++;
      }
    }
    imported[table] = n;
  }

  return NextResponse.json({ ok: true, imported });
}
