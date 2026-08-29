import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { listSharedMaterials } from "@/lib/server/shared";

// 共享素材列表（元数据，登录即可见）。
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  return NextResponse.json({ materials: listSharedMaterials() });
}
