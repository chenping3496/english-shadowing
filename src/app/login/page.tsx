"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { login, fetchMe } from "@/lib/auth-client";
import { useAuth } from "@/components/AuthProvider";
import { Field } from "@/components/Field";

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const r = await login(email, password);
    if (!r.ok) {
      setBusy(false);
      setError(r.error ?? "登录失败");
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
        <Link href="/" className="text-sm text-ink-400 hover:text-ink-200">
          ← 返回
        </Link>
        <h1 className="mt-3 font-display text-xl font-semibold text-ink-50">
          登录
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
            label="密码"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="••••••"
            autoComplete="current-password"
          />
          {error && <p className="text-sm text-rec">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-signal py-3 text-sm font-semibold text-booth-950 hover:bg-signal-strong disabled:opacity-50"
          >
            {busy ? "登录中…" : "登录"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-300">
          还没有账号？{" "}
          <Link href="/register" className="text-signal hover:underline">
            邀请码注册
          </Link>
        </p>
      </main>
    </div>
  );
}
