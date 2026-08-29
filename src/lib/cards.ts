import { db } from "./db";
import { uid } from "./id";
import { newSrsState, review, isDue, type Grade } from "./fsrs";
import type { Card, Sentence, RecognitionObject } from "./types";

/** 为句子创建复习卡（已存在则跳过） */
export async function ensureSentenceCard(sentence: Sentence): Promise<void> {
  const existing = await db.cards
    .filter((c) => c.sentenceId === sentence.id)
    .first();
  if (existing) return;
  const card: Card = {
    id: uid(),
    kind: "sentence",
    text: sentence.text,
    sentenceId: sentence.id,
    hint: sentence.keywords?.join(" · ") || "",
    srs: newSrsState(),
    createdAt: Date.now(),
  };
  await db.cards.add(card);
}

/** 把识物结果加入 SRS（生词卡，去重），返回新增数量 */
export async function addRecognitionCards(
  objects: RecognitionObject[],
): Promise<number> {
  const existing = new Set(
    (await db.cards.filter((c) => c.kind === "pronunciation").toArray()).map(
      (c) => c.text,
    ),
  );
  let added = 0;
  for (const o of objects) {
    const text = o.english.trim();
    if (!text || existing.has(text)) continue;
    const card: Card = {
      id: uid(),
      kind: "pronunciation",
      text,
      chinese: o.chinese,
      hint: o.chinese,
      srs: newSrsState(),
      createdAt: Date.now(),
    };
    await db.cards.add(card);
    existing.add(text);
    added++;
  }
  return added;
}

/** 把跟读/复述读错的词生成发音卡（kind=pronunciation，去重），返回实际新增的词 */
export async function addMissedWordCards(
  missedWords: string[],
  context: string,
): Promise<string[]> {
  const existing = new Set(
    (await db.cards.filter((c) => c.kind === "pronunciation").toArray()).map(
      (c) => c.text,
    ),
  );
  const added: string[] = [];
  for (const word of missedWords) {
    const text = word.trim();
    if (!text || existing.has(text)) continue;
    const card: Card = {
      id: uid(),
      kind: "pronunciation",
      text,
      hint: context, // 原句作提示：复习时看到原句，回忆/读出这个错词
      srs: newSrsState(),
      createdAt: Date.now(),
    };
    await db.cards.add(card);
    existing.add(text);
    added.push(text);
  }
  return added;
}

/** 加载到期的复习卡（按到期时间排序） */
export async function loadDueCards(): Promise<Card[]> {
  const all = await db.cards.toArray();
  return all
    .filter((c) => isDue(c.srs))
    .sort((a, b) => a.srs.due - b.srs.due);
}

/** 应用一次复习评分 */
export async function applyReview(cardId: string, grade: Grade): Promise<void> {
  const card = await db.cards.get(cardId);
  if (!card) return;
  card.srs = review(card.srs, grade);
  await db.cards.put(card);
}
