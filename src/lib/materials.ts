import { db } from "./db";

/**
 * 级联删除素材：素材 + 其句子 + 关联复习卡（sentence 卡）+ 练习记录。
 * 单个删除与批量删除共用（批量传多个 id，一次事务完成）。
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

  const cardIds = (
    await db.cards
      .filter(
        (c) => c.kind === "sentence" && sentenceSet.has(c.sentenceId ?? ""),
      )
      .toArray()
  ).map((c) => c.id);

  const attemptIds = sentenceIds.length
    ? (
        await db.attempts.where("sentenceId").anyOf(sentenceIds).toArray()
      ).map((a) => a.id)
    : [];

  await db.transaction(
    "rw",
    db.materials,
    db.sentences,
    db.cards,
    db.attempts,
    async () => {
      await db.materials.bulkDelete(materialIds);
      await db.sentences.bulkDelete(sentenceIds);
      if (cardIds.length) await db.cards.bulkDelete(cardIds);
      if (attemptIds.length) await db.attempts.bulkDelete(attemptIds);
    },
  );
}
