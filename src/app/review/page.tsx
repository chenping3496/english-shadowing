"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { loadDueCards, applyReview, addMissedWordCards } from "@/lib/cards";
import {
  analyze,
  analyzeFluency,
  extractMissedWords,
  type Analysis,
  type Fluency,
} from "@/lib/score";
import { recordingSupported, startRecording, audioExtFromMime } from "@/lib/recorder";
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
  const [fluency, setFluency] = useState<Fluency | null>(null);
  const [newCards, setNewCards] = useState<string[]>([]);
  const [phase, setPhase] = useState<
    "idle" | "preparing" | "recording" | "recognizing" | "scored"
  >("idle");
  const [error, setError] = useState("");

  const stopRef = useRef<(() => void) | null>(null);
  const supported = recordingSupported();

  useEffect(() => {
    loadDueCards().then((c) => {
      setCards(c);
      setLoaded(true);
    });
  }, []);

  useEffect(() => () => stopRef.current?.(), []);

  const card = cards[idx];
  const finished = loaded && idx >= cards.length;
  // 复述目标：识物卡优先跟读可说的短句（phrase），否则用单词/句子本身
  const target = card?.phrase || card?.text || "";
  const ttsSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  function speak() {
    if (!ttsSupported || !target) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(target);
      u.lang = "en-US";
      u.rate = 0.9;
      window.speechSynthesis.speak(u);
    } catch {
      // 忽略
    }
  }

  async function recognize(blob: Blob) {
    if (!card) return;
    setPhase("recognizing");
    setError("");
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve((fr.result as string).split(",")[1] ?? "");
        fr.onerror = () => reject(new Error("读取录音失败"));
        fr.readAsDataURL(blob);
      });
      const res = await fetch("/api/asr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio: base64,
          ext: audioExtFromMime(blob.type),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "识别失败");
        setPhase("idle");
        return;
      }
      const transcript = (data.text ?? "").trim();
      if (!transcript) {
        setError("没有识别到语音，请再试一次");
        setPhase("idle");
        return;
      }
      const a = analyze(target, transcript);
      const flu = analyzeFluency(data.words ?? []);
      const missed = extractMissedWords(a.tokens);
      setAnalysis(a);
      setFluency(flu);
      setRevealed(true);
      setPhase("scored");
      try {
        const added = await addMissedWordCards(missed, target);
        if (added.length > 0) setNewCards(added);
      } catch {
        // 记录失败不阻断流程
      }
    } catch {
      setError("网络错误，识别失败");
      setPhase("idle");
    }
  }

  function startListening() {
    if (!card) return;
    setError("");
    setAnalysis(null);
    setFluency(null);
    setNewCards([]);
    setPhase("preparing");
    stopRef.current = startRecording(
      {
        onStop: (blob) => void recognize(blob),
        onError: (m) => {
          setError(m);
          setPhase("idle");
        },
        onReady: () => setPhase("recording"),
      },
      30,
    );
  }

  async function grade(g: Grade) {
    if (!card) return;
    await applyReview(card.id, g);
    setRevealed(false);
    setAnalysis(null);
    setFluency(null);
    setNewCards([]);
    setPhase("idle");
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

            {/* 发音示范：识物卡复习时先听再回忆；句子卡揭晓后显示 */}
            {(card.kind === "pronunciation" || revealed) && (
              <button
                onClick={speak}
                className="mt-4 inline-flex items-center gap-1 rounded-full border border-booth-600 px-4 py-1.5 text-xs text-ink-200 hover:border-signal"
              >
                🔊 听发音
              </button>
            )}

            {/* 答案（句子 / 单词） */}
            {revealed ? (
              <div className="mt-4">
                <p className="font-display text-2xl leading-relaxed text-ink-50">
                  {card.text}
                </p>
                {card.phrase && (
                  <p className="mt-1 font-mono text-sm text-signal">“{card.phrase}”</p>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm text-ink-400">
                试着回忆并说出来，然后查看答案
              </p>
            )}

            {/* 识别状态 */}
            <div className="mt-8 flex min-h-16 flex-col items-center justify-center gap-3">
              {phase === "preparing" || phase === "recording" ? (
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
              ) : phase === "recognizing" ? (
                <p className="text-sm text-ink-300">识别中…</p>
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
              {phase === "preparing" && (
                <p className="min-h-5 max-w-sm text-sm text-ink-200">
                  正在启动麦克风…
                </p>
              )}
              {phase === "recording" && (
                <p className="min-h-5 max-w-sm text-sm text-ink-200">
                  正在录音…请复述
                </p>
              )}
              {analysis && (
                <>
                  {analysis.transcript && (
                    <p className="max-w-sm text-sm text-ink-300">
                      你读的：{analysis.transcript}
                    </p>
                  )}
                  {fluency && (
                    <p className="text-xs text-ink-300">
                      流利度：{fluency.wpm} 词/分
                      {fluency.pauses > 0 && ` · ${fluency.pauses} 处明显停顿`}
                    </p>
                  )}
                  {newCards.length > 0 && (
                    <p className="max-w-sm text-xs text-warn">
                      已把 {newCards.length} 个读错的词加入复习卡：
                      {newCards.join("、")}
                    </p>
                  )}
                </>
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
                      onClick={() =>
                        phase === "recording"
                          ? stopRef.current?.()
                          : startListening()
                      }
                      disabled={phase === "preparing" || phase === "recognizing"}
                      className="flex items-center gap-2 rounded-full bg-signal px-6 py-3 text-sm font-semibold text-booth-950 hover:bg-signal-strong disabled:opacity-50"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="9" y="3" width="6" height="12" rx="3" />
                        <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      </svg>
                      {phase === "preparing" || phase === "recognizing"
                        ? "准备中…"
                        : phase === "recording"
                          ? "结束录音"
                          : "复述"}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      stopRef.current?.();
                      setRevealed(true);
                    }}
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
                当前浏览器不支持录音，可点击「显示答案」直接自评
              </p>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
