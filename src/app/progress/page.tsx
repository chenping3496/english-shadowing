"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { loadProgress } from "@/lib/stats";

type Progress = Awaited<ReturnType<typeof loadProgress>>;

function scoreColor(s: number): string {
  if (s >= 85) return "var(--color-good)";
  if (s >= 60) return "var(--color-warn)";
  return "var(--color-rec)";
}

export default function Progress() {
  const [data, setData] = useState<Progress | null>(null);

  useEffect(() => {
    loadProgress().then(setData);
  }, []);

  if (!data) {
    return (
      <AppShell>
        <div className="px-5 pt-20 text-center text-sm text-ink-300">加载中…</div>
      </AppShell>
    );
  }

  const maxCount = Math.max(1, ...data.daily.map((d) => d.count));

  return (
    <AppShell>
      <header className="px-5 pt-6 pb-3">
        <h1 className="font-display text-xl font-semibold text-ink-50">进度</h1>
        <p className="mt-1 text-sm text-ink-300">坚持，正在积累开口的底气</p>
      </header>

      <main className="space-y-5 px-5">
        {/* 概览 */}
        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-booth-700 bg-booth-900 p-4">
            <p className="text-xs text-ink-300">连续天数</p>
            <p className="mt-1 font-display text-3xl font-bold text-signal">
              {data.streak}
              <span className="ml-1 font-sans text-sm font-medium text-ink-300">天</span>
            </p>
          </div>
          <div className="rounded-2xl border border-booth-700 bg-booth-900 p-4">
            <p className="text-xs text-ink-300">累计跟读</p>
            <p className="mt-1 font-display text-3xl font-bold text-ink-50">
              {data.totalAttempts}
              <span className="ml-1 font-sans text-sm font-medium text-ink-300">次</span>
            </p>
          </div>
          <div className="rounded-2xl border border-booth-700 bg-booth-900 p-4">
            <p className="text-xs text-ink-300">素材库</p>
            <p className="mt-1 font-display text-3xl font-bold text-ink-50">
              {data.materialCount}
              <span className="ml-1 font-sans text-sm font-medium text-ink-300">段</span>
            </p>
          </div>
          <div className="rounded-2xl border border-booth-700 bg-booth-900 p-4">
            <p className="text-xs text-ink-300">待复习</p>
            <p className="mt-1 font-display text-3xl font-bold text-ink-50">
              {data.dueCards}
              <span className="ml-1 font-sans text-sm font-medium text-ink-300">卡</span>
            </p>
          </div>
        </section>

        {/* 评分趋势 */}
        <section className="rounded-2xl border border-booth-700 bg-booth-900 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-50">评分趋势</h2>
            <span className="text-xs text-ink-400">近 14 天</span>
          </div>

          <div className="flex h-32 items-end gap-1.5">
            {data.daily.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                {d.count > 0 ? (
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: `${Math.max(8, (d.avgScore / 100) * 100)}px`,
                      background: scoreColor(d.avgScore),
                      opacity: 0.9,
                    }}
                    title={`${d.date.slice(5)} · ${d.avgScore} 分 · ${d.count} 次`}
                  />
                ) : (
                  <div className="w-full" style={{ height: "4px", background: "var(--color-booth-700)" }} />
                )}
                <span className="font-mono text-[9px] text-ink-500">
                  {d.date.slice(8)}日
                </span>
              </div>
            ))}
          </div>

          {data.totalAttempts === 0 && (
            <p className="mt-4 text-center text-xs text-ink-400">
              还没有跟读记录，去练第一句吧
            </p>
          )}
        </section>
      </main>
    </AppShell>
  );
}
