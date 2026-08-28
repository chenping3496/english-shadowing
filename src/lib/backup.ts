import { db, loadSettings, saveSettings } from "./db";
import type {
  Material,
  Sentence,
  Card,
  Attempt,
  Recognition,
  Session,
} from "./types";

const BACKUP_VERSION = 1;

/** 素材里的 audioBlob 无法直接 JSON 序列化，导出时转 base64 */
interface BackupMaterial extends Omit<Material, "audioBlob"> {
  audioBlob?: { type: string; base64: string } | null;
}

export interface BackupFile {
  version: number;
  exportedAt: string;
  settings: { level: number; targetMinutes: number };
  materials: BackupMaterial[];
  sentences: Sentence[];
  cards: Card[];
  attempts: Attempt[];
  recognitions: Recognition[];
  sessions: Session[];
}

export interface ImportResult {
  materials: number;
  sentences: number;
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

/** 全量导出为备份对象（供调用方 JSON.stringify 后下载） */
export async function buildBackup(): Promise<BackupFile> {
  const [materials, sentences, cards, attempts, recognitions, sessions] =
    await Promise.all([
      db.materials.toArray(),
      db.sentences.toArray(),
      db.cards.toArray(),
      db.attempts.toArray(),
      db.recognitions.toArray(),
      db.sessions.toArray(),
    ]);

  const materialsOut: BackupMaterial[] = await Promise.all(
    materials.map(async (m) => {
      const { audioBlob, ...rest } = m;
      if (audioBlob) {
        return {
          ...rest,
          audioBlob: {
            type: audioBlob.type || "audio/mpeg",
            base64: await blobToBase64(audioBlob),
          },
        };
      }
      return { ...rest };
    }),
  );

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: loadSettings(),
    materials: materialsOut,
    sentences,
    cards,
    attempts,
    recognitions,
    sessions,
  };
}

/** 从备份 JSON 恢复（覆盖当前全部数据） */
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
    const { audioBlob, ...rest } = m;
    const material = { ...rest } as Material;
    if (audioBlob && typeof audioBlob.base64 === "string") {
      material.audioBlob = base64ToBlob(
        audioBlob.base64,
        audioBlob.type || "audio/mpeg",
      );
    }
    return material;
  });

  const sentences = data.sentences ?? [];
  const cards = data.cards ?? [];
  const attempts = data.attempts ?? [];
  const recognitions = data.recognitions ?? [];
  const sessions = data.sessions ?? [];

  await db.transaction(
    "rw",
    [
      db.materials,
      db.sentences,
      db.cards,
      db.attempts,
      db.recognitions,
      db.sessions,
    ],
    async () => {
      await Promise.all([
        db.materials.clear(),
        db.sentences.clear(),
        db.cards.clear(),
        db.attempts.clear(),
        db.recognitions.clear(),
        db.sessions.clear(),
      ]);
      await db.materials.bulkPut(materials);
      await db.sentences.bulkPut(sentences);
      await db.cards.bulkPut(cards);
      await db.attempts.bulkPut(attempts);
      await db.recognitions.bulkPut(recognitions);
      await db.sessions.bulkPut(sessions);
    },
  );

  if (data.settings) saveSettings(data.settings);

  return {
    materials: materials.length,
    sentences: sentences.length,
    cards: cards.length,
    attempts: attempts.length,
    recognitions: recognitions.length,
    sessions: sessions.length,
  };
}
