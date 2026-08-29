import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/guard";
import { rateLimit } from "@/lib/server/rate-limit";

export interface VisionObject {
  english: string;
  chinese: string;
  phrase?: string;
  phraseChinese?: string;
  zone?: string;
}

const PROMPT =
  "识别这张照片里最主要的物体，站在中文母语学习者的角度，给出地道的英文表达。" +
  "严格只返回一个 JSON 数组，最多 8 个，按显著程度排序。" +
  "每个元素必须包含五个字段：english（名词或名词短语）、chinese（中文释义）、phrase（含这个名词、能直接开口说的简短口语动词短语）、phraseChinese（phrase 的中文释义）、zone（该物体在图片中的大致方位，九宫格取值之一：top-left / top / top-right / left / center / right / bottom-left / bottom / bottom-right）。" +
  "phrase 和 phraseChinese 都是必填字段，不要只给名词。例如 english 为 tap 时 phrase 是 \"turn on the tap\"、phraseChinese 是 \"打开水龙头\"，english 为 kettle 时 phrase 是 \"boil the kettle\"、phraseChinese 是 \"烧水\"。" +
  "实在想不出动词时，用 \"use the ...\" 或 \"this is a ...\" 兜底，phraseChinese 给对应中文。" +
  "示例：[{\"english\":\"tap\",\"chinese\":\"水龙头\",\"phrase\":\"turn on the tap\",\"phraseChinese\":\"打开水龙头\",\"zone\":\"bottom-right\"}]。" +
  "不要输出任何 JSON 之外的内容。";

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = "qwen-vl-max";

export async function POST(request: Request) {
  let image = "";
  try {
    ({ image } = await request.json());
  } catch {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }
  if (!image) {
    return NextResponse.json({ error: "缺少图片数据" }, { status: 400 });
  }

  const key = process.env.VISION_API_KEY;
  if (!key) {
    return NextResponse.json(
      {
        error:
          "未配置视觉 API key（VISION_API_KEY）。在项目根目录 .env.local 中设置后重启开发服务器。",
      },
      { status: 501 },
    );
  }

  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  if (!rateLimit(`vision:${auth.id}`, 30, 60_000)) {
    return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
  }

  const baseUrl = (process.env.VISION_BASE_URL ?? DEFAULT_BASE_URL).replace(
    /\/+$/,
    "",
  );
  const model = process.env.VISION_MODEL ?? DEFAULT_MODEL;

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              // 前端传来的 image 已是完整 data URL，OpenAI 兼容接口直接收。
              { type: "image_url", image_url: { url: image } },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      }),
    });
  } catch {
    return NextResponse.json({ error: "无法连接视觉 API" }, { status: 502 });
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: `视觉 API 调用失败（${res.status}）` },
      { status: 502 },
    );
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string | { type: string; text?: string }[] } }[];
  };

  const content = data.choices?.[0]?.message?.content;
  let text = "";
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
  }

  let objects: VisionObject[] = [];
  try {
    const cleaned = text.replace(/```(json)?/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      objects = parsed
        .filter((o) => o && typeof o.english === "string")
        .map((o) => ({
          english: String(o.english).trim(),
          chinese: String(o.chinese ?? "").trim(),
          phrase: typeof o.phrase === "string" ? o.phrase.trim() : undefined,
          phraseChinese:
            typeof o.phraseChinese === "string" ? o.phraseChinese.trim() : undefined,
          zone: typeof o.zone === "string" ? o.zone.trim() : undefined,
        }))
        .slice(0, 8);
    }
  } catch {
    // 解析失败返回空，前端提示
  }

  if (!objects.length) {
    return NextResponse.json({ error: "未能从图片识别出物体" }, { status: 422 });
  }

  return NextResponse.json({ objects });
}
