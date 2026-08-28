"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { db } from "@/lib/db";
import { parseSrt } from "@/lib/srt";
import { segmentCues } from "@/lib/segment";
import { createMaterialFromCues } from "@/lib/import";
import { readAudioDuration } from "@/lib/import";
import { deleteMaterials } from "@/lib/materials";
import type { Material } from "@/lib/types";
import type { TranscriptCue } from "@/app/api/transcript/route";

type Tab = "local" | "youtube" | "bilibili";
type MaterialItem = Material & { sentenceCount: number };
type FetchResult = { title: string; cues: TranscriptCue[]; lang?: string };
type BiliPage = { cid: number; page: number; part: string };

export default function Library() {
  const [tab, setTab] = useState<Tab>("local");
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // 本地
  const [title, setTitle] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [srtText, setSrtText] = useState("");
  const srtInputRef = useRef<HTMLInputElement>(null);

  // YouTube
  const [ytUrl, setYtUrl] = useState("");
  const [ytLoading, setYtLoading] = useState(false);
  const [ytResult, setYtResult] = useState<FetchResult | null>(null);
  const [ytError, setYtError] = useState("");

  // Bilibili
  const [biliUrl, setBiliUrl] = useState("");
  const [biliLoading, setBiliLoading] = useState(false);
  const [biliResult, setBiliResult] = useState<FetchResult | null>(null);
  const [biliError, setBiliError] = useState("");
  const [biliNoSubtitle, setBiliNoSubtitle] = useState(false);
  const [biliPages, setBiliPages] = useState<BiliPage[]>([]);
  const [biliSelectedPage, setBiliSelectedPage] = useState<number | null>(null);
  const [biliTranscribing, setBiliTranscribing] = useState(false);

  // 素材管理（多选删除）
  const [managing, setManaging] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function reload() {
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
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleSrtFile(file: File | null) {
    if (!file) return;
    setSrtText(await file.text());
  }

  async function handleLocalImport() {
    if (!audioFile) return setMsg("请先选择音频/视频文件");
    const cues = parseSrt(srtText);
    if (!cues.length) return setMsg("请选择 .srt 字幕文件或粘贴字幕文本");
    setBusy(true);
    setMsg("");
    try {
      const durationSec = await readAudioDuration(audioFile);
      const r = await createMaterialFromCues({
        title: title || audioFile.name.replace(/\.[^.]+$/, ""),
        type: "local",
        audioBlob: audioFile,
        durationSec,
        cues,
      });
      setMsg(`已导入「${title || audioFile.name}」· ${r.sentenceCount} 句`);
      setTitle("");
      setAudioFile(null);
      setSrtText("");
      if (srtInputRef.current) srtInputRef.current.value = "";
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function handleYtFetch() {
    if (!ytUrl.trim()) return;
    setYtLoading(true);
    setYtError("");
    setYtResult(null);
    try {
      const res = await fetch("/api/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: ytUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setYtError(data.error ?? "获取失败");
        return;
      }
      setYtResult({ title: data.title ?? "YouTube 素材", cues: data.cues });
    } catch {
      setYtError("网络错误，请重试");
    } finally {
      setYtLoading(false);
    }
  }

  async function handleYtImport() {
    if (!ytResult?.cues.length) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await createMaterialFromCues({
        title: ytResult.title,
        type: "youtube",
        sourceUrl: ytUrl.trim(),
        cues: ytResult.cues,
      });
      setMsg(`已导入「${ytResult.title}」· ${r.sentenceCount} 句`);
      setYtUrl("");
      setYtResult(null);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function handleBiliFetch() {
    if (!biliUrl.trim()) return;
    setBiliLoading(true);
    setBiliError("");
    setBiliResult(null);
    setBiliNoSubtitle(false);
    setBiliPages([]);
    setBiliSelectedPage(null);
    try {
      const res = await fetch("/api/bilibili", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: biliUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBiliError(data.error ?? "获取失败");
        return;
      }
      if (data.subtitleAvailable === false) {
        // 无独立字幕轨（烧录字幕）→ 进入选分 P + 转写流程
        setBiliNoSubtitle(true);
        setBiliPages(data.pages ?? []);
        setBiliSelectedPage(data.pages?.[0]?.page ?? null);
        return;
      }
      setBiliResult({
        title: data.title ?? "Bilibili 素材",
        cues: data.cues,
        lang: data.lang,
      });
    } catch {
      setBiliError("网络错误，请重试");
    } finally {
      setBiliLoading(false);
    }
  }

  async function handleBiliTranscribe() {
    if (biliSelectedPage == null) return;
    const page = biliPages.find((p) => p.page === biliSelectedPage);
    if (!page) return;
    setBiliTranscribing(true);
    setBiliError("");
    try {
      const res = await fetch("/api/bilibili/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: biliUrl.trim(),
          cid: page.cid,
          part: page.part,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBiliError(data.error ?? "转写失败");
        return;
      }
      const cues = data.cues as TranscriptCue[];
      const title = data.title ?? page.part;
      const r = await createMaterialFromCues({
        title,
        type: "bilibili",
        sourceUrl: biliUrl.trim(),
        cues,
      });
      setMsg(`已转写导入「${title}」· ${r.sentenceCount} 句`);
      setBiliUrl("");
      setBiliNoSubtitle(false);
      setBiliPages([]);
      setBiliSelectedPage(null);
      await reload();
    } catch {
      setBiliError("网络错误，转写失败");
    } finally {
      setBiliTranscribing(false);
    }
  }

  async function handleBiliImport() {
    if (!biliResult?.cues.length) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await createMaterialFromCues({
        title: biliResult.title,
        type: "bilibili",
        sourceUrl: biliUrl.trim(),
        cues: biliResult.cues,
      });
      setMsg(`已导入「${biliResult.title}」· ${r.sentenceCount} 句`);
      setBiliUrl("");
      setBiliResult(null);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleManage() {
    setManaging((m) => !m);
    setSelected(new Set());
  }

  async function confirmDelete(ids: string[]) {
    if (!ids.length) return;
    if (
      !window.confirm(
        `确定删除 ${ids.length} 个素材？其句子、复习卡与练习记录将一并删除，不可恢复。`,
      )
    )
      return;
    setBusy(true);
    setMsg("");
    try {
      await deleteMaterials(ids);
      setMsg(`已删除 ${ids.length} 个素材`);
      setSelected(new Set());
      if (ids.length === 1) setManaging(false);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  const ytSentenceCount = ytResult ? segmentCues(ytResult.cues).length : 0;
  const biliSentenceCount = biliResult ? segmentCues(biliResult.cues).length : 0;

  return (
    <AppShell>
      <header className="px-5 pt-6 pb-3">
        <h1 className="font-display text-xl font-semibold text-ink-50">素材库</h1>
        <p className="mt-1 text-sm text-ink-300">导入英剧美剧片段，开始跟读</p>
      </header>

      {/* Tab 切换 */}
      <div className="mx-5 flex rounded-full border border-booth-700 bg-booth-900 p-1">
        {(
          [
            ["local", "本地导入"],
            ["youtube", "YouTube 链接"],
            ["bilibili", "Bilibili 链接"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 rounded-full py-2 text-sm transition-colors ${
              tab === key
                ? "bg-signal font-semibold text-booth-950"
                : "text-ink-300 hover:text-ink-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <main className="space-y-4 px-5 pt-4">
        {msg && (
          <div className="rounded-xl border border-booth-700 bg-booth-800 px-4 py-3 text-sm text-good">
            {msg}
          </div>
        )}

        {tab === "local" ? (
          <section className="space-y-4 rounded-2xl border border-booth-700 bg-booth-900 p-5">
            <div>
              <label className="mb-1.5 block text-xs text-ink-300">标题</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：老友记 S01E01"
                className="w-full rounded-xl border border-booth-700 bg-booth-850 px-4 py-3 text-sm text-ink-50 placeholder:text-ink-500 focus:border-signal"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-ink-300">
                音频/视频文件
              </label>
              <input
                type="file"
                accept="audio/*,video/*"
                onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
                className="w-full rounded-xl border border-booth-700 bg-booth-850 px-4 py-3 text-sm text-ink-300 file:mr-3 file:rounded-lg file:border-0 file:bg-booth-700 file:px-3 file:py-1.5 file:text-ink-100"
              />
              {audioFile && (
                <p className="mt-1 text-xs text-ink-300">
                  已选：{audioFile.name}
                </p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs text-ink-300">
                字幕（.srt 文件或直接粘贴）
              </label>
              <input
                ref={srtInputRef}
                type="file"
                accept=".srt,text/plain"
                onChange={(e) => handleSrtFile(e.target.files?.[0] ?? null)}
                className="w-full rounded-xl border border-booth-700 bg-booth-850 px-4 py-3 text-sm text-ink-300 file:mr-3 file:rounded-lg file:border-0 file:bg-booth-700 file:px-3 file:py-1.5 file:text-ink-100"
              />
              <textarea
                value={srtText}
                onChange={(e) => setSrtText(e.target.value)}
                placeholder={"或粘贴 SRT 字幕…\n\n1\n00:00:00,000 --> 00:00:03,000\nHello there."}
                rows={5}
                className="mt-2 w-full rounded-xl border border-booth-700 bg-booth-850 px-4 py-3 font-mono text-xs text-ink-100 placeholder:text-ink-500 focus:border-signal"
              />
            </div>

            <button
              onClick={handleLocalImport}
              disabled={busy}
              className="h-11 w-full rounded-full bg-signal font-semibold text-booth-950 transition-colors hover:bg-signal-strong disabled:opacity-50"
            >
              {busy ? "导入中…" : "导入并切分"}
            </button>
          </section>
        ) : tab === "youtube" ? (
          <section className="space-y-4 rounded-2xl border border-booth-700 bg-booth-900 p-5">
            <div>
              <label className="mb-1.5 block text-xs text-ink-300">
                YouTube 视频链接
              </label>
              <input
                value={ytUrl}
                onChange={(e) => setYtUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
                className="w-full rounded-xl border border-booth-700 bg-booth-850 px-4 py-3 text-sm text-ink-50 placeholder:text-ink-500 focus:border-signal"
              />
            </div>

            <button
              onClick={handleYtFetch}
              disabled={ytLoading || !ytUrl.trim()}
              className="h-11 w-full rounded-full border border-signal font-semibold text-signal transition-colors hover:bg-signal-dim disabled:opacity-50"
            >
              {ytLoading ? "获取字幕中…" : "获取字幕"}
            </button>

            {ytError && (
              <p className="rounded-xl border border-rec/30 bg-rec/10 px-4 py-3 text-sm text-rec">
                {ytError}
              </p>
            )}

            {ytResult && (
              <div className="space-y-3">
                <div className="rounded-xl border border-booth-700 bg-booth-850 p-4">
                  <p className="text-sm font-semibold text-ink-50">
                    {ytResult.title}
                  </p>
                  <p className="mt-1 font-mono text-xs text-ink-300">
                    共 {ytResult.cues.length} 条字幕 · 约 {ytSentenceCount} 句
                  </p>
                </div>
                <button
                  onClick={handleYtImport}
                  disabled={busy}
                  className="h-11 w-full rounded-full bg-signal font-semibold text-booth-950 transition-colors hover:bg-signal-strong disabled:opacity-50"
                >
                  {busy ? "导入中…" : "导入到素材库"}
                </button>
              </div>
            )}
          </section>
        ) : (
          <section className="space-y-4 rounded-2xl border border-booth-700 bg-booth-900 p-5">
            <div>
              <label className="mb-1.5 block text-xs text-ink-300">
                Bilibili 视频链接
              </label>
              <input
                value={biliUrl}
                onChange={(e) => setBiliUrl(e.target.value)}
                placeholder="https://www.bilibili.com/video/BV… 或 BV 号"
                className="w-full rounded-xl border border-booth-700 bg-booth-850 px-4 py-3 text-sm text-ink-50 placeholder:text-ink-500 focus:border-signal"
              />
            </div>

            <button
              onClick={handleBiliFetch}
              disabled={biliLoading || !biliUrl.trim()}
              className="h-11 w-full rounded-full border border-signal font-semibold text-signal transition-colors hover:bg-signal-dim disabled:opacity-50"
            >
              {biliLoading ? "获取字幕中…" : "获取字幕"}
            </button>

            {biliError && (
              <p className="rounded-xl border border-rec/30 bg-rec/10 px-4 py-3 text-sm text-rec">
                {biliError}
              </p>
            )}

            {biliResult && (
              <div className="space-y-3">
                <div className="rounded-xl border border-booth-700 bg-booth-850 p-4">
                  <p className="text-sm font-semibold text-ink-50">
                    {biliResult.title}
                  </p>
                  <p className="mt-1 font-mono text-xs text-ink-300">
                    {biliResult.lang ? `语种：${biliResult.lang} · ` : ""}
                    共 {biliResult.cues.length} 条字幕 · 约 {biliSentenceCount} 句
                  </p>
                </div>
                <button
                  onClick={handleBiliImport}
                  disabled={busy}
                  className="h-11 w-full rounded-full bg-signal font-semibold text-booth-950 transition-colors hover:bg-signal-strong disabled:opacity-50"
                >
                  {busy ? "导入中…" : "导入到素材库"}
                </button>
              </div>
            )}

            {biliNoSubtitle && (
              <div className="space-y-3">
                <p className="text-sm text-ink-300">
                  该视频没有独立字幕（字幕烧录在画面里），需要语音转写。请选择要学习的一集：
                </p>
                {biliPages.length > 0 && (
                  <select
                    value={biliSelectedPage ?? ""}
                    onChange={(e) => setBiliSelectedPage(Number(e.target.value))}
                    className="w-full rounded-xl border border-booth-700 bg-booth-850 px-4 py-3 text-sm text-ink-50 focus:border-signal"
                  >
                    {biliPages.map((p) => (
                      <option key={p.cid} value={p.page}>
                        {p.part}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  onClick={handleBiliTranscribe}
                  disabled={biliTranscribing || biliSelectedPage == null}
                  className="h-11 w-full rounded-full bg-signal font-semibold text-booth-950 transition-colors hover:bg-signal-strong disabled:opacity-50"
                >
                  {biliTranscribing ? "转写中…（约 30 秒）" : "转写并导入"}
                </button>
              </div>
            )}
          </section>
        )}

        {/* 已有素材 */}
        {materials.length > 0 && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-medium text-ink-300">已有素材</h2>
              <button
                onClick={toggleManage}
                className="text-xs font-medium text-signal hover:text-signal-strong"
              >
                {managing ? "完成" : "管理"}
              </button>
            </div>
            <ul className="space-y-2">
              {materials.map((m) => {
                const typeLabel =
                  m.type === "youtube"
                    ? "YouTube"
                    : m.type === "bilibili"
                      ? "Bilibili"
                      : "本地";
                const isSel = selected.has(m.id);
                return (
                  <li key={m.id} className="flex items-center gap-2">
                    {managing ? (
                      <button
                        onClick={() => toggleSelect(m.id)}
                        className={`flex min-w-0 flex-1 items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${
                          isSel
                            ? "border-signal bg-signal-dim"
                            : "border-booth-700 bg-booth-900"
                        }`}
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                            isSel ? "border-signal bg-signal" : "border-booth-600"
                          }`}
                        >
                          {isSel && (
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                            >
                              <path
                                d="M5 13l4 4L19 7"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink-50">
                            {m.title}
                          </p>
                          <p className="mt-0.5 font-mono text-[11px] text-ink-300">
                            {typeLabel} · {m.sentenceCount} 句
                          </p>
                        </div>
                      </button>
                    ) : (
                      <>
                        <Link
                          href={`/practice/${m.id}`}
                          className="flex min-w-0 flex-1 items-center justify-between rounded-2xl border border-booth-700 bg-booth-900 p-4 transition-colors hover:border-signal"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink-50">
                              {m.title}
                            </p>
                            <p className="mt-0.5 font-mono text-[11px] text-ink-300">
                              {typeLabel} · {m.sentenceCount} 句
                            </p>
                          </div>
                          <span className="text-signal">→</span>
                        </Link>
                        <button
                          onClick={() => confirmDelete([m.id])}
                          aria-label="删除素材"
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-booth-700 text-ink-400 transition-colors hover:border-rec hover:text-rec"
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path
                              d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>

            {managing && (
              <button
                onClick={() => confirmDelete([...selected])}
                disabled={selected.size === 0}
                className="mt-3 h-11 w-full rounded-full bg-rec font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-40"
              >
                删除选中{selected.size > 0 ? `（${selected.size}）` : ""}
              </button>
            )}
          </section>
        )}
      </main>
    </AppShell>
  );
}
