"use client";

import { db } from "@/lib/db";
import type { Material, Sentence } from "@/lib/types";

// 共享素材的客户端访问层：
// 列表 / 详情从服务端拉取；「导入」把元数据 + 句子落本地 Dexie（视频仍从服务端流式播放）。

export interface SharedSentence {
  id: string;
  index: number;
  text: string;
  startSec: number;
  endSec: number;
  level?: number;
  keywords: string[];
}

export interface SharedMaterialMeta {
  id: string;
  title: string;
  source: string;
  durationSec: number;
  sentenceCount: number;
  createdBy: string;
  createdAt: number;
}

export interface SharedMaterialFull extends SharedMaterialMeta {
  sentences: SharedSentence[];
  videoUrl: string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      (data as { error?: string })?.error ?? `请求失败（${res.status}）`,
    ) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export async function listShared(): Promise<SharedMaterialMeta[]> {
  const d = await api<{ materials: SharedMaterialMeta[] }>(
    "/api/shared/materials",
  );
  return d.materials ?? [];
}

export async function getShared(
  id: string,
): Promise<SharedMaterialFull | null> {
  const d = await api<{ material: SharedMaterialFull | null }>(
    `/api/shared/materials/${encodeURIComponent(id)}`,
  );
  return d.material ?? null;
}

/** 导入共享素材到本地素材库（元数据 + 句子入 Dexie，视频仍流式播放）。幂等。 */
export async function importShared(
  id: string,
): Promise<{ materialId: string; sentenceCount: number }> {
  const m = await getShared(id);
  if (!m) throw new Error("素材不存在或已下架");

  const materialId = `shared_${m.id}`;
  const material: Material = {
    id: materialId,
    type: "shared",
    title: m.title,
    sourceUrl: m.videoUrl,
    durationSec: m.durationSec,
    createdAt: m.createdAt,
  };

  const sentences: Sentence[] = m.sentences.map((s) => ({
    id: `shared_${m.id}_${s.index}`,
    materialId,
    index: s.index,
    text: s.text,
    startSec: s.startSec,
    endSec: s.endSec,
    level: s.level,
    keywords: s.keywords ?? [],
  }));

  await db.transaction("rw", db.materials, db.sentences, async () => {
    await db.materials.put(material);
    // 幂等：先清旧句再写新句（重新导入时刷新字幕/视频地址）
    await db.sentences.where("materialId").equals(materialId).delete();
    await db.sentences.bulkAdd(sentences);
  });

  return { materialId, sentenceCount: sentences.length };
}

/** 该共享素材是否已导入本地 */
export async function isSharedImported(id: string): Promise<boolean> {
  const m = await db.materials.get(`shared_${id}`);
  return !!m;
}
