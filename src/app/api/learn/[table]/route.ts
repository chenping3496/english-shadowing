import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import {
  isLearnTable,
  listRows,
  getRow,
  putRow,
  deleteRows,
} from "@/lib/server/learning";

type Ctx = { params: Promise<{ table: string }> };

async function resolve(ctx: Ctx) {
  const { table } = await ctx.params;
  if (!isLearnTable(table)) return { table: null as null };
  return { table };
}

export async function GET(request: Request, ctx: Ctx) {
  const { table } = await resolve(ctx);
  if (!table) return NextResponse.json({ error: "未知数据类型" }, { status: 404 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    return NextResponse.json({ row: getRow(user.id, table, id) });
  }
  return NextResponse.json({ rows: listRows(user.id, table) });
}

export async function PUT(request: Request, ctx: Ctx) {
  const { table } = await resolve(ctx);
  if (!table) return NextResponse.json({ error: "未知数据类型" }, { status: 404 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: { id?: string } & Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  if (typeof body?.id !== "string" || !body.id) {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  }
  putRow(user.id, table, body.id, body);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { table } = await resolve(ctx);
  if (!table) return NextResponse.json({ error: "未知数据类型" }, { status: 404 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: { ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x) => typeof x === "string") : [];
  deleteRows(user.id, table, ids);
  return NextResponse.json({ ok: true });
}
