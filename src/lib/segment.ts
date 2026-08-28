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

/** 把字幕条目合并成句子级跟读单元 */
export function segmentCues(cues: SegmentSource[]): SentenceDraft[] {
  const out: SentenceDraft[] = [];
  let buf: string[] = [];
  let start = 0;
  let end = 0;

  const flush = () => {
    if (buf.length) {
      const text = buf.join(" ").replace(/\s+/g, " ").trim();
      if (text) out.push({ text, startSec: start, endSec: end });
    }
    buf = [];
  };

  for (const cue of cues) {
    if (buf.length === 0) start = cue.startSec;
    end = cue.endSec;
    const t = cue.text.trim();
    buf.push(t);
    if (SENT_END.test(t)) flush();
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
