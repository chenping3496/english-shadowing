"use client";

import { useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { db } from "@/lib/db";
import { uid } from "@/lib/id";
import { addRecognitionCards } from "@/lib/cards";
import type { VisionObject } from "@/app/api/vision/route";

export default function Snap() {
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [objects, setObjects] = useState<VisionObject[]>([]);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [added, setAdded] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File | null) {
    if (!file) return;
    setSaved(false);
    setObjects([]);
    setError("");
    setAdded(0);
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

  return (
    <AppShell>
      <header className="px-5 pt-6 pb-3">
        <h1 className="font-display text-xl font-semibold text-ink-50">拍照识物</h1>
        <p className="mt-1 text-sm text-ink-300">
          拍下身边事物，获得地道的英文表达
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
              <h2 className="text-xs font-medium text-ink-300">识别结果</h2>
              <button
                onClick={saveToReview}
                className="rounded-full border border-signal px-4 py-1.5 text-xs font-semibold text-signal hover:bg-signal-dim"
              >
                加入复习
              </button>
            </div>
            <ul className="space-y-2">
              {objects.map((o, i) => (
                <li
                  key={i}
                  className="flex items-baseline justify-between rounded-xl border border-booth-700 bg-booth-900 px-4 py-3"
                >
                  <span className="font-display text-base font-semibold text-ink-50">
                    {o.english}
                  </span>
                  <span className="text-sm text-ink-300">{o.chinese}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </AppShell>
  );
}
