"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { BRAND } from "@/lib/brand";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Đăng nhập thất bại");
      return;
    }

    const next = searchParams.get("next") || "/dashboard";
    router.push(next);
    router.refresh();
  }

  return (
    <div className="app-shell-bg relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute -left-24 top-0 h-[28rem] w-[28rem] rounded-full bg-[var(--accent-glow)] blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[32rem] w-[32rem] rounded-full bg-[rgba(10,21,32,0.08)] blur-3xl" />

      <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-5 py-12 sm:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="animate-fade-up">
            <div className="mb-7 flex items-center gap-3">
              <div className="brand-mark h-12 w-12 text-base">
                <span>{BRAND.mark}</span>
              </div>
              <div>
                <p className="font-[family-name:var(--font-source-serif)] text-xl font-semibold tracking-tight text-[var(--ink)]">
                  {BRAND.name}
                </p>
                <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                  {BRAND.productLine}
                </p>
              </div>
            </div>

            <h1 className="font-[family-name:var(--font-source-serif)] text-4xl font-semibold leading-[1.12] tracking-tight text-[var(--ink)] sm:text-[3.25rem]">
              Biên tập tri thức
              <span className="block text-gradient">có kiểm chứng nguồn</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-[var(--ink-muted)]">
              Bàn biên tập nội bộ: research thật, Insight Gate ≥ L2, duyệt người — rồi vào thư viện
              đọc như tạp chí.
            </p>
            <div className="mt-9 grid max-w-md gap-3.5 text-sm text-[var(--ink-muted)]">
              {[
                "Chu trình AI-TFES 10 bước (+ Insight Gate)",
                "Thư viện bài đã publish, lọc theo danh mục",
                "Hero brief sẵn sàng gen ảnh minh họa",
              ].map((item) => (
                <div key={item} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="glass-panel animate-fade-up-delay rounded-[var(--radius-lg)] p-8 sm:p-9">
            <p className="text-sm font-semibold text-[var(--ink)]">Đăng nhập</p>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Tài khoản do admin cấp — vào bàn biên tập {BRAND.name}
            </p>

            <form onSubmit={onSubmit} className="mt-7 space-y-5">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ban@congty.com"
                  required
                />
              </div>
              <div>
                <Label htmlFor="password">Mật khẩu</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>
              {error && (
                <div className="rounded-xl border border-red-200 bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
                  {error}
                </div>
              )}
              <Button type="submit" disabled={loading} className="w-full rounded-full">
                {loading ? "Đang vào..." : "Vào biên tập"}
              </Button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
