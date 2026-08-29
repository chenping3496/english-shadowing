import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/guard";
import { rateLimit } from "@/lib/server/rate-limit";
import { saveVideo, deleteVideo, safeExt } from "@/lib/server/storage";
import {
  createSharedMaterial,
  deleteSharedMaterial,
  getSharedMaterial,
  listSharedMaterials,
  type SharedSentence,
} from "@/lib/server/shared";
import { parseSrt } from "@/lib/srt";
import { segmentCues, extractKeywords, estimateLevel } from "@/lib/segment";

const MAX_UPLOAD_BYTES = 512 * 1024 * 1024; // 单文件上限 512MB

/** 表单里的 srt 字段可能是字符串（粘贴）或 File（上传），统一读成文本 */
async function readSrtField(field: FormDataEntryValue | null): Promise<string> {
  if (field == null) return "";
  if (typeof field === "string") return field;
  return await field.text();
}

// 管理员上传共享素材：multipart（video 视频文件 + title + source + srt 字幕）。
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  if (!rateLimit(`admin-upload:${auth.id}`, 10, 60_000)) {
    return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "请求体无效（需 multipart/form-data）" },
      { status: 400 },
    );
  }

  const video = form.get("video");
  const title = ((form.get("title") as string) ?? "").trim();
  const source = ((form.get("source") as string) ?? "").trim();
  const srtText = (await readSrtField(form.get("srt"))).trim();

  if (!(video instanceof File) || video.size === 0) {
    return NextResponse.json({ error: "缺少视频文件" }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: "缺少标题" }, { status: 400 });
  }
  if (video.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "视频过大（上限 512MB）" }, { status: 413 });
  }

  const buf = Buffer.from(await video.arrayBuffer());
  const ext = safeExt(video.name || "video.mp4");
  let videoKey: string;
  try {
    videoKey = await saveVideo(buf, ext);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "视频上传失败" },
      { status: 502 },
    );
  }

  const cues = parseSrt(srtText).map((c) => ({
    text: c.text,
    startSec: c.startSec,
    endSec: c.endSec,
  }));
  const sentences: SharedSentence[] = segmentCues(cues).map((d, i) => ({
    id: `s${i}`,
    index: i,
    text: d.text,
    startSec: d.startSec,
    endSec: d.endSec,
    level: estimateLevel(d.text),
    keywords: extractKeywords(d.text),
  }));

  if (!sentences.length) {
    await deleteVideo(videoKey);
    return NextResponse.json({ error: "字幕为空或无法切分出句子" }, { status: 422 });
  }

  const durationSec = Math.ceil(sentences[sentences.length - 1].endSec);
  const id = createSharedMaterial({
    title,
    source,
    videoKey,
    durationSec,
    sentences,
    createdBy: auth.email,
  });

  return NextResponse.json({ ok: true, id, sentenceCount: sentences.length });
}

// 管理员列表（含全部字段元数据）。
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ materials: listSharedMaterials() });
}

export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  if (typeof body?.id !== "string" || !body.id) {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  }

  const m = getSharedMaterial(body.id);
  if (!m) return NextResponse.json({ error: "素材不存在" }, { status: 404 });

  await deleteVideo(m.videoKey);
  deleteSharedMaterial(body.id);
  return NextResponse.json({ ok: true });
}
