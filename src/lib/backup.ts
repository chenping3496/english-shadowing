import { db, loadSettings, saveSettings } from "./db";
import { syncLearn } from "./server-api";
import type { Material, Sentence } from "./types";

// v2：学习数据（卡片/记录/识别/会话）已迁到服务端账号，本备份只管「本地素材 + 句子 + 设置」。
const BACKUP_VERSION = 2;

/** 素材里的 Blob 无法直接 JSON 序列化，导出时转 base64 */
interface BackupMaterial extends Omit<Material, "audioBlob" | "videoBlob"> {
  audioBlob?: { type: string; base64: string } | null;
  videoBlob?: { type: string; base64: string } | null;
}

export interface BackupFile {
  version: number;
  exportedAt: string;
  settings: { level: number; targetMinutes: number };
  materials: BackupMaterial[];
  sentences: Sentence[];
}

export interface ImportResult {
  materials: number;
  sentences: number;
}

export interface MigrateResult {
  cards: number;
  attempts: number;
  recognitions: number;
  sessions: number;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64: string, type: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** 全量导出本地数据（素材 + 句子 + 设置）为备份对象 */
export async function buildBackup(): Promise<BackupFile> {
  const [materials, sentences] = await Promise.all([
    db.materials.toArray(),
    db.sentences.toArray(),
  ]);

  const materialsOut: BackupMaterial[] = await Promise.all(
    materials.map(async (m) => {
      const { audioBlob, videoBlob, ...rest } = m;
      const out: BackupMaterial = { ...rest };
      if (audioBlob) {
        out.audioBlob = {
          type: audioBlob.type || "audio/mpeg",
          base64: await blobToBase64(audioBlob),
        };
      }
      if (videoBlob) {
        out.videoBlob = {
          type: videoBlob.type || "video/mp4",
          base64: await blobToBase64(videoBlob),
        };
      }
      return out;
    }),
  );

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: loadSettings(),
    materials: materialsOut,
    sentences,
  };
}

/** 从备份 JSON 恢复本地素材 + 句子（覆盖当前本地数据） */
export async function restoreBackup(json: string): Promise<ImportResult> {
  let data: BackupFile;
  try {
    data = JSON.parse(json) as BackupFile;
  } catch {
    throw new Error("不是有效的 JSON 备份文件");
  }
  if (!data || data.version !== BACKUP_VERSION) {
    throw new Error("备份文件版本不识别，请使用本应用导出的备份");
  }

  const materials: Material[] = (data.materials ?? []).map((m) => {
    const { audioBlob, videoBlob, ...rest } = m;
    const material = { ...rest } as Material;
    if (audioBlob && typeof audioBlob.base64 === "string") {
      material.audioBlob = base64ToBlob(
        audioBlob.base64,
        audioBlob.type || "audio/mpeg",
      );
    }
    if (videoBlob && typeof videoBlob.base64 === "string") {
      material.videoBlob = base64ToBlob(
        videoBlob.base64,
        videoBlob.type || "video/mp4",
      );
    }
    return material;
  });

  const sentences = data.sentences ?? [];

  await db.transaction("rw", db.materials, db.sentences, async () => {
    await Promise.all([db.materials.clear(), db.sentences.clear()]);
    await db.materials.bulkPut(materials);
    await db.sentences.bulkPut(sentences);
  });

  if (data.settings) saveSettings(data.settings);

  return { materials: materials.length, sentences: sentences.length };
}

/**
 * 一次性迁移：把旧版留在浏览器里的学习数据（卡片/跟读记录/拍照识别/每日会话）
 * 推送到当前登录账号。幂等（重复执行按 id 覆盖，不产生重复）。
 */
export async function migrateLocalLearningData(): Promise<MigrateResult> {
  const [cards, attempts, recognitions, sessions] = await Promise.all([
    db.cards.toArray(),
    db.attempts.toArray(),
    db.recognitions.toArray(),
    db.sessions.toArray(),
  ]);
  const { imported } = await syncLearn({
    cards,
    attempts,
    recognitions,
    sessions,
  });
  return imported;
}

/** 旧版本地学习数据还剩多少（迁移前展示给用户） */
export async function localLearningCount(): Promise<MigrateResult> {
  const [cards, attempts, recognitions, sessions] = await Promise.all([
    db.cards.count(),
    db.attempts.count(),
    db.recognitions.count(),
    db.sessions.count(),
  ]);
  return { cards, attempts, recognitions, sessions };
}
