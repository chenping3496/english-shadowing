"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { uid } from "@/lib/id";
import { putLearn } from "@/lib/server-api";
import { ensureSentenceCard, addMissedWordCards } from "@/lib/cards";
import { bumpSession } from "@/lib/stats";
import {
  analyze,
  analyzeFluency,
  extractMissedWords,
  type Analysis,
  type Fluency,
} from "@/lib/score";
import { recordingSupported, startRecording, audioExtFromMime } from "@/lib/recorder";
import { useMaterialMedia } from "./useMaterialMedia";
import type { Material, Sentence } from "@/lib/types";

type Phase = "idle" | "preparing" | "recording" | "recognizing" | "scored";

export default function PracticeClient({ materialId }: { materialId: string }) {
  const [material, setMaterial] = useState<Material | null>(null);
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<Analysis | null>(null);
  const [fluency, setFluency] = useState<Fluency | null>(null);
  const [newCards, setNewCards] = useState<string[]>([]);
  const [myAudioUrl, setMyAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [doneScores, setDoneScores] = useState<number[]>([]);
  // 准备阶段（优化3）：先进「先听 + 看文本 + 确认理解」，ready 后才是跟读录音
  const [ready, setReady] = useState(false);

  const stopRef = useRef<(() => void) | null>(null);
  const myAudioUrlRef = useRef<string | null>(null);
  const myAudioRef = useRef<HTMLAudioElement | null>(null);

  const supported = recordingSupported();

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

  useEffect(() => {
    return () => {
      stopRef.current?.();
      // 离开页面时确保「我的跟读」回放停止（媒体由 useMaterialMedia 自行清理）
      try {
        myAudioRef.current?.pause();
      } catch {
        // 忽略
      }
    };
  }, []);

  const sentence = sentences[idx];

  // 暂停所有播放（原句 + 我的跟读），切句 / 重播 / 离开前调用
  const stopPlayback = useCallback(() => {
    stopMedia();
    try {
      myAudioRef.current?.pause();
    } catch {
      // 忽略
    }
  }, [stopMedia]);

  const playSentence = () => {
    // 停掉「我的跟读」回放，避免两段声音重叠
    try {
      myAudioRef.current?.pause();
    } catch {
      // 忽略
    }
    const s = sentences[idx];
    if (!s) return;
    playSegment(s.startSec, s.endSec);
  };

  // 进入 / 切换句子时自动播放该句
  useEffect(() => {
    if (loaded && mediaKind) playSentence();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, mediaKind, mediaSrc, idx]);

  // 录音结束 → 上传阿里 ASR 识别 → 评分 → 记录
  const recognizeAndScore = useCallback(
    async (blob: Blob) => {
      if (!sentence) return;
      setPhase("recognizing");
      // 保存录音供「我的跟读」回放
      if (myAudioUrlRef.current) URL.revokeObjectURL(myAudioUrlRef.current);
      const url = URL.createObjectURL(blob);
      myAudioUrlRef.current = url;
      setMyAudioUrl(url);
      setError("");
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () =>
            resolve((fr.result as string).split(",")[1] ?? "");
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
        const analysis = analyze(sentence.text, transcript);
        const flu = analyzeFluency(data.words ?? []);
        const missed = extractMissedWords(analysis.tokens);
        setResult(analysis);
        setFluency(flu);
        setPhase("scored");
        setDoneScores((prev) => [...prev, analysis.score]);
        try {
          await putLearn("attempts", {
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
          // 优化4：读错/漏读的实义词 → 自动生成发音卡进 SRS
          if (missed.length > 0) {
            const added = await addMissedWordCards(missed, sentence.text);
            if (added.length > 0) setNewCards(added);
          }
        } catch {
          // 记录失败不阻断流程
        }
      } catch {
        setError("网络错误，识别失败");
        setPhase("idle");
      }
    },
    [sentence],
  );

  const startListening = useCallback(() => {
    if (!supported) return;
    setError("");
    setResult(null);
    setFluency(null);
    setNewCards([]);
    setPhase("preparing");
    stopRef.current = startRecording(
      {
        onStop: (blob) => void recognizeAndScore(blob),
        onError: (m) => {
          setError(m);
          setPhase("idle");
        },
        onReady: () => setPhase("recording"),
      },
      30,
    );
  }, [supported, recognizeAndScore]);

  const stopListening = useCallback(() => {
    stopRef.current?.();
  }, []);

  const goto = useCallback(
    (next: number) => {
      stopPlayback();
      setIdx(Math.max(0, Math.min(sentences.length - 1, next)));
      setReady(false); // 切句回到准备阶段，先听再看再跟读
      setPhase("idle");
      setResult(null);
      setFluency(null);
      setNewCards([]);
      setError("");
    },
    [sentences.length, stopPlayback],
  );

  const repeatSentence = () => {
    playSentence();
    setPhase("idle");
    setResult(null);
    setFluency(null);
    setNewCards([]);
    setError("");
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
                onPause={onPause}
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
              {phase === "preparing" ? (
                <div className="flex h-14 items-center justify-center">
                  <p className="text-sm text-ink-300">准备中…</p>
                </div>
              ) : phase === "recording" ? (
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
              ) : phase === "recognizing" ? (
                <div className="flex h-14 items-center justify-center">
                  <p className="text-sm text-ink-300">识别中…</p>
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
              ) : !ready ? (
                <p className="max-w-xs text-sm text-ink-300">
                  先听原句，看懂意思，再点下方「开始跟读」
                </p>
              ) : (
                <div className="h-14" />
              )}
            </div>

            {/* 录音提示 */}
            {phase === "preparing" && (
              <p className="mx-auto mt-4 min-h-6 max-w-sm text-sm text-ink-200">
                正在启动麦克风…
              </p>
            )}
            {phase === "recording" && (
              <p className="mx-auto mt-4 min-h-6 max-w-sm text-sm text-ink-200">
                正在录音…请跟读
              </p>
            )}

            {error && phase !== "recording" && (
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
                {fluency && (
                  <p className="mt-2 border-t border-booth-700 pt-2 text-xs text-ink-300">
                    流利度：{fluency.wpm} 词/分
                    {fluency.pauses > 0 && ` · ${fluency.pauses} 处明显停顿`}
                  </p>
                )}
                {newCards.length > 0 && (
                  <p className="mt-2 text-xs text-warn">
                    已把 {newCards.length} 个读错的词加入复习卡：{newCards.join("、")}
                  </p>
                )}
                <div className="mt-3 flex gap-2 border-t border-booth-700 pt-3">
                  <button
                    onClick={playSentence}
                    className="flex-1 rounded-full border border-booth-600 py-2 text-xs text-ink-200 hover:border-signal"
                  >
                    🔊 原句
                  </button>
                  <button
                    onClick={() => {
                      stopPlayback();
                      const el = myAudioRef.current;
                      if (el) {
                        el.currentTime = 0;
                        void el.play();
                      }
                    }}
                    disabled={!myAudioUrl}
                    className="flex-1 rounded-full border border-signal py-2 text-xs font-semibold text-signal hover:bg-signal-dim disabled:opacity-40"
                  >
                    🎙 我的跟读
                  </button>
                </div>
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

          {!ready ? (
            <>
              <button
                onClick={() => goto(idx + 1)}
                className="rounded-full border border-booth-700 px-5 py-3 text-sm text-ink-300 hover:border-rec hover:text-rec"
                title="这句文本识别有误？跳过不练"
              >
                跳过
              </button>
              <button
                onClick={() => setReady(true)}
                className="rounded-full bg-signal px-8 py-3 text-base font-semibold text-booth-950 hover:bg-signal-strong"
              >
                ✓ 我理解了，开始跟读
              </button>
            </>
          ) : phase === "scored" ? (
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
          ) : phase === "preparing" ? (
            <button
              disabled
              className="flex items-center gap-2 rounded-full bg-signal px-8 py-3 text-base font-semibold text-booth-950 transition-colors disabled:opacity-50"
            >
              准备中…
            </button>
          ) : phase === "recording" ? (
            <button
              onClick={stopListening}
              className="flex items-center gap-2 rounded-full border border-signal px-8 py-3 text-base font-semibold text-signal transition-colors hover:bg-signal-dim"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              结束录音
            </button>
          ) : phase === "recognizing" ? (
            <button
              disabled
              className="flex items-center gap-2 rounded-full bg-signal px-8 py-3 text-base font-semibold text-booth-950 transition-colors disabled:opacity-50"
            >
              识别中…
            </button>
          ) : (
            <button
              onClick={startListening}
              disabled={!supported}
              className="flex items-center gap-2 rounded-full bg-signal px-8 py-3 text-base font-semibold text-booth-950 transition-colors hover:bg-signal-strong disabled:opacity-50"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="9" y="3" width="6" height="12" rx="3" />
                <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              开始跟读
            </button>
          )}
        </footer>
      )}

      {!supported && (
        <p className="mt-4 text-center text-xs text-warn">
          当前浏览器不支持录音，请使用 Chrome 或 Safari
        </p>
      )}

      {/* 本地音频：隐藏的 <audio> */}
      {mediaKind === "audio" && (
        <audio
          ref={setMediaRef}
          src={mediaSrc ?? undefined}
          className="hidden"
          onPause={onPause}
        />
      )}

      {/* 我的跟读录音回放 */}
      <audio ref={myAudioRef} src={myAudioUrl ?? undefined} className="hidden" />
    </div>
  );
}
