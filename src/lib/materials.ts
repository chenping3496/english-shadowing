import { db } from "./db";
import { listLearn, deleteLearn } from "./server-api";
import type { Card, Attempt } from "./types";

/**
 * 级联删除素材：素材 + 其句子（本地）+ 关联复习卡（sentence 卡）+ 练习记录（服务端）。
 * 单个删除与批量删除共用（批量传多个 id）。
 * 不影响拍照识物卡（kind="pronunciation"，无 sentenceId）与每日会话记录。
 */
export async function deleteMaterials(materialIds: string[]): Promise<void> {
  if (!materialIds.length) return;

  const sentences = await db.sentences
    .where("materialId")
    .anyOf(materialIds)
    .toArray();
  const sentenceIds = sentences.map((s) => s.id);
  const sentenceSet = new Set(sentenceIds);

  const cards = await listLearn<Card>("cards");
  const cardIds = cards
    .filter((c) => c.kind === "sentence" && sentenceSet.has(c.sentenceId ?? ""))
    .map((c) => c.id);

  const attempts = await listLearn<Attempt>("attempts");
  const attemptIds = attempts
    .filter((a) => a.sentenceId && sentenceSet.has(a.sentenceId))
    .map((a) => a.id);

  // 本地素材/句子 与 服务端卡片/记录 并行删除
  await db.transaction("rw", db.materials, db.sentences, async () => {
    await db.materials.bulkDelete(materialIds);
    await db.sentences.bulkDelete(sentenceIds);
  });
  await Promise.all([
    cardIds.length ? deleteLearn("cards", cardIds) : Promise.resolve(),
    attemptIds.length ? deleteLearn("attempts", attemptIds) : Promise.resolve(),
  ]);
}
