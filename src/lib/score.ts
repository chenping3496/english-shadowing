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
