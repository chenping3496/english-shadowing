import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";

// 共享素材视频存储抽象：
// - 本地磁盘（默认）：写 data/uploads/，经 /api/media/[key] 流式回放，几十人规模够用。
// - 腾讯云 COS（生产）：STORAGE_DRIVER=cos 时切换，视频走预签名 URL 直连 COS。
//   切 COS 前需 npm i cos-nodejs-sdk-v5 并配好 COS_* 环境变量。

const DRIVER = process.env.STORAGE_DRIVER ?? "local";
const UPLOAD_DIR =
  process.env.UPLOAD_DIR ?? join(process.cwd(), "data", "uploads");

const MIME: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  webm: "video/webm",
  mov: "video/quicktime",
  mkv: "video/x-matroska",
};

/** 从文件名取扩展名（小写，默认 mp4） */
export function safeExt(name: string): string {
  const m = /\.([a-zA-Z0-9]{1,5})$/.exec(name);
  return (m?.[1] ?? "mp4").toLowerCase();
}

/** 扩展名 → MIME（用于流式回放 Content-Type） */
export function extToMime(ext: string): string {
  return MIME[ext.toLowerCase()] ?? "application/octet-stream";
}

/** 防目录穿越：key 只保留安全字符 */
export function resolveVideoKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, "");
}

// —— 本地驱动 ——

async function ensureDir() {
  await mkdir(UPLOAD_DIR, { recursive: true });
}

/** 保存视频，返回存储 key（本地为文件名，COS 为对象 Key）。 */
export async function saveVideo(buf: Buffer, ext: string): Promise<string> {
  if (DRIVER === "cos") return saveVideoCos(buf, ext);
  await ensureDir();
  const key = `${randomUUID()}.${ext}`;
  await writeFile(join(UPLOAD_DIR, key), buf);
  return key;
}

/** 取视频播放地址（本地为站内 /api/media/[key]，COS 为预签名 URL）。 */
export async function getVideoUrl(key: string): Promise<string> {
  if (DRIVER === "cos") return getVideoUrlCos(key);
  return `/api/media/${encodeURIComponent(key)}`;
}

export async function deleteVideo(key: string): Promise<void> {
  if (!key) return;
  if (DRIVER === "cos") return deleteVideoCos(key);
  try {
    await unlink(join(UPLOAD_DIR, key));
  } catch {
    // 文件不存在则忽略
  }
}

export interface VideoFile {
  buf: Buffer;
  size: number;
  ext: string;
}

/** 读取本地视频文件（仅供 /api/media 流式回放；COS 驱动返回 null）。 */
export async function readVideo(key: string): Promise<VideoFile | null> {
  if (DRIVER === "cos") return null;
  try {
    const p = join(UPLOAD_DIR, key);
    const s = await stat(p);
    const buf = await readFile(p);
    return { buf, size: s.size, ext: safeExt(key) };
  } catch {
    return null;
  }
}

// —— COS 驱动（懒加载 SDK，未安装时不影响本地驱动与 build） ——

/** 运行时 require：仅在 STORAGE_DRIVER=cos 且已安装 SDK 时才真正加载。 */
function loadCosSdk(): any {
  const require = createRequire(process.cwd() + "/");
  return require("cos-nodejs-sdk-v5");
}

function cosClient(): any {
  const COS = loadCosSdk();
  return new COS({
    SecretId: process.env.COS_SECRET_ID ?? "",
    SecretKey: process.env.COS_SECRET_KEY ?? "",
  });
}

function cosCfg() {
  const bucket = process.env.COS_BUCKET ?? "";
  const region = process.env.COS_REGION ?? "";
  if (!bucket || !region) {
    throw new Error(
      "COS 未配置：请在 .env.local 设置 COS_BUCKET / COS_REGION / COS_SECRET_ID / COS_SECRET_KEY",
    );
  }
  return {
    Bucket: bucket,
    Region: region,
    Prefix: process.env.COS_PREFIX ?? "shared/",
  };
}

async function saveVideoCos(buf: Buffer, ext: string): Promise<string> {
  const cos = cosClient();
  const cfg = cosCfg();
  const key = `${cfg.Prefix}${randomUUID()}.${ext}`;
  await new Promise<void>((resolve, reject) => {
    cos.putObject(
      { Bucket: cfg.Bucket, Region: cfg.Region, Key: key, Body: buf },
      (err: unknown) => (err ? reject(err) : resolve()),
    );
  });
  return key;
}

async function getVideoUrlCos(key: string): Promise<string> {
  const cos = cosClient();
  const cfg = cosCfg();
  return await new Promise<string>((resolve, reject) => {
    cos.getObjectUrl(
      {
        Bucket: cfg.Bucket,
        Region: cfg.Region,
        Key: key,
        Sign: true,
        Expires: 3600,
      },
      (err: unknown, data: { Url?: string }) =>
        err ? reject(err) : resolve(data.Url ?? ""),
    );
  });
}

async function deleteVideoCos(key: string): Promise<void> {
  const cos = cosClient();
  const cfg = cosCfg();
  await new Promise<void>((resolve, reject) => {
    cos.deleteObject(
      { Bucket: cfg.Bucket, Region: cfg.Region, Key: key },
      (err: unknown) => (err ? reject(err) : resolve()),
    );
  });
}
