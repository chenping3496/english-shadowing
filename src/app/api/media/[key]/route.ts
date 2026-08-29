import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/server/session";
import { readVideo, resolveVideoKey, extToMime } from "@/lib/server/storage";

type Ctx = { params: Promise<{ key: string }> };

// 流式回放共享素材视频（本地磁盘驱动）。支持 HTTP Range，供 <video> 拖动进度条。
export async function GET(request: Request, ctx: Ctx) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { key } = await ctx.params;
  const file = await readVideo(resolveVideoKey(key));
  if (!file) return NextResponse.json({ error: "文件不存在" }, { status: 404 });

  const headers = new Headers({
    "Content-Type": extToMime(file.ext),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
  });

  const range = request.headers.get("range");
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = 0;
    let end = file.size - 1;
    if (m) {
      if (m[1]) start = parseInt(m[1], 10);
      if (m[2]) end = Math.min(parseInt(m[2], 10), file.size - 1);
    }
    if (start > end || start >= file.size) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${file.size}` },
      });
    }
    const chunk = file.buf.subarray(start, end + 1);
    headers.set("Content-Range", `bytes ${start}-${end}/${file.size}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(chunk as unknown as BodyInit, { status: 206, headers });
  }

  headers.set("Content-Length", String(file.size));
  return new Response(file.buf as unknown as BodyInit, { status: 200, headers });
}
