import { db } from "./db";
import { uid } from "./id";
import { isDue } from "./fsrs";
import type { Session } from "./types";

function fmt(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 连续学习天数（今日未记录则从昨日算起） */
export function computeStreak(dates: string[]): number {
  const set = new Set(dates);
  const d = new Date();
  if (!set.has(fmt(d))) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (set.has(fmt(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/** 近 7 天打卡情况（今天在最后） */
export function last7Days(dates: string[]): { date: string; done: boolean }[] {
  const set = new Set(dates);
  const out: { date: string; done: boolean }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = fmt(d);
    out.push({ date: k, done: set.has(k) });
  }
  return out;
}

/** 每次跟读后累计今日会话（用于连续天数/今日句数） */
export async function bumpSession(score: number): Promise<void> {
  const today = fmt(new Date());
  const existing = await db.sessions.where("date").equals(today).first();
  if (existing) {
    const n = existing.sentenceCount;
    existing.avgScore = Math.round((existing.avgScore * n + score) / (n + 1));
    existing.sentenceCount = n + 1;
    existing.durationSec += 8;
    await db.sessions.put(existing);
  } else {
    await db.sessions.add({
      id: uid(),
      date: today,
      durationSec: 8,
      sentenceCount: 1,
      avgScore: score,
      createdAt: Date.now(),
    });
  }
}

export interface ProgressDay {
  date: string;
  avgScore: number;
  count: number;
}

export async function loadProgress() {
  const [attempts, sessions, cards, materials, sentences] = await Promise.all([
    db.attempts.toArray(),
    db.sessions.toArray(),
    db.cards.toArray(),
    db.materials.toArray(),
    db.sentences.toArray(),
  ]);

  const byDay = new Map<string, { sum: number; n: number }>();
  for (const a of attempts) {
    const d = fmt(new Date(a.createdAt));
    const cur = byDay.get(d) ?? { sum: 0, n: 0 };
    cur.sum += a.score;
    cur.n += 1;
    byDay.set(d, cur);
  }

  const daily: ProgressDay[] = [];
  for (let i = 13; i >= 0; i--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    const k = fmt(dt);
    const cur = byDay.get(k);
    daily.push({
      date: k,
      avgScore: cur ? Math.round(cur.sum / cur.n) : 0,
      count: cur?.n ?? 0,
    });
  }

  return {
    streak: computeStreak(sessions.map((s) => s.date)),
    totalAttempts: attempts.length,
    sentenceCount: sentences.length,
    materialCount: materials.length,
    dueCards: cards.filter((c) => isDue(c.srs)).length,
    daily,
  };
}

export async function loadDashboard() {
  const [sessions, cards, materials, sentences] = await Promise.all([
    db.sessions.toArray(),
    db.cards.toArray(),
    db.materials.toArray(),
    db.sentences.toArray(),
  ]);
  const dates = sessions.map((s) => s.date);
  const dueSentence = cards.filter(
    (c) => c.kind === "sentence" && isDue(c.srs),
  ).length;
  const dueWord = cards.filter(
    (c) => c.kind === "pronunciation" && isDue(c.srs),
  ).length;
  const today = fmt(new Date());
  const todayDone = sessions
    .filter((s) => s.date === today)
    .reduce((n, s) => n + s.sentenceCount, 0);
  return {
    streak: computeStreak(dates),
    last7: last7Days(dates),
    dueSentenceCards: dueSentence,
    dueWordCards: dueWord,
    materialCount: materials.length,
    sentenceCount: sentences.length,
    todayDone,
  };
}
