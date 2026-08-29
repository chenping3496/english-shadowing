"use client";

import { useEffect, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import {
  buildBackup,
  restoreBackup,
  migrateLocalLearningData,
  localLearningCount,
  type MigrateResult,
} from "@/lib/backup";
import { db } from "@/lib/db";

const ZERO: MigrateResult = { cards: 0, attempts: 0, recognitions: 0, sessions: 0 };

export default function Backup() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [stats, setStats] = useState<{ materials: number; sentences: number } | null>(null);
  const [localLearn, setLocalLearn] = useState<MigrateResult>(ZERO);
  const [migrating, setMigrating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadStats() {
    const [materials, sentences, learn] = await Promise.all([
      db.materials.count(),
      db.sentences.count(),
      localLearningCount(),
    ]);
    setStats({ materials, sentences });
    setLocalLearn(learn);
  }

  useEffect(() => {
    loadStats();
  }, []);

  async function handleExport() {
    setBusy(true);
    setMsg("");
    setError("");
    try {
      const backup = await buildBackup();
      const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
        d.getDate(),
      ).padStart(2, "0")}`;
      a.href = url;
      a.download = `english-shadowing-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsg(`已导出备份 · ${backup.materials.length} 段素材 · ${backup.sentences.length} 句`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleImportFile(file: File | null) {
    if (!file) return;
    if (!window.confirm("导入会覆盖当前本机的素材与句子，确定继续吗？")) {
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setBusy(true);
    setMsg("");
    setError("");
    try {
      const text = await file.text();
      const r = await restoreBackup(text);
      setMsg(`已恢复备份 · ${r.materials} 段素材 · ${r.sentences} 句`);
      await loadStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const localTotal =
    localLearn.cards + localLearn.attempts + localLearn.recognitions + localLearn.sessions;

  async function handleMigrate() {
    setMigrating(true);
    setMsg("");
    setError("");
    try {
      const r = await migrateLocalLearningData();
      setMsg(
        `已迁移到账号 · ${r.cards} 卡 · ${r.attempts} 次跟读 · ${r.recognitions} 次识别 · ${r.sessions} 天会话`,
      );
      await loadStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "迁移失败，请确认已登录");
    } finally {
      setMigrating(false);
    }
  }

  return (
    <AppShell>
      <header className="px-5 pt-6 pb-3">
        <h1 className="font-display text-xl font-semibold text-ink-50">备份</h1>
        <p className="mt-1 text-sm text-ink-300">
          学习数据已存云端账号；本地仅素材文件与句子需备份
        </p>
      </header>

      <main className="space-y-4 px-5 pt-4">
        {msg && (
          <div className="rounded-xl border border-booth-700 bg-booth-800 px-4 py-3 text-sm text-good">
            {msg}
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-rec/30 bg-rec/10 px-4 py-3 text-sm text-rec">
            {error}
          </div>
        )}

        {/* 迁移本地学习数据 */}
        <section className="space-y-4 rounded-2xl border border-signal/40 bg-booth-900 p-5">
          <div>
            <h2 className="text-sm font-semibold text-ink-50">迁移本机学习数据到账号</h2>
            <p className="mt-1 text-xs text-ink-300">
              旧版把学习记录存在本机浏览器。现在复习卡、跟读记录、拍照识别、每日会话都归账号，换设备也不丢。
            </p>
          </div>
          {localTotal > 0 ? (
            <>
              <p className="font-mono text-xs text-ink-300">
                本机待迁移 · {localLearn.cards} 卡 · {localLearn.attempts} 次跟读 ·{" "}
                {localLearn.recognitions} 次识别 · {localLearn.sessions} 天会话
              </p>
              <button
                onClick={handleMigrate}
                disabled={migrating || busy}
                className="h-11 w-full rounded-full bg-signal font-semibold text-booth-950 transition-colors hover:bg-signal-strong disabled:opacity-50"
              >
                {migrating ? "迁移中…" : "迁移到当前账号"}
              </button>
            </>
          ) : (
            <p className="text-xs text-ink-400">本机没有待迁移的学习数据</p>
          )}
        </section>

        {/* 当前数据概况 */}
        <section className="rounded-2xl border border-booth-700 bg-booth-900 p-5">
          <p className="text-xs text-ink-300">当前本机数据</p>
          <p className="mt-2 font-display text-2xl font-bold text-ink-50">
            {stats ? `${stats.materials} 段素材 · ${stats.sentences} 句` : "…"}
          </p>
          <p className="mt-1 text-xs text-ink-400">
            素材文件与字幕存在本机浏览器，导出备份以防丢失
          </p>
        </section>

        {/* 导出 */}
        <section className="space-y-4 rounded-2xl border border-booth-700 bg-booth-900 p-5">
          <div>
            <h2 className="text-sm font-semibold text-ink-50">导出备份</h2>
            <p className="mt-1 text-xs text-ink-300">
              把本机素材与句子打包成一个 .json 文件下载，存到网盘或电脑里
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={busy}
            className="h-11 w-full rounded-full bg-signal font-semibold text-booth-950 transition-colors hover:bg-signal-strong disabled:opacity-50"
          >
            {busy ? "处理中…" : "导出备份文件"}
          </button>
        </section>

        {/* 导入 */}
        <section className="space-y-4 rounded-2xl border border-booth-700 bg-booth-900 p-5">
          <div>
            <h2 className="text-sm font-semibold text-ink-50">导入备份</h2>
            <p className="mt-1 text-xs text-ink-300">
              换设备后，选择之前导出的 .json 文件恢复本机素材与句子（会覆盖当前本机数据）
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={(e) => handleImportFile(e.target.files?.[0] ?? null)}
            className="w-full rounded-xl border border-booth-700 bg-booth-850 px-4 py-3 text-sm text-ink-300 file:mr-3 file:rounded-lg file:border-0 file:bg-booth-700 file:px-3 file:py-1.5 file:text-ink-100"
          />
        </section>
      </main>
    </AppShell>
  );
}
