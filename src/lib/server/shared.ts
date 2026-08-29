import { randomUUID } from "node:crypto";
import { db } from "./db";

// 共享素材（管理端上传，用户可导入练习）。
// 列表接口只返回元数据；详情接口返回完整句子 + 视频播放地址。

export interface SharedSentence {
  id: string;
  index: number;
  text: string;
  startSec: number;
  endSec: number;
  level?: number;
  keywords: string[];
}

export interface SharedMaterial {
  id: string;
  title: string;
  source: string;
  videoKey: string;
  durationSec: number;
  sentences: SharedSentence[];
  createdBy: string;
  createdAt: number;
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

interface SharedRow {
  id: string;
  title: string;
  source: string;
  video_key: string;
  duration_sec: number;
  sentences: string;
  created_by: string;
  created_at: number;
}

function rowToMeta(r: SharedRow): SharedMaterialMeta {
  let sentenceCount = 0;
  try {
    sentenceCount = (JSON.parse(r.sentences) as unknown[]).length;
  } catch {
    // 忽略
  }
  return {
    id: r.id,
    title: r.title,
    source: r.source,
    durationSec: r.duration_sec,
    sentenceCount,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

export function listSharedMaterials(): SharedMaterialMeta[] {
  const rows = db
    .prepare("SELECT * FROM shared_materials ORDER BY created_at DESC")
    .all() as unknown as SharedRow[];
  return rows.map(rowToMeta);
}

export function getSharedMaterial(id: string): SharedMaterial | null {
  const r = db
    .prepare("SELECT * FROM shared_materials WHERE id = ?")
    .get(id) as unknown as SharedRow | undefined;
  if (!r) return null;
  let sentences: SharedSentence[] = [];
  try {
    sentences = JSON.parse(r.sentences) as SharedSentence[];
  } catch {
    sentences = [];
  }
  return {
    id: r.id,
    title: r.title,
    source: r.source,
    videoKey: r.video_key,
    durationSec: r.duration_sec,
    sentences,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

export function createSharedMaterial(input: {
  title: string;
  source: string;
  videoKey: string;
  durationSec: number;
  sentences: SharedSentence[];
  createdBy: string;
}): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO shared_materials
       (id, title, source, video_key, duration_sec, sentences, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.title,
    input.source,
    input.videoKey,
    input.durationSec,
    JSON.stringify(input.sentences),
    input.createdBy,
    Date.now(),
  );
  return id;
}

export function deleteSharedMaterial(id: string): boolean {
  const info = db.prepare("DELETE FROM shared_materials WHERE id = ?").run(id);
  return Number((info as { changes?: number }).changes ?? 0) > 0;
}

export function countSharedMaterials(): number {
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM shared_materials")
    .get() as { c: number } | undefined;
  return Number(row?.c ?? 0);
}
