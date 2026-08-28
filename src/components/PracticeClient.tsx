"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { uid } from "@/lib/id";
import { ensureSentenceCard } from "@/lib/cards";
import { bumpSession } from "@/lib/stats";
import { analyze, type Analysis } from "@/lib/score";
import { speechSupported, startRecognition } from "@/lib/speech";
import type { Material, Sentence } from "@/lib/types";

type Phase = "idle" | "listening" | "scored";
type MediaKind = "audio" | "video" | null;

export default function PracticeClient({ materialId }: { materialId: string }) {
  const [material, setMaterial] = useState<Material | null>(null);
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [interim, setInterim] = useState("");
  const [result, setResult] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [doneScores, setDoneScores] = useState<number[]>([]);
  const [mediaKind, setMediaKind] = useState<MediaKind>(null);
  const [mediaSrc, setMediaSrc] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [playing, setPlaying] = useState(false);

  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const endTimer = useRef<number | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const finalRef = useRef("");
  const errRef = useRef("");
  const objectUrlRef = useRef<string | null>(null);

  const supported = speechSupported();

  const setMediaRef = useCallback((el: HTMLMediaElement | null) => {
    mediaRef.current = el;
  }, []);

  useEffect(() => {
    (async () => {
      const m = await db.materials.get(materialId);
      if (!m) {
        setLoaded(true);
        return;
      }
      const ss = await db.sentences
        .where("materialId")
        .equals(materialId)
        .sortBy("index");
      setMaterial(m);
      setSentences(ss);
      setLoaded(true);
    })();
  }, [materialId]);

  // 本地素材：用 Blob 生成 object URL
  useEffect(() => {
    if (material?.audioBlob) {
      objectUrlRef.current = URL.createObjectURL(material.audioBlob);
      setMediaSrc(objectUrlRef.current);
      setMediaKind("audio");
    }
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, [material]);

  // B 站素材：优先本地缓存，否则直连播放并后台下载缓存
  useEffect(() => {
    if (material?.type !== "bilibili") return;
    let cancelled = false;

    // 已有本地缓存 → object URL 直接播（秒开、不过期、可离线）
    if (material.videoBlob) {
      const url = URL.createObjectURL(material.videoBlob);
      objectUrlRef.current = url;
      setMediaSrc(url);
      setMediaKind("video");
      setMediaError("");
      return () => {
        URL.revokeObjectURL(url);
        if (objectUrlRef.current === url) objectUrlRef.current = null;
      };
    }

    // 无缓存 → 先拿直连地址立即播放，再后台下载缓存（下次进页生效）
    (async () => {
      try {
        const res = await fetch("/api/bilibili/play", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: material.sourceUrl ?? "" }),
        });
        const data = await res.json();
        if (!res.ok || !data.playUrl) {
          if (!cancelled) {
            setMediaError(data.error ?? "无法获取视频播放地址");
            setMediaKind(null);
          }
          return;
        }
        if (cancelled) return;
        setMediaSrc(data.playUrl);
        setMediaKind("video");
        setMediaError("");

        // 后台下载缓存（失败/过大则保持在线播放，不影响本次练习）
        try {
          const dl = await fetch("/api/bilibili/download", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input: material.sourceUrl ?? "" }),
          });
          if (dl.ok) {
            const blob = await dl.blob();
            if (!cancelled && blob.size > 0) {
              await db.materials.update(material.id, { videoBlob: blob });
            }
          }
        } catch {
          // 缓存失败静默忽略，保留在线播放
        }
      } catch {
        if (!cancelled) {
          setMediaError("网络错误，无法获取视频");
          setMediaKind(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [material]);

  useEffect(() => {
    return () => {
      if (endTimer.current) clearTimeout(endTimer.current);
      stopRef.current?.();
    };
  }, []);

  const sentence = sentences[idx];

  const playSentence = () => {
    const el = mediaRef.current;
    const s = sentences[idx];
    if (!el || !s) return;
    const start = () => {
      try {
        el.currentTime = s.startSec;
        setPlaying(true);
        const p = el.play();
        if (p) p.catch(() => setPlaying(false));
        if (endTimer.current) clearTimeout(endTimer.current);
        endTimer.current = window.setTimeout(() => {
          el.pause();
          setPlaying(false);
        }, Math.max(600, (s.endSec - s.startSec) * 1000 + 300));
      } catch {
        setPlaying(false);
      }
    };
    if (el.readyState >= 1) start();
    else el.addEventListener("loadedmetadata", start, { once: true });
  };

  // 进入 / 切换句子时自动播放该句
  useEffect(() => {
    if (loaded && mediaKind) playSentence();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, mediaKind, mediaSrc, idx]);

  const finalize = useCallback(async () => {
    if (!sentence) return;
    const transcript = finalRef.current.trim();
    // 有错误且无识别结果 → 回到待命，不评分
    if (errRef.current && !transcript) {
      setPhase("idle");
      return;
    }
    const analysis = analyze(sentence.text, transcript);
    setResult(analysis);
    setPhase("scored");
    setDoneScores((prev) => [...prev, analysis.score]);
    try {
      await db.attempts.add({
        id: uid(),
        sentenceId: sentence.id,
        kind: "shadow",
        target: sentence.text,
        transcript,
        score: analysis.score,
        createdAt: Date.now(),
      });
      await ensureSentenceCard(sentence);
      await bumpSession(analysis.score);
    } catch {
      // 记录失败不阻断流程
    }
  }, [sentence]);

  const startListening = useCallback(() => {
    if (!supported) return;
    setError("");
    errRef.current = "";
    finalRef.current = "";
    setInterim("");
    setResult(null);
    setPhase("listening");
    stopRef.current = startRecognition({
      onInterim: (t) => setInterim(t),
      onFinal: (t) => {
        finalRef.current = (finalRef.current + " " + t).trim();
      },
      onError: (m) => {
        errRef.current = m;
        setError(m);
      },
      onEnd: () => void finalize(),
    });
  }, [supported, finalize]);

  const goto = useCallback((next: number) => {
    setIdx(Math.max(0, Math.min(sentences.length - 1, next)));
    setPhase("idle");
    setInterim("");
    setResult(null);
    setError("");
    finalRef.current = "";
  }, [sentences.length]);

  const repeatSentence = () => {
    playSentence();
    setPhase("idle");
    setInterim("");
    setResult(null);
    setError("");
    finalRef.current = "";
  };

  if (!loaded) {
    return (
      <div className="px-5 pt-20 text-center text-sm text-ink-300">加载中…</div>
    );
  }

  if (!material) {
    return (
      <div className="px-5 pt-20 text-center">
        <p className="text-sm text-ink-300">素材不存在或已删除</p>
        <Link
          href="/library"
          className="mt-4 inline-block rounded-full bg-signal px-5 py-2 text-sm font-semibold text-booth-950"
        >
          去导入
        </Link>
      </div>
    );
  }

  if (!sentences.length) {
    return (
      <div className="px-5 pt-20 text-center text-sm text-ink-300">
        该素材没有可跟读的句子
      </div>
    );
  }

  const finished = idx >= sentences.length - 1 && phase === "scored";
  const avg =
    doneScores.length > 0
      ? Math.round(doneScores.reduce((a, b) => a + b, 0) / doneScores.length)
      : 0;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-10">
      {/* 顶部进度 */}
      <header className="pt-5">
        <div className="flex items-center justify-between">
          <Link
            href="/practice"
            className="text-sm text-ink-400 hover:text-ink-200"
          >
            ← 返回
          </Link>
          <span className="font-mono text-xs text-ink-300">
            {idx + 1} / {sentences.length}
          </span>
        </div>
        <p className="mt-2 truncate text-sm font-semibold text-ink-50">
          {material.title}
        </p>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-booth-800">
          <div
            className="h-full bg-signal transition-all duration-300"
            style={{ width: `${((idx + (phase === "scored" ? 1 : 0)) / sentences.length) * 100}%` }}
          />
        </div>
      </header>

      {/* 主区域 */}
      <main className="flex flex-1 flex-col justify-center py-8">
        {finished ? (
          <section className="text-center">
            <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-good/40 bg-good/10">
              <span className="font-display text-3xl font-bold text-good">
                {avg}
              </span>
            </div>
            <h2 className="mt-5 font-display text-xl font-semibold text-ink-50">
              本轮完成
            </h2>
            <p className="mt-1 text-sm text-ink-300">
              平均跟读得分 · 共 {doneScores.length} 句
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                onClick={() => goto(0)}
                className="rounded-full border border-booth-700 px-5 py-2.5 text-sm text-ink-200 hover:border-signal"
              >
                再练一遍
              </button>
              <Link
                href="/practice"
                className="rounded-full bg-signal px-5 py-2.5 text-sm font-semibold text-booth-950"
              >
                完成
              </Link>
            </div>
          </section>
        ) : (
          <section className="text-center">
            {/* B 站：显示视频画面 */}
            {mediaKind === "video" && mediaSrc && (
              <video
                ref={setMediaRef}
                src={mediaSrc}
                className="mb-6 aspect-video w-full rounded-2xl border border-booth-700 bg-black"
                controls
                playsInline
                onPause={() => setPlaying(false)}
              />
            )}

            {/* 目标句 */}
            <p className="font-display text-2xl leading-relaxed text-ink-50">
              {sentence.text}
            </p>
            <p className="mt-2 font-mono text-[11px] text-ink-400">
              {sentence.level ? `难度 ${"●".repeat(sentence.level)}${"○".repeat(5 - sentence.level)}` : ""}
            </p>

            {/* 播放 / 聆听区 */}
            <div className="mt-8 flex flex-col items-center gap-4">
              {mediaKind ? (
                <button
                  onClick={playSentence}
                  className={`flex h-16 w-16 items-center justify-center rounded-full border transition-colors ${
                    playing
                      ? "border-signal bg-signal-dim text-signal"
                      : "border-booth-600 text-ink-100 hover:border-signal"
                  }`}
                  aria-label="播放本句"
                >
                  {playing ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="5" width="4" height="14" rx="1" />
                      <rect x="14" y="5" width="4" height="14" rx="1" />
                    </svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M7 5v14l12-7L7 5Z" />
                    </svg>
                  )}
                </button>
              ) : mediaError ? (
                <p className="text-xs text-rec">{mediaError}</p>
              ) : (
                <p className="text-xs text-ink-400">
                  YouTube 素材无音视频，直接朗读即可
                </p>
              )}

              {/* 波形 / 识别状态 */}
              {phase === "listening" ? (
                <div className="flex h-14 items-end gap-1">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <span
                      key={i}
                      className="w-1.5 animate-pulse rounded-full bg-signal"
                      style={{
                        height: `${20 + ((i * 37) % 40)}px`,
                        animationDelay: `${i * 60}ms`,
                      }}
                    />
                  ))}
                </div>
              ) : phase === "scored" && result ? (
                <div className="space-y-2">
                  <div
                    className={`font-display text-5xl font-bold ${
                      result.score >= 85
                        ? "text-good"
                        : result.score >= 60
                          ? "text-warn"
                          : "text-rec"
                    }`}
                  >
                    {result.score}
                  </div>
                  <p className="text-xs text-ink-300">跟读得分</p>
                </div>
              ) : (
                <div className="h-14" />
              )}
            </div>

            {/* 实时识别文本 */}
            {phase === "listening" && (
              <p className="mx-auto mt-4 min-h-6 max-w-sm text-sm text-ink-200">
                {interim || "（正在听…请跟读）"}
              </p>
            )}

            {error && phase !== "listening" && (
              <p className="mx-auto mt-4 max-w-sm text-sm text-rec">{error}</p>
            )}

            {/* 评分结果详情 */}
            {phase === "scored" && result && (
              <div className="mx-auto mt-6 max-w-sm rounded-2xl border border-booth-700 bg-booth-900 p-4 text-left">
                <p className="flex flex-wrap gap-1 text-sm leading-relaxed">
                  {result.tokens.map((t, i) => (
                    <span
                      key={i}
                      className={t.hit ? "text-good" : "text-rec line-through"}
                    >
                      {t.text}
                    </span>
                  ))}
                </p>
                {result.transcript && (
                  <p className="mt-2 border-t border-booth-700 pt-2 text-sm text-ink-300">
                    你读的：{result.transcript}
                  </p>
                )}
              </div>
            )}
          </section>
        )}
      </main>

      {/* 底部操作 */}
      {!finished && (
        <footer className="flex items-center justify-center gap-3">
          {idx > 0 && (
            <button
              onClick={() => goto(idx - 1)}
              className="rounded-full border border-booth-700 px-5 py-3 text-sm text-ink-200 hover:border-signal"
            >
              上一句
            </button>
          )}

          {phase === "scored" ? (
            <>
              <button
                onClick={repeatSentence}
                className="rounded-full border border-signal px-5 py-3 text-sm font-semibold text-signal hover:bg-signal-dim"
              >
                重复读
              </button>
              <button
                onClick={() => goto(idx + 1)}
                className="rounded-full bg-signal px-6 py-3 text-sm font-semibold text-booth-950 hover:bg-signal-strong"
              >
                下一句 →
              </button>
            </>
          ) : (
            <button
              onClick={startListening}
              disabled={!supported || phase === "listening"}
              className="flex items-center gap-2 rounded-full bg-signal px-8 py-3 text-base font-semibold text-booth-950 transition-colors hover:bg-signal-strong disabled:opacity-50"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="9" y="3" width="6" height="12" rx="3" />
                <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              {phase === "listening" ? "听你读…" : "开始跟读"}
            </button>
          )}
        </footer>
      )}

      {!supported && (
        <p className="mt-4 text-center text-xs text-warn">
          当前浏览器不支持语音识别，建议使用 Chrome
        </p>
      )}

      {/* 本地音频：隐藏的 <audio> */}
      {mediaKind === "audio" && (
        <audio
          ref={setMediaRef}
          src={mediaSrc ?? undefined}
          className="hidden"
          onPause={() => setPlaying(false)}
        />
      )}
    </div>
  );
}
