import { NextResponse } from "next/server";
import {
  BILI_API,
  buildBiliRequest,
  encWbi,
  getWbiKeys,
} from "@/lib/bilibili";

interface ViewResp {
  code: number;
  data?: { bvid?: string; aid?: number; cid?: number };
}
interface PlayResp {
  code: number;
  data?: { durl?: { url?: string }[] };
}

// 缓存上限：超过则拒绝下载，前端回退到直连流式播放
const MAX_BYTES = 120 * 1024 * 1024;

/** 服务端代理下载整段 MP4（转 Blob 缓存到 IndexedDB），带大小上限 */
export async function POST(request: Request) {
  let input = "";
  try {
    ({ input } = await request.json());
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  input = input?.trim();
  if (!input) {
    return NextResponse.json({ error: "缺少视频链接或 BV 号" }, { status: 400 });
  }

  const ctx = await buildBiliRequest(input);
  if (!ctx) {
    return NextResponse.json(
      { error: "无法识别链接，请粘贴 Bilibili 视频链接或 BV 号" },
      { status: 400 },
    );
  }
  const { id, headers } = ctx;

  // 1. view → bvid + cid
  let view: ViewResp;
  try {
    const res = await fetch(`${BILI_API}/x/web-interface/view?${id.key}=${id.value}`, {
      headers,
    });
    if (!res.ok) {
      return NextResponse.json({ error: `获取视频信息失败（${res.status}）` }, { status: 502 });
    }
    view = (await res.json()) as ViewResp;
  } catch {
    return NextResponse.json({ error: "无法连接 Bilibili" }, { status: 502 });
  }
  if (view.code !== 0) {
    return NextResponse.json({ error: `视频不存在或已失效（code ${view.code}）` }, { status: 404 });
  }
  const bvid = view.data?.bvid || (id.key === "bvid" ? id.value : "");
  const aid = view.data?.aid || (id.key === "aid" ? Number(id.value) : undefined);
  const cid = view.data?.cid;

  // 2. nav → WBI key
  const { imgKey, subKey } = await getWbiKeys(headers);

  // 3. playurl → MP4 直连
  const p: Record<string, string> = {};
  if (bvid) p.bvid = bvid;
  else if (aid) p.aid = String(aid);
  if (cid != null) p.cid = String(cid);
  p.fnval = "1";
  p.fnver = "0";
  p.platform = "html5";
  p.qn = "32";

  let playUrl = "";
  try {
    const qs =
      imgKey && subKey ? encWbi(p, imgKey, subKey) : new URLSearchParams(p).toString();
    const res = await fetch(`${BILI_API}/x/player/wbi/playurl?${qs}`, { headers });
    const data = (await res.json()) as PlayResp;
    if (data.code !== 0) {
      return NextResponse.json({ error: `获取播放地址失败（${data.code}）` }, { status: 502 });
    }
    playUrl = data.data?.durl?.[0]?.url ?? "";
  } catch {
    return NextResponse.json({ error: "无法获取播放地址" }, { status: 502 });
  }
  if (!playUrl) {
    return NextResponse.json({ error: "该视频没有可用的播放地址" }, { status: 404 });
  }

  // 4. 下载整段 MP4（带大小上限）
  try {
    const up = await fetch(playUrl, { headers });
    if (!up.ok || !up.body) {
      return NextResponse.json({ error: `下载视频失败（${up.status}）` }, { status: 502 });
    }
    const reader = up.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        return NextResponse.json(
          { error: "视频过大（>120MB），无法缓存，将改为在线播放" },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return new NextResponse(buf, {
      headers: {
        "content-type": "video/mp4",
        "content-length": String(buf.length),
      },
    });
  } catch {
    return NextResponse.json({ error: "下载视频失败" }, { status: 502 });
  }
}
