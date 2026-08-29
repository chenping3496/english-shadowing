"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { register, fetchMe } from "@/lib/auth-client";
import { useAuth } from "@/components/AuthProvider";
import { Field } from "@/components/Field";

export default function RegisterPage() {
  const router = useRouter();
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const r = await register(email, password, invite);
    if (!r.ok) {
      setBusy(false);
      setError(r.error ?? "注册失败");
      return;
    }
    const u = await fetchMe();
    setUser(u);
    setBusy(false);
    router.push("/");
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-10">
      <header className="pt-5">
        <Link href="/login" className="text-sm text-ink-400 hover:text-ink-200">
          ← 返回登录
        </Link>
        <h1 className="mt-3 font-display text-xl font-semibold text-ink-50">
          邀请码注册
        </h1>
      </header>

      <main className="flex flex-1 flex-col justify-center py-8">
        <form onSubmit={submit} className="space-y-4">
          <Field
            label="邮箱"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            autoComplete="email"
          />
          <Field
            label="密码（至少 6 位）"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••"
            autoComplete="new-password"
          />
          <Field
            label="邀请码"
            value={invite}
            onChange={setInvite}
            placeholder="8 位邀请码"
            autoComplete="off"
          />
          {error && <p className="text-sm text-rec">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-signal py-3 text-sm font-semibold text-booth-950 hover:bg-signal-strong disabled:opacity-50"
          >
            {busy ? "注册中…" : "注册"}
          </button>
        </form>
      </main>
    </div>
  );
}
