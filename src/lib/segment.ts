export interface SegmentSource {
  text: string;
  startSec: number;
  endSec: number;
}

export interface SentenceDraft {
  text: string;
  startSec: number;
  endSec: number;
}

const SENT_END = /[.!?。！？…]["']?$/;

// 句子切分参数（B 站 CC 字幕普遍不带句末标点，需靠时间间隙 + 长度兜底）
const GAP_SEC = 0.7; // 相邻字幕时间间隙 ≥ 此值视为句子边界（说话人停顿）
const MAX_WORDS = 14; // 英文句子上限（词数）
const MAX_CHARS = 20; // 中文等无空格语言句子上限（字符数）
const CJK = /[一-鿿぀-ヿ가-힯]/;

/** 累积文本是否过长（超出跟读单元上限），中英文分别按字符数/词数判断 */
function tooLong(text: string): boolean {
  if (CJK.test(text)) return text.replace(/\s+/g, "").length >= MAX_CHARS;
  return text.trim().split(/\s+/).filter(Boolean).length >= MAX_WORDS;
}

/** 把字幕条目合并成句子级跟读单元 */
export function segmentCues(cues: SegmentSource[]): SentenceDraft[] {
  const out: SentenceDraft[] = [];
  let buf: string[] = [];
  let start = 0;
  let end = 0;
  let prevEnd = -1;

  const flush = () => {
    if (buf.length) {
      const text = buf.join(" ").replace(/\s+/g, " ").trim();
      if (text) out.push({ text, startSec: start, endSec: end });
    }
    buf = [];
  };

  for (const cue of cues) {
    const t = cue.text.trim();
    if (!t) continue;

    // 信号1：与上一条字幕时间间隙过大 → 上一句已结束
    if (buf.length > 0 && cue.startSec - prevEnd >= GAP_SEC) flush();

    if (buf.length === 0) start = cue.startSec;
    end = cue.endSec;
    buf.push(t);
    prevEnd = cue.endSec;

    // 信号2：句末标点 → 本句结束
    if (SENT_END.test(t)) {
      flush();
      continue;
    }

    // 信号3：累积过长 → 强制切（防止 CC 无标点导致一大段）
    if (tooLong(buf.join(" "))) flush();
  }
  flush();
  return out;
}

const STOP = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "to",
  "of", "in", "on", "at", "for", "with", "and", "or", "but", "not", "no",
  "yes", "it", "this", "that", "these", "those", "i", "you", "he", "she",
  "we", "they", "me", "my", "your", "his", "her", "our", "their", "do",
  "does", "did", "have", "has", "had", "will", "would", "can", "could",
  "should", "shall", "may", "might", "must", "just", "so", "very", "really",
  "as", "if", "then", "than", "when", "what", "who", "whom", "which",
  "there", "here", "up", "down", "out", "off", "over", "under", "again",
  "all", "some", "any", "more", "most", "get", "got", "go", "going", "come",
  "came", "know", "see", "say", "said", "like", "want", "let", "im", "i'm",
  "dont", "don't", "you're", "youre", "we're", "were", "they're", "what's",
  "whats", "that's", "thats", "it's", "its", "ll", "ve", "re", "s",
]);

/** 提取关键词（复述提示用） */
export function extractKeywords(text: string, max = 4): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z'\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    if (!seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
    if (out.length >= max) break;
  }
  return out;
}

/** 简单 i+1 难度估计（1-5） */
export function estimateLevel(text: string): number {
  const words = text.split(/\s+/).filter(Boolean);
  const avgLen = words.length
    ? words.reduce((s, w) => s + w.length, 0) / words.length
    : 4;
  let score = 3;
  if (avgLen > 5.5) score += 1;
  else if (avgLen < 4) score -= 1;
  if (words.length > 12) score += 1;
  else if (words.length < 5) score -= 1;
  return Math.max(1, Math.min(5, score));
}
