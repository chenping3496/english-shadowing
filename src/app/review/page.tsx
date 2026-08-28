"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { loadDueCards, applyReview } from "@/lib/cards";
import { analyze, type Analysis } from "@/lib/score";
import { speechSupported, startRecognition } from "@/lib/speech";
import { Rating, GRADE_LABELS, type Grade } from "@/lib/fsrs";
import type { Card } from "@/lib/types";

const GRADES: { grade: Grade; style: string }[] = [
  { grade: Rating.Again, style: "border-rec/40 text-rec hover:bg-rec/10" },
  { grade: Rating.Hard, style: "border-warn/40 text-warn hover:bg-warn/10" },
  { grade: Rating.Good, style: "border-good/40 text-good hover:bg-good/10" },
  { grade: Rating.Easy, style: "border-signal/60 text-signal hover:bg-signal-dim" },
];

export default function Review() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");

  const finalRef = useRef("");
  const stopRef = useRef<(() => void) | null>(null);
  const supported = speechSupported();

  useEffect(() => {
    loadDueCards().then((c) => {
      setCards(c);
      setLoaded(true);
    });
  }, []);

  useEffect(() => () => stopRef.current?.(), []);

  const card = cards[idx];
  const finished = loaded && idx >= cards.length;

  function startListening() {
    if (!card) return;
    setError("");
    finalRef.current = "";
    setInterim("");
    setAnalysis(null);
    setListening(true);
    stopRef.current = startRecognition({
      onInterim: setInterim,
      onFinal: (t) => {
        finalRef.current = (finalRef.current + " " + t).trim();
      },
      onError: (m) => setError(m),
      onEnd: () => {
        setListening(false);
        setRevealed(true);
        setAnalysis(analyze(card.text, finalRef.current.trim()));
      },
    });
  }

  async function grade(g: Grade) {
    if (!card) return;
    await applyReview(card.id, g);
    setRevealed(false);
    setAnalysis(null);
    setInterim("");
    setError("");
    setIdx((i) => i + 1);
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-10">
      <header className="pt-5">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-ink-400 hover:text-ink-200">
            ← 返回
          </Link>
          {!finished && (
            <span className="font-mono text-xs text-ink-300">
              {idx + 1} / {cards.length}
            </span>
          )}
        </div>
        <h1 className="mt-3 font-display text-xl font-semibold text-ink-50">
          复习
        </h1>
      </header>

      <main className="flex flex-1 flex-col justify-center py-8">
        {!loaded ? (
          <p className="text-center text-sm text-ink-300">加载中…</p>
        ) : finished ? (
          <section className="text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-good/40 bg-good/10">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 13l4 4L19 7"
                  stroke="var(--color-good)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2 className="mt-5 font-display text-xl font-semibold text-ink-50">
              复习完成
            </h2>
            <p className="mt-1 text-sm text-ink-300">
              今日待复习卡片已全部过完，去跟读新素材吧
            </p>
            <Link
              href="/"
              className="mt-6 inline-block rounded-full bg-signal px-6 py-2.5 text-sm font-semibold text-booth-950"
            >
              回今日
            </Link>
          </section>
        ) : (
          <section className="text-center">
            {/* 提示词（关键词） */}
            {card.hint ? (
              <p className="font-mono text-xs uppercase tracking-widest text-signal">
                {card.hint}
              </p>
            ) : null}

            {/* 答案（句子） */}
            {revealed ? (
              <p className="mt-4 font-display text-2xl leading-relaxed text-ink-50">
                {card.text}
              </p>
            ) : (
              <p className="mt-4 text-sm text-ink-400">
                试着回忆并说出来，然后查看答案
              </p>
            )}

            {/* 识别状态 */}
            <div className="mt-8 flex min-h-16 flex-col items-center justify-center gap-3">
              {listening ? (
                <div className="flex h-12 items-end gap-1">
                  {Array.from({ length: 16 }).map((_, i) => (
                    <span
                      key={i}
                      className="w-1.5 animate-pulse rounded-full bg-signal"
                      style={{
                        height: `${16 + ((i * 37) % 32)}px`,
                        animationDelay: `${i * 60}ms`,
                      }}
                    />
                  ))}
                </div>
              ) : analysis ? (
                <div className="space-y-1">
                  <span
                    className={`font-display text-4xl font-bold ${
                      analysis.score >= 85
                        ? "text-good"
                        : analysis.score >= 60
                          ? "text-warn"
                          : "text-rec"
                    }`}
                  >
                    {analysis.score}
                  </span>
                  <p className="text-xs text-ink-300">复述得分</p>
                </div>
              ) : null}
              {listening && (
                <p className="min-h-5 max-w-sm text-sm text-ink-200">
                  {interim || "（正在听…）"}
                </p>
              )}
              {error && (
                <p className="max-w-sm text-sm text-rec">{error}</p>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="mt-6 flex flex-col items-center gap-3">
              {!revealed ? (
                <div className="flex gap-3">
                  {supported && (
                    <button
                      onClick={startListening}
                      disabled={listening}
                      className="flex items-center gap-2 rounded-full bg-signal px-6 py-3 text-sm font-semibold text-booth-950 hover:bg-signal-strong disabled:opacity-50"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="9" y="3" width="6" height="12" rx="3" />
                        <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                      {listening ? "听你读…" : "复述"}
                    </button>
                  )}
                  <button
                    onClick={() => setRevealed(true)}
                    className="rounded-full border border-booth-600 px-6 py-3 text-sm text-ink-200 hover:border-signal"
                  >
                    显示答案
                  </button>
                </div>
              ) : (
                <div className="w-full max-w-sm">
                  <p className="mb-2 text-xs text-ink-400">掌握程度如何？</p>
                  <div className="grid grid-cols-4 gap-2">
                    {GRADES.map(({ grade: g, style }) => (
                      <button
                        key={g}
                        onClick={() => grade(g)}
                        className={`rounded-xl border py-3 text-sm font-semibold transition-colors ${style}`}
                      >
                        {GRADE_LABELS[g]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {!supported && !revealed && (
              <p className="mt-4 text-xs text-warn">
                当前浏览器不支持语音识别，可点击「显示答案」直接自评
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
