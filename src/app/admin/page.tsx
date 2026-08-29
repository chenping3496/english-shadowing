"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import type { SharedMaterialMeta } from "@/lib/shared-client";

type Tab = "materials" | "invites" | "users";

interface InviteRow {
  code: string;
  createdBy: string | null;
  usedBy: string | null;
  usedByEmail: string | null;
  usedAt: number | null;
  createdAt: number;
}

interface AdminUser {
  id: string;
  email: string;
  role: string;
  createdAt: number;
  cards: number;
  attempts: number;
  recognitions: number;
  sessions: number;
}

function fmtDate(ts: number | null): string {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("zh-CN");
}

// 管理后台：素材上传 + 邀请码管理 + 用户列表。

export default function Admin() {
  const { user, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("materials");

  // —— 素材 ——
  const [materials, setMaterials] = useState<SharedMaterialMeta[]>([]);
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [srtText, setSrtText] = useState("");
  const srtInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  // —— 邀请码 ——
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [genCount, setGenCount] = useState(5);
  const [genResult, setGenResult] = useState<string[]>([]);
  const [invMsg, setInvMsg] = useState("");
  const [invErr, setInvErr] = useState("");

  // —— 用户 ——
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  async function reloadMaterials() {
    try {
      const res = await fetch("/api/admin/materials");
      const data = await res.json();
      if (res.ok) setMaterials(data.materials ?? []);
    } catch {
      // 忽略
    }
  }

  async function loadInvites() {
    try {
      const res = await fetch("/api/admin/invites");
      const data = await res.json();
      if (res.ok) setInvites(data.invites ?? []);
    } catch {
      // 忽略
    }
  }

  async function loadUsers() {
    setUsersLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (res.ok) setUsers(data.users ?? []);
    } catch {
      // 忽略
    } finally {
      setUsersLoading(false);
    }
  }

  useEffect(() => {
    if (user?.role !== "admin") return;
    if (tab === "materials") reloadMaterials();
    else if (tab === "invites") loadInvites();
    else if (tab === "users") loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user]);

  async function handleSrtFile(f: File | null) {
    if (f) setSrtText(await f.text());
  }

  async function handleUpload() {
    if (!videoFile) return setError("请选择视频文件");
    if (!title.trim()) return setError("请填写标题");
    if (!srtText.trim()) return setError("请提供 SRT 字幕");
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const form = new FormData();
      form.append("video", videoFile);
      form.append("title", title);
      form.append("source", source);
      form.append("srt", srtText);
      const res = await fetch("/api/admin/materials", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "上传失败");
        return;
      }
      setMsg(`已上传，切分 ${data.sentenceCount} 句`);
      setTitle("");
      setSource("");
      setVideoFile(null);
      setSrtText("");
      if (srtInputRef.current) srtInputRef.current.value = "";
      await reloadMaterials();
    } catch {
      setError("网络错误，上传失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("确定删除该共享素材？用户已导入的本地副本不受影响。"))
      return;
    try {
      const res = await fetch("/api/admin/materials", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "删除失败");
        return;
      }
      setMsg("已删除");
      await reloadMaterials();
    } catch {
      setError("网络错误，删除失败");
    }
  }

  async function handleGenInvites() {
    setInvErr("");
    setInvMsg("");
    setGenResult([]);
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: genCount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInvErr(data.error ?? "生成失败");
        return;
      }
      setGenResult(data.codes ?? []);
      setInvMsg(`已生成 ${data.codes?.length ?? 0} 个邀请码`);
      await loadInvites();
    } catch {
      setInvErr("网络错误，生成失败");
    }
  }

  async function handleDeleteInvite(code: string) {
    if (!window.confirm(`删除未使用的邀请码 ${code}？`)) return;
    try {
      const res = await fetch("/api/admin/invites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInvErr(data.error ?? "删除失败");
        return;
      }
      setInvMsg("已删除");
      await loadInvites();
    } catch {
      setInvErr("网络错误，删除失败");
    }
  }

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(genResult.join("\n"));
      setInvMsg("已复制到剪贴板");
    } catch {
      setInvErr("复制失败，请手动选择复制");
    }
  }

  if (loading) {
    return (
      <div className="px-5 pt-20 text-center text-sm text-ink-300">加载中…</div>
    );
  }

  if (user?.role !== "admin") {
    return (
      <div className="px-5 pt-20 text-center">
        <p className="text-sm text-ink-300">无权限访问管理后台</p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-full bg-signal px-5 py-2 text-sm font-semibold text-booth-950"
        >
          返回首页
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen w-full max-w-md px-5 pb-10">
      <header className="flex items-center justify-between pt-6 pb-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink-50">
            管理后台
          </h1>
          <p className="mt-1 text-sm text-ink-300">{user.email}</p>
        </div>
        <Link href="/" className="text-sm text-ink-400 hover:text-ink-200">
          ← 返回
        </Link>
      </header>

      {/* Tab 切换 */}
      <div className="flex rounded-full border border-booth-700 bg-booth-900 p-1">
        {(
          [
            ["materials", "素材"],
            ["invites", "邀请码"],
            ["users", "用户"],
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

      <main className="space-y-4 pt-4">
        {tab === "materials" ? (
          <>
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

            <section className="space-y-4 rounded-2xl border border-booth-700 bg-booth-900 p-5">
              <h2 className="text-xs font-medium text-ink-300">上传新素材</h2>
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
                  来源（可选）
                </label>
                <input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="例如：Friends / 老友记"
                  className="w-full rounded-xl border border-booth-700 bg-booth-850 px-4 py-3 text-sm text-ink-50 placeholder:text-ink-500 focus:border-signal"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-ink-300">视频文件</label>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
                  className="w-full rounded-xl border border-booth-700 bg-booth-850 px-4 py-3 text-sm text-ink-300 file:mr-3 file:rounded-lg file:border-0 file:bg-booth-700 file:px-3 file:py-1.5 file:text-ink-100"
                />
                {videoFile && (
                  <p className="mt-1 text-xs text-ink-300">
                    已选：{videoFile.name}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-ink-300">
                  英文字幕（.srt 文件或直接粘贴）
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
                  placeholder={
                    "或粘贴 SRT 字幕…\n\n1\n00:00:00,000 --> 00:00:03,000\nHello there."
                  }
                  rows={5}
                  className="mt-2 w-full rounded-xl border border-booth-700 bg-booth-850 px-4 py-3 font-mono text-xs text-ink-100 placeholder:text-ink-500 focus:border-signal"
                />
              </div>
              <button
                onClick={handleUpload}
                disabled={busy}
                className="h-11 w-full rounded-full bg-signal font-semibold text-booth-950 transition-colors hover:bg-signal-strong disabled:opacity-50"
              >
                {busy ? "上传中…" : "上传并切分"}
              </button>
            </section>

            <section>
              <h2 className="mb-2 text-xs font-medium text-ink-300">
                已上传素材（{materials.length}）
              </h2>
              {materials.length === 0 ? (
                <p className="rounded-2xl border border-booth-700 bg-booth-900 p-6 text-center text-sm text-ink-300">
                  还没有共享素材
                </p>
              ) : (
                <ul className="space-y-2">
                  {materials.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center gap-3 rounded-2xl border border-booth-700 bg-booth-900 p-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink-50">
                          {m.title}
                        </p>
                        <p className="mt-0.5 font-mono text-[11px] text-ink-300">
                          {m.sentenceCount} 句
                          {m.durationSec
                            ? ` · ${Math.round(m.durationSec / 60)} 分`
                            : ""}
                          {m.createdBy ? ` · ${m.createdBy}` : ""}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDelete(m.id)}
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
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : tab === "invites" ? (
          <>
            {invMsg && (
              <div className="rounded-xl border border-booth-700 bg-booth-800 px-4 py-3 text-sm text-good">
                {invMsg}
              </div>
            )}
            {invErr && (
              <div className="rounded-xl border border-rec/30 bg-rec/10 px-4 py-3 text-sm text-rec">
                {invErr}
              </div>
            )}

            <section className="space-y-3 rounded-2xl border border-booth-700 bg-booth-900 p-5">
              <h2 className="text-xs font-medium text-ink-300">生成邀请码</h2>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={genCount}
                  onChange={(e) =>
                    setGenCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))
                  }
                  className="w-24 rounded-xl border border-booth-700 bg-booth-850 px-4 py-3 text-sm text-ink-50 focus:border-signal"
                />
                <button
                  onClick={handleGenInvites}
                  className="h-11 flex-1 rounded-full bg-signal font-semibold text-booth-950 transition-colors hover:bg-signal-strong"
                >
                  生成
                </button>
              </div>

              {genResult.length > 0 && (
                <div className="rounded-xl border border-booth-700 bg-booth-850 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-ink-300">新邀请码（发给朋友注册用）</p>
                    <button
                      onClick={copyCodes}
                      className="text-xs font-medium text-signal hover:text-signal-strong"
                    >
                      复制全部
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {genResult.map((c) => (
                      <span
                        key={c}
                        className="rounded-lg bg-booth-700 px-2.5 py-1 font-mono text-sm tracking-wider text-ink-50"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-2 text-xs font-medium text-ink-300">
                全部邀请码（{invites.length}）
              </h2>
              {invites.length === 0 ? (
                <p className="rounded-2xl border border-booth-700 bg-booth-900 p-6 text-center text-sm text-ink-300">
                  还没有邀请码
                </p>
              ) : (
                <ul className="space-y-2">
                  {invites.map((inv) => {
                    const used = !!inv.usedBy;
                    return (
                      <li
                        key={inv.code}
                        className="flex items-center gap-3 rounded-2xl border border-booth-700 bg-booth-900 p-4"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-sm tracking-wider text-ink-50">
                            {inv.code}
                          </p>
                          <p className="mt-0.5 text-[11px] text-ink-300">
                            {used ? (
                              <span>
                                已用 · {inv.usedByEmail ?? inv.usedBy} ·{" "}
                                {fmtDate(inv.usedAt)}
                              </span>
                            ) : (
                              <span className="text-good">
                                未使用 · {fmtDate(inv.createdAt)}
                              </span>
                            )}
                          </p>
                        </div>
                        {!used && (
                          <button
                            onClick={() => handleDeleteInvite(inv.code)}
                            aria-label="删除邀请码"
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
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        ) : (
          <section>
            <h2 className="mb-2 text-xs font-medium text-ink-300">
              用户（{users.length}）
            </h2>
            {usersLoading ? (
              <p className="py-8 text-center text-sm text-ink-300">加载中…</p>
            ) : users.length === 0 ? (
              <p className="rounded-2xl border border-booth-700 bg-booth-900 p-6 text-center text-sm text-ink-300">
                还没有注册用户
              </p>
            ) : (
              <ul className="space-y-2">
                {users.map((u) => (
                  <li
                    key={u.id}
                    className="rounded-2xl border border-booth-700 bg-booth-900 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <p className="min-w-0 truncate text-sm font-semibold text-ink-50">
                        {u.email}
                      </p>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                          u.role === "admin"
                            ? "bg-signal-dim text-signal"
                            : "bg-booth-800 text-ink-300"
                        }`}
                      >
                        {u.role === "admin" ? "管理员" : "用户"}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-ink-300">
                      注册 {fmtDate(u.createdAt)} · 卡 {u.cards} · 跟读 {u.attempts} · 识物{" "}
                      {u.recognitions} · 会话 {u.sessions}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
