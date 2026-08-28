"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { db } from "@/lib/db";
import type { Material } from "@/lib/types";

type MaterialItem = Material & { sentenceCount: number };

export default function Practice() {
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [ms, ss] = await Promise.all([
        db.materials.toArray(),
        db.sentences.toArray(),
      ]);
      const counts = new Map<string, number>();
      for (const s of ss)
        counts.set(s.materialId, (counts.get(s.materialId) ?? 0) + 1);
      setMaterials(
        ms
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((m) => ({ ...m, sentenceCount: counts.get(m.id) ?? 0 })),
      );
      setLoaded(true);
    })();
  }, []);

  return (
    <AppShell>
      <header className="px-5 pt-6 pb-3">
        <h1 className="font-display text-xl font-semibold text-ink-50">跟读</h1>
        <p className="mt-1 text-sm text-ink-300">选择一段素材开始练习</p>
      </header>

      <main className="px-5 pt-2">
        {!loaded ? (
          <div className="py-16 text-center text-sm text-ink-300">加载中…</div>
        ) : materials.length === 0 ? (
          <div className="rounded-2xl border border-booth-700 bg-booth-900 p-8 text-center">
            <p className="text-sm text-ink-200">还没有素材</p>
            <p className="mt-1 text-xs text-ink-400">
              先导入一段英剧美剧片段，再开始跟读
            </p>
            <Link
              href="/library"
              className="mt-5 inline-block rounded-full bg-signal px-6 py-2.5 text-sm font-semibold text-booth-950"
            >
              去导入
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {materials.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/practice/${m.id}`}
                  className="flex items-center justify-between rounded-2xl border border-booth-700 bg-booth-900 p-4 transition-colors hover:border-signal"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-50">
                      {m.title}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-ink-300">
                      {m.sentenceCount} 句
                      {m.type === "local" ? " · 有音频" : " · 无音频"}
                    </p>
                  </div>
                  <span className="text-signal">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AppShell>
  );
}
