import { NextResponse } from "next/server";

// 阿里 DashScope 非实时语音合成（CosyVoice）：
// 复用 VISION_API_KEY（同一 sk- key），一个单词/短句约 0.001 元，新用户有免费额度。
const TTS_ENDPOINT =
  "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer";
const TTS_MODEL = process.env.TTS_MODEL ?? "cosyvoice-v3-flash";
const TTS_VOICE = process.env.TTS_VOICE ?? "longanyang"; // 中英双语标杆音色

export async function POST(request: Request) {
  let text = "";
  try {
    ({ text } = await request.json());
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  text = typeof text === "string" ? text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "缺少待合成文本" }, { status: 400 });
  }

  const key = process.env.VISION_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "未配置 VISION_API_KEY" }, { status: 500 });
  }

  try {
    const res = await fetch(TTS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: TTS_MODEL,
        input: { text, voice: TTS_VOICE, format: "mp3" },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: (data as { message?: string })?.message ?? "语音合成失败" },
        { status: 502 },
      );
    }
    const url = (data as { output?: { audio?: { url?: string } } })?.output
      ?.audio?.url;
    if (!url) {
      return NextResponse.json({ error: "语音合成未返回音频" }, { status: 502 });
    }
    // 服务端下载音频 → base64 data URI，避免 https 页面加载 http 音频的 mixed content
    const audioRes = await fetch(url);
    if (!audioRes.ok) {
      return NextResponse.json({ error: "音频下载失败" }, { status: 502 });
    }
    const buf = Buffer.from(await audioRes.arrayBuffer());
    const mime = audioRes.headers.get("content-type") ?? "audio/mpeg";
    return NextResponse.json({
      audio: `data:${mime};base64,${buf.toString("base64")}`,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "语音合成失败" },
      { status: 502 },
    );
  }
}
