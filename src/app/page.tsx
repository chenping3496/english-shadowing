"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { loadDashboard } from "@/lib/stats";

export default function Home() {
  const [data, setData] = useState<Awaited<
    ReturnType<typeof loadDashboard>
  > | null>(null);

  useEffect(() => {
    loadDashboard().then(setData);
  }, []);

  const d = data ?? {
    streak: 0,
    last7: [],
    dueCards: 0,
    materialCount: 0,
    sentenceCount: 0,
    todayDone: 0,
  };

  return (
    <AppShell>
      <header className="flex items-center justify-between px-5 pt-6 pb-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-signal">
            Shadowing Booth
          </p>
          <h1 className="mt-1 font-display text-xl font-semibold text-ink-50">
            跟读训练
          </h1>
        </div>
        <div className="rounded-full border border-booth-700 px-3 py-1 font-mono text-[11px] text-ink-300">
          DAY {String(d.streak).padStart(2, "0")}
        </div>
      </header>

      <main className="space-y-4 px-5">
        {/* 连续天数 */}
        <section className="rounded-2xl border border-booth-700 bg-booth-900 p-5">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-ink-300">连续学习</p>
              <p className="mt-1 font-display text-4xl font-bold leading-none text-ink-50">
                {d.streak}
                <span className="ml-1 font-sans text-base font-medium text-ink-300">
                  天
                </span>
              </p>
            </div>
            <div className="flex gap-1.5">
              {d.last7.map((day) => (
                <span
                  key={day.date}
                  className={`h-7 w-2.5 rounded-full ${
                    day.done ? "wave-bar" : "bg-booth-700"
                  }`}
                />
              ))}
            </div>
          </div>
        </section>

        {/* 今日任务 */}
        <section>
          <h2 className="mb-2 text-xs font-medium text-ink-300">今日任务</h2>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="待复习" value={d.dueCards} unit="卡" accent href="/review" />
            <StatTile label="今日已跟读" value={d.todayDone} unit="句" />
          </div>
        </section>

        {/* 空状态 / 主操作 */}
        <section className="rounded-2xl border border-booth-700 bg-booth-900 p-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-booth-800">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M8 3v4M16 3v4M4 10h16"
                stroke="var(--color-signal)"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
              <rect
                x="4"
                y="5"
                width="16"
                height="15"
                rx="2.5"
                stroke="var(--color-signal)"
                strokeWidth="1.6"
              />
            </svg>
          </div>
          <h3 className="mt-3 font-display text-base font-semibold text-ink-50">
            {d.materialCount === 0 ? "还没有素材" : "开始今天的跟读"}
          </h3>
          <p className="mt-1 text-sm text-ink-300">
            {d.materialCount === 0
              ? "导入一段英剧美剧片段，开始第一次跟读"
              : `已有 ${d.materialCount} 段素材 · ${d.sentenceCount} 句可练`}
          </p>
          <Link
            href="/library"
            className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-signal px-6 text-sm font-semibold text-booth-950 transition-colors hover:bg-signal-strong"
          >
            {d.materialCount === 0 ? "导入素材" : "去跟读"}
          </Link>
        </section>
      </main>
    </AppShell>
  );
}

function StatTile({
  label,
  value,
  unit,
  accent,
  href,
}: {
  label: string;
  value: number;
  unit: string;
  accent?: boolean;
  href?: string;
}) {
  const inner = (
    <>
      <p className="text-xs text-ink-300">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold leading-none">
        <span className={accent ? "text-signal" : "text-ink-50"}>{value}</span>
        <span className="ml-1 font-sans text-sm font-medium text-ink-300">
          {unit}
        </span>
      </p>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-2xl border border-booth-700 bg-booth-900 p-4 transition-colors hover:border-signal"
      >
        {inner}
      </Link>
    );
  }
  return <div className="rounded-2xl border border-booth-700 bg-booth-900 p-4">{inner}</div>;
}
