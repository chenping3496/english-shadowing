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
  message?: string;
  data?: { durl?: { url?: string; backup_url?: string[] }[] };
}

/** 返回可直接在 <video>/<audio> 里播放的 MP4 直连地址（platform=html5，无需 Referer） */
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

  // 3. playurl → MP4 直连（fnval=1 渐进式 MP4；platform=html5 免 Referer 鉴权）
  const p: Record<string, string> = {};
  if (bvid) p.bvid = bvid;
  else if (aid) p.aid = String(aid);
  if (cid != null) p.cid = String(cid);
  p.fnval = "1";
  p.fnver = "0";
  p.platform = "html5";
  p.qn = "32";

  try {
    const qs =
      imgKey && subKey ? encWbi(p, imgKey, subKey) : new URLSearchParams(p).toString();
    const res = await fetch(`${BILI_API}/x/player/wbi/playurl?${qs}`, { headers });
    const data = (await res.json()) as PlayResp;
    if (data.code !== 0) {
      return NextResponse.json({ error: `获取播放地址失败（${data.code}）` }, { status: 502 });
    }
    const url = data.data?.durl?.[0]?.url;
    if (!url) {
      return NextResponse.json({ error: "该视频没有可用的播放地址" }, { status: 404 });
    }
    return NextResponse.json({ playUrl: url });
  } catch {
    return NextResponse.json({ error: "无法获取播放地址" }, { status: 502 });
  }
}
