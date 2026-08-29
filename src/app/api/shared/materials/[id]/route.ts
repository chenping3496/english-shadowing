import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { getSharedMaterial } from "@/lib/server/shared";
import { getVideoUrl } from "@/lib/server/storage";

type Ctx = { params: Promise<{ id: string }> };

// 共享素材详情：完整句子 + 视频播放地址。
export async function GET(_request: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await ctx.params;
  const m = getSharedMaterial(id);
  if (!m) return NextResponse.json({ error: "素材不存在" }, { status: 404 });

  const videoUrl = await getVideoUrl(m.videoKey);
  return NextResponse.json({
    material: {
      id: m.id,
      title: m.title,
      source: m.source,
      durationSec: m.durationSec,
      sentences: m.sentences,
      createdBy: m.createdBy,
      createdAt: m.createdAt,
      videoUrl,
    },
  });
}
