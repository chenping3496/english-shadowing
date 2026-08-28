import { db } from "./db";
import { uid } from "./id";
import { segmentCues, extractKeywords, estimateLevel } from "./segment";
import type { SegmentSource } from "./segment";
import type { Material, MaterialType, Sentence } from "./types";

export interface ImportOptions {
  title: string;
  type: MaterialType;
  sourceUrl?: string;
  audioBlob?: Blob;
  durationSec?: number;
  cues: SegmentSource[];
}

/** 由字幕条目创建素材 + 逐句切分结果 */
export async function createMaterialFromCues(
  opts: ImportOptions,
): Promise<{ materialId: string; sentenceCount: number }> {
  const materialId = uid();
  const material: Material = {
    id: materialId,
    type: opts.type,
    title: opts.title.trim() || "未命名素材",
    sourceUrl: opts.sourceUrl,
    audioBlob: opts.audioBlob,
    durationSec: opts.durationSec,
    createdAt: Date.now(),
  };

  // 时间戳校准：过滤非法项 → 按时间排序 → clamp 起止（保证区间可播放）
  const cues = [...opts.cues]
    .filter(
      (c) =>
        c &&
        c.text?.trim() &&
        Number.isFinite(c.startSec) &&
        Number.isFinite(c.endSec),
    )
    .sort((a, b) => a.startSec - b.startSec)
    .map((c) => {
      const startSec = Math.max(0, c.startSec);
      const endSec = Math.max(startSec + 0.3, c.endSec);
      return { ...c, startSec, endSec };
    });

  const drafts = segmentCues(cues);
  const sentences: Sentence[] = drafts.map((d, i) => ({
    id: uid(),
    materialId,
    index: i,
    text: d.text,
    startSec: d.startSec,
    endSec: d.endSec,
    level: estimateLevel(d.text),
    keywords: extractKeywords(d.text),
  }));

  await db.transaction("rw", db.materials, db.sentences, async () => {
    await db.materials.add(material);
    await db.sentences.bulkAdd(sentences);
  });

  return { materialId, sentenceCount: sentences.length };
}

/** 从音频文件读取时长（用于展示） */
export function readAudioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.addEventListener("loadedmetadata", () => {
      resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
      URL.revokeObjectURL(url);
    });
    audio.addEventListener("error", () => {
      resolve(0);
      URL.revokeObjectURL(url);
    });
  });
}
