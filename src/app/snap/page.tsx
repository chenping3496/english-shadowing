"use client";

import { useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { db } from "@/lib/db";
import { uid } from "@/lib/id";
import { addRecognitionCards, addMissedWordCards } from "@/lib/cards";
import { analyze, extractMissedWords, type Analysis } from "@/lib/score";
import {
  recordingSupported,
  startRecording,
  audioExtFromMime,
} from "@/lib/recorder";
import { speak } from "@/lib/tts";
import type { VisionObject } from "@/app/api/vision/route";

type Phase = "idle" | "preparing" | "recording" | "recognizing" | "scored";

export default function Snap() {
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [objects, setObjects] = useState<VisionObject[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [added, setAdded] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // 跟读状态（优化：识物结果 → 听 → 说 → 错词进 SRS）
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<Analysis | null>(null);
  const [newCards, setNewCards] = useState<string[]>([]);
  const stopRef = useRef<(() => void) | null>(null);

  const supported = recordingSupported();

  function resetShadow() {
    setActiveIdx(null);
    setPhase("idle");
    setResult(null);
    setNewCards([]);
  }

  function handleFile(file: File | null) {
    if (!file) return;
    setSaved(false);
    setObjects([]);
    setError("");
    setAdded(0);
    resetShadow();
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function recognize() {
    if (!image) return;
    setLoading(true);
    setError("");
    setObjects([]);
    setSaved(false);
    setAdded(0);
    resetShadow();
    try {
      const res = await fetch("/api/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "识别失败");
        return;
      }
      setObjects(data.objects ?? []);
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  }

  async function saveToReview() {
    if (!objects.length) return;
    const n = await addRecognitionCards(objects);
    await db.recognitions.add({
      id: uid(),
      objects,
      createdAt: Date.now(),
    });
    setAdded(n);
    setSaved(true);
  }

  const target =
    activeIdx != null
      ? objects[activeIdx]?.phrase || objects[activeIdx]?.english || ""
      : "";

  async function recognizeShadow(blob: Blob) {
    if (activeIdx == null || !target) return;
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
        body: JSON.stringify({ audio: base64, ext: audioExtFromMime(blob.type) }),
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
      const missed = extractMissedWords(a.tokens);
      setResult(a);
      setPhase("scored");
      try {
        const addedWords = await addMissedWordCards(missed, target);
        if (addedWords.length > 0) setNewCards(addedWords);
      } catch {
        // 记录失败不阻断流程
      }
    } catch {
      setError("网络错误，识别失败");
      setPhase("idle");
    }
  }

  function startShadow(idx: number) {
    stopRef.current?.(); // 停掉上一个未结束的录音
    setActiveIdx(idx);
    setResult(null);
    setNewCards([]);
    setError("");
    setPhase("preparing");
    stopRef.current = startRecording(
      {
        onStop: (blob) => void recognizeShadow(blob),
        onError: (m) => {
          setError(m);
          setPhase("idle");
        },
        onReady: () => setPhase("recording"),
      },
      15, // 短语较短，15 秒足够
    );
  }

  const shadowBusy = phase === "preparing" || phase === "recording" || phase === "recognizing";

  return (
    <AppShell>
      <header className="px-5 pt-6 pb-3">
        <h1 className="font-display text-xl font-semibold text-ink-50">拍照识物</h1>
        <p className="mt-1 text-sm text-ink-300">
          拍下身边事物，听一遍、跟读一遍，把它说出口
        </p>
      </header>

      <main className="space-y-4 px-5">
        {/* 拍摄区 */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />

        {!image ? (
          <button
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-booth-600 bg-booth-900 py-14 text-ink-300 transition-colors hover:border-signal"
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.2l1.4-2h5.8l1.4 2h1.2A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z"
                stroke="var(--color-signal)"
                strokeWidth="1.6"
              />
              <circle cx="12" cy="12.5" r="3.2" stroke="var(--color-signal)" strokeWidth="1.6" />
            </svg>
            <span className="mt-3 text-sm text-ink-200">拍照或选择图片</span>
            <span className="mt-1 text-xs text-ink-500">例如：水杯、键盘、冰箱贴…</span>
          </button>
        ) : (
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt="待识别"
              className="w-full rounded-2xl border border-booth-700"
            />
            <div className="flex gap-2">
              <button
                onClick={() => inputRef.current?.click()}
                className="flex-1 rounded-full border border-booth-600 py-2.5 text-sm text-ink-200 hover:border-signal"
              >
                重拍
              </button>
              <button
                onClick={recognize}
                disabled={loading}
                className="flex-1 rounded-full bg-signal py-2.5 text-sm font-semibold text-booth-950 hover:bg-signal-strong disabled:opacity-50"
              >
                {loading ? "识别中…" : "识别"}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rec/30 bg-rec/10 px-4 py-3 text-sm text-rec">
            {error}
          </div>
        )}

        {saved && (
          <div className="rounded-xl border border-booth-700 bg-booth-800 px-4 py-3 text-sm text-good">
            已加入 {added} 张生词卡到复习队列
          </div>
        )}

        {/* 识别结果 */}
        {objects.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-medium text-ink-300">识别结果 · 点 🔊 听，点 🎙 跟读</h2>
              <button
                onClick={saveToReview}
                className="rounded-full border border-signal px-4 py-1.5 text-xs font-semibold text-signal hover:bg-signal-dim"
              >
                加入复习
              </button>
            </div>
            <ul className="space-y-2">
              {objects.map((o, i) => {
                const isActive = activeIdx === i;
                const phrase = o.phrase || o.english;
                return (
                  <li
                    key={i}
                    className="rounded-xl border border-booth-700 bg-booth-900 px-4 py-3"
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-display text-base font-semibold text-ink-50">
                        {o.english}
                      </span>
                      <span className="text-sm text-ink-300">{o.chinese}</span>
                    </div>
                    {o.phrase && (
                      <p className="mt-1 font-mono text-xs text-signal">
                        “{o.phrase}”
                      </p>
                    )}

                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => void speak(phrase)}
                        className="flex-1 rounded-full border border-booth-600 py-1.5 text-xs text-ink-200 hover:border-signal"
                      >
                        🔊 听
                      </button>
                      <button
                        onClick={() => {
                          if (isActive && phase === "recording") {
                            stopRef.current?.();
                          } else {
                            startShadow(i);
                          }
                        }}
                        disabled={
                          !supported ||
                          (shadowBusy && !(isActive && phase === "recording"))
                        }
                        className="flex-1 rounded-full border border-signal py-1.5 text-xs font-semibold text-signal hover:bg-signal-dim disabled:opacity-40"
                      >
                        {isActive && phase === "recording" ? "■ 结束" : "🎙 跟读"}
                      </button>
                    </div>

                    {/* 跟读状态 / 评分 */}
                    {isActive && shadowBusy && (
                      <p className="mt-2 text-xs text-ink-300">
                        {phase === "preparing"
                          ? "准备中…"
                          : phase === "recording"
                            ? "正在录音…请跟读"
                            : "识别中…"}
                      </p>
                    )}
                    {isActive && phase === "scored" && result && (
                      <div className="mt-2 space-y-1 border-t border-booth-700 pt-2 text-xs">
                        <p>
                          得分{" "}
                          <span
                            className={`font-display text-sm font-bold ${
                              result.score >= 85
                                ? "text-good"
                                : result.score >= 60
                                  ? "text-warn"
                                  : "text-rec"
                            }`}
                          >
                            {result.score}
                          </span>
                          {result.transcript && (
                            <span className="text-ink-400"> · 你读的：{result.transcript}</span>
                          )}
                        </p>
                        {newCards.length > 0 && (
                          <p className="text-warn">
                            已把 {newCards.length} 个读错的词加入复习卡：{newCards.join("、")}
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {!supported && objects.length > 0 && (
          <p className="text-xs text-warn">
            当前浏览器不支持录音，只能听发音，无法跟读打分
          </p>
        )}
      </main>
    </AppShell>
  );
}
