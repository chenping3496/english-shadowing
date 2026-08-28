import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";

// @ts-ignore - @ffmpeg-installer/ffmpeg 无类型声明
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

const execFileAsync = promisify(execFile);
const ffmpegPath = (ffmpegInstaller as unknown as { path: string }).path;

const ASR_ENDPOINT =
  "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation";
const ASR_KEY = process.env.VISION_API_KEY ?? "";

/**
 * 跟读录音识别：接收 base64 音频 → ffmpeg 转 mp3 → 阿里 ASR → 返回识别文本。
 * 复用与 /api/bilibili/transcribe 相同的 ASR 模型 qwen-audio-3.0-asr-flash。
 */
export async function POST(request: Request) {
  let audio = ""; // base64（不含 data URI 前缀）
  let ext = "webm";
  try {
    const body = await request.json();
    audio = typeof body?.audio === "string" ? body.audio : "";
    ext = typeof body?.ext === "string" ? body.ext : "webm";
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  if (!audio) {
    return NextResponse.json({ error: "缺少音频数据" }, { status: 400 });
  }
  if (!ASR_KEY) {
    return NextResponse.json({ error: "未配置语音识别 API Key" }, { status: 500 });
  }
  if (!/^[a-z0-9]+$/i.test(ext)) ext = "webm";

  const dir = await mkdtemp(join(tmpdir(), "shadow-asr-"));
  try {
    const raw = join(dir, "in." + ext);
    const mp3 = join(dir, "out.mp3");
    await writeFile(raw, Buffer.from(audio, "base64"));

    await execFileAsync(ffmpegPath, [
      "-y",
      "-i",
      raw,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "64k",
      mp3,
    ]);

    const dataUri =
      "data:audio/mpeg;base64," + (await readFile(mp3)).toString("base64");
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
              content: [
                { type: "input_audio", input_audio: { data: dataUri } },
              ],
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
    const sentence =
      data?.output?.output?.sentence ?? data?.output?.sentence ?? null;
    const text = (sentence?.text ?? "").trim();
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "识别失败" },
      { status: 502 },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
