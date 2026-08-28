export interface SubtitleCue {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
}

const TIME_RE =
  /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

function toSec(h: string, m: string, s: string, ms: string): number {
  return (
    parseInt(h, 10) * 3600 +
    parseInt(m, 10) * 60 +
    parseInt(s, 10) +
    parseInt(ms.padEnd(3, "0"), 10) / 1000
  );
}

/** 解析 SRT 文本为字幕条目 */
export function parseSrt(content: string): SubtitleCue[] {
  const blocks = content.replace(/\r\n/g, "\n").split(/\n\s*\n/);
  const cues: SubtitleCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (lines.length < 2) continue;
    const timeIdx = lines.findIndex((l) => l.includes("-->"));
    if (timeIdx === -1) continue;
    const m = lines[timeIdx].match(TIME_RE);
    if (!m) continue;
    const text = lines
      .slice(timeIdx + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (!text) continue;
    cues.push({
      index: cues.length,
      startSec: toSec(m[1], m[2], m[3], m[4]),
      endSec: toSec(m[5], m[6], m[7], m[8]),
      text,
    });
  }
  return cues;
}
