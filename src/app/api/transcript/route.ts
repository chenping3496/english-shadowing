import { NextResponse } from "next/server";
import { YoutubeTranscript } from "youtube-transcript";

export interface TranscriptCue {
  text: string;
  startSec: number;
  endSec: number;
}

export async function POST(request: Request) {
  let url = "";
  try {
    ({ url } = await request.json());
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  if (!url) {
    return NextResponse.json({ error: "缺少视频链接" }, { status: 400 });
  }

  let raw: { text: string; duration: number; offset: number }[];
  try {
    raw = await YoutubeTranscript.fetchTranscript(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "获取字幕失败";
    return NextResponse.json(
      { error: `无法获取该视频字幕：${msg}` },
      { status: 502 },
    );
  }

  if (!raw.length) {
    return NextResponse.json({ error: "该视频没有可用字幕" }, { status: 404 });
  }

  // offset 可能是毫秒或秒，归一化到秒
  const maxOffset = Math.max(...raw.map((c) => c.offset));
  const div = maxOffset > 10000 ? 1000 : 1;

  const cues: TranscriptCue[] = raw
    .filter((c) => c.text.trim())
    .map((c) => ({
      text: c.text.trim(),
      startSec: c.offset / div,
      endSec: (c.offset + c.duration) / div,
    }));

  // 用公开 oEmbed 端点取标题
  let title = "";
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
    );
    if (res.ok) {
      const j = (await res.json()) as { title?: string };
      title = j.title ?? "";
    }
  } catch {
    // 标题获取失败不致命
  }

  return NextResponse.json({ title, cues });
}
