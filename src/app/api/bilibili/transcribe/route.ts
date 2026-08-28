import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import {
  BILI_API,
  buildBiliRequest,
  encWbi,
  getWbiKeys,
} from "@/lib/bilibili";

// @ts-ignore - @ffmpeg-installer/ffmpeg 无类型声明
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

const execFileAsync = promisify(execFile);
const ffmpegPath = (ffmpegInstaller as unknown as { path: string }).path;

const ASR_ENDPOINT =
  "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const ASR_KEY = process.env.VISION_API_KEY ?? "";

interface ViewResp {
  code: number;
  data?: { bvid?: string; aid?: number; cid?: number; title?: string };
}
interface PlayResp {
  code: number;
  data?: { durl?: { url?: string }[] };
}

interface AsrWord {
  begin_time: number;
  end_time: number;
  text?: string;
  punctuation?: string;
}
interface Cue {
  text: string;
  startSec: number;
  endSec: number;
}

/** 按句末标点把 ASR 词级结果切成句子（毫秒 → 秒） */
function splitSentences(words: AsrWord[]): Cue[] {
  const out: Cue[] = [];
  let buf: AsrWord[] = [];
  const flush = () => {
    if (!buf.length) return;
    const text = buf
      .map((x) => (x.text ?? "") + (x.punctuation ?? ""))
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    const startSec = buf[0].begin_time / 1000;
    const endSec = buf[buf.length - 1].end_time / 1000;
    if (text) out.push({ text, startSec, endSec });
    buf = [];
  };
  for (const w of words) {
    buf.push(w);
    if (/[.!?]/.test(w.punctuation ?? "")) flush();
  }
  flush();
  return out;
}

/** 调 qwen-audio-3.0-asr-flash：base64 直传，同步返回词级时间戳 */
async function transcribe(mp3Path: string): Promise<Cue[]> {
  const buf = await readFile(mp3Path);
  const dataUri = "data:audio/mpeg;base64," + buf.toString("base64");
  const res = await fetch(ASR_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + ASR_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "qwen-audio-3.0-asr-flash",
      input: {
        messages: [
          {
            role: "user",
            content: [{ type: "input_audio", input_audio: { data: dataUri } }],
          },
        ],
      },
      parameters: { format: "mp3" },
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      (data as { message?: string }).message ?? `语音识别失败（${res.status}）`,
    );
  }
  // 兼容 output.sentence 与 output.output.sentence 两种嵌套
  const sentence =
    data?.output?.output?.sentence ?? data?.output?.sentence ?? null;
  const words: AsrWord[] = sentence?.words ?? [];
  return splitSentences(words);
}

/** 无 CC 字幕的 B 站分 P：下载音频 → ffmpeg 抽 mp3 → ASR 转写 → 逐句 cues */
export async function POST(request: Request) {
  let input = "";
  let cid: number | undefined;
  let part = "";
  try {
    ({ input, cid, part } = await request.json());
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  input = input?.trim();
  if (!input) {
    return NextResponse.json({ error: "缺少视频链接或 BV 号" }, { status: 400 });
  }
  if (!ASR_KEY) {
    return NextResponse.json({ error: "未配置语音识别 API Key" }, { status: 500 });
  }

  const ctx = await buildBiliRequest(input);
  if (!ctx) {
    return NextResponse.json(
      { error: "无法识别链接，请粘贴 Bilibili 视频链接或 BV 号" },
      { status: 400 },
    );
  }
  const { id, headers } = ctx;

  // 1. view → bvid + cid + title
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
  const videoTitle = view.data?.title ?? "";
  const targetCid = cid ?? view.data?.cid;

  // 2. nav → WBI key
  const { imgKey, subKey } = await getWbiKeys(headers);

  // 3. playurl → mp4 直连（指定分 P 的 cid）
  const p: Record<string, string> = {};
  if (bvid) p.bvid = bvid;
  else if (aid) p.aid = String(aid);
  if (targetCid != null) p.cid = String(targetCid);
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

  // 4. 下载 mp4 → ffmpeg 抽 mp3 → ASR
  const dir = await mkdtemp(join(tmpdir(), "bili-asr-"));
  try {
    const mp4Path = join(dir, "in.mp4");
    const mp3Path = join(dir, "out.mp3");

    const dl = await fetch(playUrl, { headers });
    if (!dl.ok) {
      return NextResponse.json({ error: `下载视频失败（${dl.status}）` }, { status: 502 });
    }
    await writeFile(mp4Path, Buffer.from(await dl.arrayBuffer()));

    await execFileAsync(ffmpegPath, [
      "-y",
      "-i",
      mp4Path,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "64k",
      mp3Path,
    ]);

    const cues = await transcribe(mp3Path);
    if (!cues.length) {
      return NextResponse.json({ error: "未识别出语音内容，请换一集试试" }, { status: 422 });
    }

    return NextResponse.json({
      title: part || videoTitle,
      cues,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "转写失败" },
      { status: 502 },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
