"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { loadDueCards, applyReview, addMissedWordCards } from "@/lib/cards";
import { db } from "@/lib/db";
import {
  analyze,
  analyzeFluency,
  extractMissedWords,
  type Analysis,
  type Fluency,
} from "@/lib/score";
import { recordingSupported, startRecording, audioExtFromMime } from "@/lib/recorder";
import { speak } from "@/lib/tts";
import { useMaterialMedia } from "@/components/useMaterialMedia";
import { Rating, type Grade } from "@/lib/fsrs";
import type { Card, Sentence, Material, Recognition, CardKind } from "@/lib/types";

// 九宫格方位 → 图上数字标号的位置（百分比）
const ZONE_POS: Record<string, { top?: string; left?: string; right?: string; bottom?: string }> = {
  "top-left": { top: "8%", left: "8%" },
  "top": { top: "8%", left: "50%" },
  "top-right": { top: "8%", left: "92%" },
  "left": { top: "50%", left: "8%" },
  "center": { top: "50%", left: "50%" },
  "right": { top: "50%", left: "92%" },
  "bottom-left": { top: "92%", left: "8%" },
  "bottom": { top: "92%", left: "50%" },
  "bottom-right": { top: "92%", left: "92%" },
};

export default function ReviewSession({ kind }: { kind: CardKind }) {
  const isSentence = kind === "sentence";
  const title = isSentence ? "句子复习" : "单词复习";
  const emptyText = isSentence
    ? "暂无待复习的句子，去跟读新素材吧"
    : "暂无待复习的单词，去拍照或跟读攒几个吧";

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
  const [sentence, setSentence] = useState<Sentence | null>(null);
  const [material, setMaterial] = useState<Material | null>(null);
  const [recognition, setRecognition] = useState<Recognition | null>(null);
  const [recogIndex, setRecogIndex] = useState(-1);

  const stopRef = useRef<(() => void) | null>(null);
  const supported = recordingSupported();

  useEffect(() => {
    loadDueCards(kind).then((c) => {
      setCards(c);
      setLoaded(true);
    });
  }, [kind]);

  useEffect(() => () => stopRef.current?.(), []);

  const card = cards[idx];
  const empty = loaded && cards.length === 0;
  const finished = loaded && !empty && idx >= cards.length;
  // 跟读/复述目标：识物卡说单词（看图说词），句子卡跟读整句
  const target = card?.text || "";

  // sentence 卡 → 查出原句所在的 material，调出视频片段（像初次跟读那样）
  useEffect(() => {
    setSentence(null);
    setMaterial(null);
    if (!card?.sentenceId) return;
    let cancelled = false;
    (async () => {
      const s = await db.sentences.get(card.sentenceId!);
      if (cancelled) return;
      setSentence(s ?? null);
      if (s) {
        const m = await db.materials.get(s.materialId);
        if (!cancelled) setMaterial(m ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [card?.sentenceId]);

  // 识物卡（pronunciation，有 recognitionId）→ 查出拍照记录，调出整图 + 标号
  useEffect(() => {
    setRecognition(null);
    setRecogIndex(-1);
    if (!card || card.kind !== "pronunciation" || !card.recognitionId) return;
    let cancelled = false;
    (async () => {
      const r = await db.recognitions.get(card.recognitionId!);
      if (cancelled) return;
      setRecognition(r ?? null);
      if (r) {
        setRecogIndex(r.objects.findIndex((o) => o.english === card.text));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [card?.id, card?.recognitionId, card?.kind, card?.text]);

  const {
    mediaKind,
    mediaSrc,
    mediaError,
    playing,
    setMediaRef,
    onPause,
    playSegment,
    stop: stopMedia,
  } = useMaterialMedia(material);

  function playOriginal() {
    if (!sentence) return;
    stopMedia();
    playSegment(sentence.startSec, sentence.endSec);
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
      setAnalysis(a);
      setFluency(flu);
      setRevealed(true);
      setPhase("scored");
      // 句子复习把读错的词生成单词卡；单词复习里读错词本身已是卡，不再生成
      if (isSentence) {
        try {
          const missed = extractMissedWords(a.tokens);
          const added = await addMissedWordCards(missed, target);
          if (added.length > 0) setNewCards(added);
        } catch {
          // 记录失败不阻断流程
        }
      }
    } catch {
      setError("网络错误，识别失败");
      setPhase("idle");
    }
  }

  function startListening() {
    if (!card) return;
    stopMedia();
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
    stopMedia();
    await applyReview(card.id, g);
    setRevealed(false);
    setAnalysis(null);
    setFluency(null);
    setNewCards([]);
    setPhase("idle");
    setError("");
    if (g === Rating.Again) {
      // 「再读一遍」：留在当前卡重新开始（视频/图重看、重新跟读），不前进
      return;
    }
    setIdx((i) => i + 1);
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-10">
      <header className="pt-5">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-sm text-ink-400 hover:text-ink-200">
            ← 返回
          </Link>
          {!finished && !empty && (
            <span className="font-mono text-xs text-ink-300">
              {idx + 1} / {cards.length}
            </span>
          )}
        </div>
        <h1 className="mt-3 font-display text-xl font-semibold text-ink-50">
          {title}
        </h1>
      </header>

      <main className="flex flex-1 flex-col justify-center py-8">
        {!loaded ? (
          <p className="text-center text-sm text-ink-300">加载中…</p>
        ) : empty ? (
          <section className="text-center">
            <p className="mt-4 text-sm text-ink-300">{emptyText}</p>
            <Link
              href="/"
              className="mt-6 inline-block rounded-full bg-signal px-6 py-2.5 text-sm font-semibold text-booth-950"
            >
              回今日
            </Link>
          </section>
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
            {/* 单词卡：提示词（识物词=中文，错词=原句）；句子卡：无提示 */}
            {!isSentence && card.hint ? (
              <p className="font-mono text-xs uppercase tracking-widest text-signal">
                {card.hint}
              </p>
            ) : null}

            {/* 识物卡：调出拍照整图 + 标号，看图说词 */}
            {!isSentence && recognition?.imageThumb && (
              <div className="relative mx-auto mt-4 w-full max-w-sm overflow-hidden rounded-2xl border border-booth-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={recognition.imageThumb}
                  alt="识别原图"
                  className="w-full"
                />
                {recognition.objects.map((o, i) => {
                  const pos = ZONE_POS[o.zone ?? ""] ?? { top: "50%", left: "50%" };
                  const isCurrent = i === recogIndex;
                  return (
                    <span
                      key={i}
                      style={pos}
                      className={`absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-bold ${
                        isCurrent
                          ? "bg-signal text-booth-950"
                          : "bg-booth-900/70 text-ink-300"
                      }`}
                    >
                      {i + 1}
                    </span>
                  );
                })}
              </div>
            )}

            {/* sentence 卡：调出原视频片段，像初次跟读那样 */}
            {isSentence && sentence && mediaKind === "video" && mediaSrc && (
              <video
                ref={setMediaRef}
                src={mediaSrc}
                className="mt-4 aspect-video w-full rounded-2xl border border-booth-700 bg-black"
                controls
                playsInline
                onPause={onPause}
              />
            )}
            {isSentence && sentence && (
              <button
                onClick={playOriginal}
                className="mt-4 inline-flex items-center gap-1 rounded-full border border-booth-600 px-4 py-1.5 text-xs text-ink-200 hover:border-signal"
              >
                {playing ? "⏸ 播放中…" : "▶ 播放这句"}
              </button>
            )}
            {mediaError && (
              <p className="mt-2 text-xs text-rec">{mediaError}</p>
            )}

            {/* 单词卡：发音示范，先听再回忆 */}
            {!isSentence && (
              <button
                onClick={() => void speak(target)}
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
                {!isSentence && card.chinese && (
                  <p className="mt-1 text-sm text-ink-300">{card.chinese}</p>
                )}
                {card.phrase && (
                  <p className="mt-1 font-mono text-sm text-signal">“{card.phrase}”</p>
                )}
                {card.phraseChinese && (
                  <p className="mt-1 text-xs text-ink-400">{card.phraseChinese}</p>
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
                  <p className="text-xs text-ink-300">跟读得分</p>
                </div>
              ) : null}
              {phase === "preparing" && (
                <p className="min-h-5 max-w-sm text-sm text-ink-200">
                  正在启动麦克风…
                </p>
              )}
              {phase === "recording" && (
                <p className="min-h-5 max-w-sm text-sm text-ink-200">
                  正在录音…请跟读
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
                          : isSentence
                            ? "跟读"
                            : "说出"}
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
                  <p className="mb-2 text-xs text-ink-400">读得怎么样？</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => grade(Rating.Again)}
                      className="rounded-xl border border-rec/40 py-3 text-sm font-semibold text-rec transition-colors hover:bg-rec/10"
                    >
                      再读一遍
                    </button>
                    <button
                      onClick={() => grade(Rating.Good)}
                      className="rounded-xl border border-good/40 py-3 text-sm font-semibold text-good transition-colors hover:bg-good/10"
                    >
                      下一句
                    </button>
                  </div>
                </div>
              )}
            </div>

            {!supported && !revealed && (
              <p className="mt-4 text-xs text-warn">
                当前浏览器不支持录音，可点击「显示答案」直接自评
              </p>
            )}

            {/* 本地音频素材：隐藏 <audio> 用于「播放这句」 */}
            {mediaKind === "audio" && (
              <audio
                ref={setMediaRef}
                src={mediaSrc ?? undefined}
                className="hidden"
                onPause={onPause}
              />
            )}
          </section>
        )}
      </main>
    </div>
  );
}
