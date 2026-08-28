import { createHash } from "crypto";
import { NextResponse } from "next/server";

export interface BilibiliCue {
  text: string;
  startSec: number;
  endSec: number;
}

const API = "https://api.bilibili.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// WBI 签名乱序表（固定，B 站公开算法）
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
];

function getMixinKey(orig: string): string {
  return MIXIN_KEY_ENC_TAB.map((n) => orig[n]).join("").slice(0, 32);
}

function encWbi(
  params: Record<string, string>,
  imgKey: string,
  subKey: string,
): string {
  const mixinKey = getMixinKey(imgKey + subKey);
  const wts = Math.round(Date.now() / 1000);
  const query: Record<string, string> = { ...params, wts: String(wts) };
  const chrFilter = /[!'()*]/g;
  const queryStr = Object.keys(query)
    .sort()
    .map((key) => {
      const value = query[key].replace(chrFilter, "");
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join("&");
  const wRid = createHash("md5").update(queryStr + mixinKey).digest("hex");
  return `${queryStr}&w_rid=${wRid}`;
}

/** 从用户输入里解析出 bvid 或 aid */
function parseId(input: string): { key: "bvid" | "aid"; value: string } | null {
  const bv = input.match(/BV[0-9A-Za-z]{10}/i);
  if (bv) return { key: "bvid", value: bv[0] };
  const av = input.match(/\bav(\d+)/i);
  if (av) return { key: "aid", value: av[1] };
  const num = input.match(/^\d+$/);
  if (num) return { key: "aid", value: num[0] };
  return null;
}

async function buildCookies(baseHeaders: Record<string, string>): Promise<string> {
  const jar = new Map<string, string>();
  // 主页 + finger/spi 拿 buvid 系列，尽量通过风控
  try {
    const res = await fetch("https://www.bilibili.com/", {
      headers: baseHeaders,
      redirect: "manual",
    });
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const eq = c.indexOf("=");
      if (eq <= 0) continue;
      const k = c.slice(0, eq).trim();
      const v = c.slice(eq + 1).split(";")[0];
      if (/^(buvid3|buvid4|buvid4_bug|b_nut)$/.test(k)) jar.set(k, v);
    }
  } catch {
    // 忽略
  }
  try {
    const res = await fetch(`${API}/x/frontend/finger/spi`, { headers: baseHeaders });
    const spi = (await res.json()) as { data?: { b_3?: string; b_4?: string } };
    if (spi.data?.b_3) jar.set("buvid3", spi.data.b_3);
    if (spi.data?.b_4) jar.set("buvid4", spi.data.b_4);
  } catch {
    // 忽略
  }
  // 用户配置优先
  if (process.env.BILI_BUVID3) jar.set("buvid3", process.env.BILI_BUVID3);
  if (process.env.BILI_SESSDATA) jar.set("SESSDATA", process.env.BILI_SESSDATA);
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

interface ViewResp {
  code: number;
  data?: { bvid?: string; aid?: number; cid?: number; title?: string };
}
interface NavResp {
  code: number;
  data?: { wbi_img?: { img_url?: string; sub_url?: string } };
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

  const id = parseId(input);
  if (!id) {
    return NextResponse.json(
      { error: "无法识别链接，请粘贴 Bilibili 视频链接或 BV 号" },
      { status: 400 },
    );
  }

  const referer =
    id.key === "bvid"
      ? `https://www.bilibili.com/video/${id.value}`
      : `https://www.bilibili.com/video/av${id.value}`;

  const baseHeaders: Record<string, string> = {
    "user-agent": UA,
    accept: "application/json, text/plain, */*",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    origin: "https://www.bilibili.com",
    referer,
  };
  const cookie = await buildCookies(baseHeaders);
  const headers: Record<string, string> = { ...baseHeaders };
  if (cookie) headers.cookie = cookie;

  // 1. 视频信息 → title + bvid + cid
  let view: ViewResp;
  try {
    const res = await fetch(`${API}/x/web-interface/view?${id.key}=${id.value}`, { headers });
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

  // 2. nav → WBI key（免登录）
  let imgKey = "";
  let subKey = "";
  try {
    const res = await fetch(`${API}/x/web-interface/nav`, { headers });
    const nav = (await res.json()) as NavResp;
    imgKey = nav.data?.wbi_img?.img_url?.split("/").pop()?.split(".")[0] ?? "";
    subKey = nav.data?.wbi_img?.sub_url?.split("/").pop()?.split(".")[0] ?? "";
  } catch {
    // 取不到 key 就退化为无签名请求（可能被风控降级）
  }

  // 3. 字幕列表（WBI 签名）
  const p: Record<string, string> = {};
  if (bvid) p.bvid = bvid;
  else if (aid) p.aid = String(aid);
  if (cid != null) p.cid = String(cid);

  let subtitles: SubtitleTrack[] = [];
  try {
    const qs =
      imgKey && subKey ? encWbi(p, imgKey, subKey) : new URLSearchParams(p).toString();
    const res = await fetch(`${API}/x/player/wbi/v2?${qs}`, { headers });
    const data = (await res.json()) as PlayerResp;
    subtitles = data.data?.subtitle?.subtitles ?? [];
  } catch {
    return NextResponse.json({ error: "获取字幕列表失败" }, { status: 502 });
  }

  if (!subtitles.length) {
    const hint = process.env.BILI_SESSDATA
      ? ""
      : "；且未配置 BILI_SESSDATA，字幕接口通常需要登录 cookie";
    return NextResponse.json(
      { error: `该视频没有可用的字幕${hint}` },
      { status: 404 },
    );
  }

  // 4. 优先英文轨，否则第一条
  const track =
    subtitles.find(
      (s) => s.lan === "en" || /英语|English|英文/i.test(s.lan_doc ?? ""),
    ) ?? subtitles[0];
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

  return NextResponse.json({ title, lang, cues });
}
