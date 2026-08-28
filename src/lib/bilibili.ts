import { createHash } from "crypto";

export const BILI_API = "https://api.bilibili.com";
export const BILI_UA =
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

export function encWbi(
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
export function parseBiliId(
  input: string,
): { key: "bvid" | "aid"; value: string } | null {
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
    const res = await fetch(`${BILI_API}/x/frontend/finger/spi`, { headers: baseHeaders });
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

export interface BiliContext {
  id: { key: "bvid" | "aid"; value: string };
  headers: Record<string, string>;
}

/** 由输入解析 id 并构建带 cookie/Referer 的请求头 */
export async function buildBiliRequest(input: string): Promise<BiliContext | null> {
  const id = parseBiliId(input);
  if (!id) return null;
  const referer =
    id.key === "bvid"
      ? `https://www.bilibili.com/video/${id.value}`
      : `https://www.bilibili.com/video/av${id.value}`;
  const baseHeaders: Record<string, string> = {
    "user-agent": BILI_UA,
    accept: "application/json, text/plain, */*",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    origin: "https://www.bilibili.com",
    referer,
  };
  const cookie = await buildCookies(baseHeaders);
  const headers: Record<string, string> = { ...baseHeaders };
  if (cookie) headers.cookie = cookie;
  return { id, headers };
}

/** nav 接口取 WBI 签名 key（免登录） */
export async function getWbiKeys(
  headers: Record<string, string>,
): Promise<{ imgKey: string; subKey: string }> {
  try {
    const res = await fetch(`${BILI_API}/x/web-interface/nav`, { headers });
    const nav = (await res.json()) as {
      data?: { wbi_img?: { img_url?: string; sub_url?: string } };
    };
    const imgKey = nav.data?.wbi_img?.img_url?.split("/").pop()?.split(".")[0] ?? "";
    const subKey = nav.data?.wbi_img?.sub_url?.split("/").pop()?.split(".")[0] ?? "";
    return { imgKey, subKey };
  } catch {
    return { imgKey: "", subKey: "" };
  }
}
