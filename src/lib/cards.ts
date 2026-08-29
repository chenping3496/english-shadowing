import { listLearn, getLearn, putLearn, deleteLearn } from "./server-api";
import { uid } from "./id";
import { newSrsState, review, isDue, type Grade } from "./fsrs";
import type { Card, Sentence, RecognitionObject } from "./types";

/** 为句子创建复习卡（已存在则跳过） */
export async function ensureSentenceCard(sentence: Sentence): Promise<void> {
  const all = await listLearn<Card>("cards");
  const existing = all.find((c) => c.sentenceId === sentence.id);
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
  await putLearn("cards", card);
}

/** 把单个识物结果加入生词本（发音卡，去重），关联拍照记录以便复习调出整图。返回是否新增。 */
export async function addRecognitionCard(
  o: RecognitionObject,
  recognitionId: string,
): Promise<boolean> {
  const text = o.english.trim();
  if (!text) return false;
  const all = await listLearn<Card>("cards");
  const existing = all.find(
    (c) => c.kind === "pronunciation" && c.text === text,
  );
  if (existing) return false;
  const card: Card = {
    id: uid(),
    kind: "pronunciation",
    text,
    chinese: o.chinese,
    phrase: o.phrase,
    phraseChinese: o.phraseChinese,
    recognitionId,
    hint: o.chinese,
    srs: newSrsState(),
    createdAt: Date.now(),
  };
  await putLearn("cards", card);
  return true;
}

/** 取消生词本里的一个识物词（按英文词删除发音卡）。 */
export async function removeRecognitionCard(text: string): Promise<void> {
  const all = await listLearn<Card>("cards");
  const card = all.find(
    (c) => c.kind === "pronunciation" && c.text === text,
  );
  if (card) await deleteLearn("cards", [card.id]);
}

/** 查一组英文词里，哪些已经在生词本（发音卡）中。 */
export async function getExistingWordSet(words: string[]): Promise<Set<string>> {
  const want = new Set(words.map((w) => w.trim()).filter(Boolean));
  if (!want.size) return new Set();
  const all = await listLearn<Card>("cards");
  return new Set(
    all
      .filter((c) => c.kind === "pronunciation" && want.has(c.text))
      .map((c) => c.text),
  );
}

/** 把跟读/复述读错的词生成发音卡（kind=pronunciation，去重），返回实际新增的词 */
export async function addMissedWordCards(
  missedWords: string[],
  context: string,
): Promise<string[]> {
  const all = await listLearn<Card>("cards");
  const existing = new Set(
    all.filter((c) => c.kind === "pronunciation").map((c) => c.text),
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
    await putLearn("cards", card);
    existing.add(text);
    added.push(text);
  }
  return added;
}

/** 加载到期的复习卡（按到期时间排序） */
export async function loadDueCards(): Promise<Card[]> {
  const all = await listLearn<Card>("cards");
  return all
    .filter((c) => isDue(c.srs))
    .sort((a, b) => a.srs.due - b.srs.due);
}

/** 应用一次复习评分 */
export async function applyReview(cardId: string, grade: Grade): Promise<void> {
  const card = await getLearn<Card>("cards", cardId);
  if (!card) return;
  card.srs = review(card.srs, grade);
  await putLearn("cards", card);
}
