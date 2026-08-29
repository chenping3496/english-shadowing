// 发音/跟读评分：词级 Levenshtein 相似度（Web Speech 不提供置信度，改用文本对齐）

/** 归一化：小写、去标点、折叠空白 */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 泛型 Levenshtein 距离（作用于词数组） */
export function levenshtein<T>(a: T[], b: T[]): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
}

export interface TargetToken {
  text: string;
  hit: boolean;
}

export interface Analysis {
  score: number; // 0-100
  tokens: TargetToken[]; // 目标句逐词命中情况
  transcript: string; // 归一化后的识别文本
}

/**
 * 对比目标句与识别文本：
 * - score：词级相似度 0-100（100 完全一致）
 * - tokens：目标句每个词的命中标记（贪心子序列对齐）
 */
export function analyze(target: string, transcript: string): Analysis {
  const targetWords = normalizeText(target).split(" ").filter(Boolean);
  const heardWords = normalizeText(transcript).split(" ").filter(Boolean);

  if (!targetWords.length) {
    return { score: 0, tokens: [], transcript: normalizeText(transcript) };
  }

  const d = levenshtein(targetWords, heardWords);
  const score = Math.round(Math.max(0, 1 - d / targetWords.length) * 100);

  // 贪心子序列对齐，标记目标词是否被识别到
  let j = 0;
  const tokens: TargetToken[] = targetWords.map((w) => {
    let hit = false;
    while (j < heardWords.length) {
      if (heardWords[j] === w) {
        hit = true;
        j++;
        break;
      }
      j++;
    }
    return { text: w, hit };
  });

  return { score, tokens, transcript: normalizeText(transcript) };
}

export interface FluencyWord {
  begin: number; // 秒
  end: number; // 秒
  text: string;
}

export interface Fluency {
  wpm: number; // 语速（词/分钟）
  pauses: number; // 明显停顿次数（词间间隔 ≥ 0.5s）
  durationSec: number;
}

/** 从 ASR 词级时间戳计算流利度指标（零成本纯计算，不调任何 API） */
export function analyzeFluency(words: FluencyWord[]): Fluency | null {
  if (!words.length) return null;
  const durationSec = Math.max(
    0.1,
    words[words.length - 1].end - words[0].begin,
  );
  const wpm = Math.round((words.length / durationSec) * 60);
  let pauses = 0;
  for (let i = 1; i < words.length; i++) {
    if (words[i].begin - words[i - 1].end >= 0.5) pauses++;
  }
  return { wpm, pauses, durationSec };
}

const FUNCTION_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "to",
  "of", "in", "on", "at", "for", "with", "and", "or", "but", "not", "no",
  "yes", "it", "this", "that", "these", "those", "i", "you", "he", "she",
  "we", "they", "me", "my", "your", "his", "her", "our", "their", "do",
  "does", "did", "have", "has", "had", "will", "would", "can", "could",
  "should", "shall", "may", "might", "must", "just", "so", "very", "really",
  "as", "if", "then", "than", "when", "what", "who", "whom", "which",
  "there", "here", "up", "down", "out", "off", "over", "under", "again",
  "all", "some", "any", "more", "most", "get", "got", "go", "going", "come",
  "came", "know", "see", "say", "said", "like", "want", "let", "im", "dont",
  "youre", "were", "theyre", "whats", "thats", "its",
]);

/** 从 tokens 提取读错/漏读的实义词（过滤功能词与超短词），去重，用于生成发音卡 */
export function extractMissedWords(tokens: TargetToken[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    const w = normalizeText(t.text);
    if (!t.hit && w.length > 1 && !FUNCTION_WORDS.has(w) && !seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
  }
  return out;
}
