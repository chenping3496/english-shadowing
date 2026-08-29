import { NextResponse } from "next/server";
import { BILI_API, buildBiliRequest, encWbi, getWbiKeys } from "@/lib/bilibili";

export interface BilibiliCue {
  text: string;
  startSec: number;
  endSec: number;
}

interface ViewResp {
  code: number;
  data?: {
    bvid?: string;
    aid?: number;
    cid?: number;
    title?: string;
    pages?: { cid?: number; page?: number; part?: string }[];
  };
}

export interface BiliPage {
  cid: number;
  page: number;
  part: string;
}
interface SubtitleTrack {
  lan?: string;
  lan_doc?: string;
  subtitle_url?: string;
}
interface PlayerResp {
  code: number;
  data?: { subtitle?: { subtitles?: SubtitleTrack[] } };
}
interface SubtitleFile {
  body?: { from: number; to: number; content: string }[];
}

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

  // 1. 视频信息 → title + bvid + cid
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
  const title = view.data?.title ?? "";
  const bvid = view.data?.bvid;
  const aid = view.data?.aid;
  const cid = view.data?.cid;
  const pages: BiliPage[] = (view.data?.pages ?? [])
    .map((p) => ({ cid: p.cid ?? 0, page: p.page ?? 0, part: p.part ?? "" }))
    .filter((p) => p.cid > 0);

  // 2. nav → WBI key（免登录）
  const { imgKey, subKey } = await getWbiKeys(headers);

  // 3. 字幕列表（WBI 签名）
  const p: Record<string, string> = {};
  if (bvid) p.bvid = bvid;
  else if (aid) p.aid = String(aid);
  if (cid != null) p.cid = String(cid);

  let subtitles: SubtitleTrack[] = [];
  try {
    const qs =
      imgKey && subKey ? encWbi(p, imgKey, subKey) : new URLSearchParams(p).toString();
    const res = await fetch(`${BILI_API}/x/player/wbi/v2?${qs}`, { headers });
    const data = (await res.json()) as PlayerResp;
    subtitles = data.data?.subtitle?.subtitles ?? [];
  } catch {
    return NextResponse.json({ error: "获取字幕列表失败" }, { status: 502 });
  }

  // 只认英文轨；无字幕轨、或只有中文/其他语言轨时，都引导走 ASR 转写
  const track = subtitles.find(
    (s) => s.lan === "en" || /英语|English|英文/i.test(s.lan_doc ?? ""),
  );
  if (!track) {
    return NextResponse.json(
      { title, subtitleAvailable: false, pages },
      { status: 200 },
    );
  }
  const lang = track.lan_doc || track.lan || "";

  let url = track.subtitle_url ?? "";
  if (url.startsWith("//")) url = "https:" + url;

  let cues: BilibiliCue[] = [];
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      return NextResponse.json({ error: `下载字幕失败（${res.status}）` }, { status: 502 });
    }
    const file = (await res.json()) as SubtitleFile;
    cues = (file.body ?? [])
      .filter((c) => c?.content?.trim())
      .map((c) => ({
        text: c.content.trim(),
        startSec: c.from,
        endSec: c.to,
      }));
  } catch {
    return NextResponse.json({ error: "解析字幕失败" }, { status: 502 });
  }

  if (!cues.length) {
    return NextResponse.json({ error: "字幕内容为空" }, { status: 422 });
  }

  return NextResponse.json({ title, lang, cues, subtitleAvailable: true, pages });
}
