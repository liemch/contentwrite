"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
      body: JSON.stringify({ password }),
    });

    setLoading(false);

    if (!res.ok) {
      setError("Mật khẩu không đúng");
      return;
    }

    const next = searchParams.get("next") || "/dashboard";
    router.push(next);
    router.refresh();
  }

  return (
    <div className="app-shell-bg relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute -left-20 top-10 h-80 w-80 rounded-full bg-[var(--accent-glow)] blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-96 w-96 rounded-full bg-[rgba(196,92,38,0.1)] blur-3xl" />

      <main className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-5 py-12 sm:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="animate-fade-up">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)] ring-1 ring-[var(--line)]">
              ContentTechhub · Nội bộ
            </div>
            <h1 className="font-[family-name:var(--font-source-serif)] text-4xl font-semibold leading-[1.15] tracking-tight text-[var(--ink)] sm:text-5xl">
              Biên tập tri thức
              <span className="block text-gradient">có kiểm chứng nguồn</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-[var(--ink-muted)]">
              AI-TFES + GLM-5.2: research thật, Insight Gate, cổng duyệt người — rồi lưu vào thư
              viện nội bộ.
            </p>
            <div className="mt-8 grid max-w-md gap-3 text-sm text-[var(--ink-muted)]">
              {[
                "Pipeline 4 bước: Research → Insight → Write → Finalize",
                "Thư viện bài đã duyệt, đọc dạng tạp chí nội bộ",
                "Hero brief sẵn sàng để gen ảnh minh họa",
              ].map((item) => (
                <div key={item} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </section>

          <section
            className="glass-panel animate-fade-up rounded-[24px] p-8 sm:p-9"
            style={{ animationDelay: "70ms" }}
          >
            <p className="text-sm font-semibold text-[var(--ink)]">Đăng nhập editorial</p>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">Một admin · mật khẩu nội bộ</p>

            <form onSubmit={onSubmit} className="mt-7 space-y-5">
              <div>
                <Label htmlFor="password">Mật khẩu</Label>
                <Input
                  id="password"
                  type="password"
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
                {loading ? "Đang vào..." : "Vào Pipeline"}
              </Button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
