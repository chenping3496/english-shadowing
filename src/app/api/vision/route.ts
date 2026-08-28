import { NextResponse } from "next/server";

export interface VisionObject {
  english: string;
  chinese: string;
}

const PROMPT =
  "识别这张照片里最主要的物体，站在中文母语学习者的角度，给出地道的英文表达。" +
  "严格只返回一个 JSON 数组，元素为 {\"english\":\"...\",\"chinese\":\"...\"}，最多 8 个，按显著程度排序。" +
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
