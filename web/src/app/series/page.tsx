"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select } from "@/components/ui/input";
import { domainSelectOptions } from "@/lib/tfes/domains";
import { StatusBadge } from "@/components/status-badge";

type SeriesRow = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  domain: string;
  _count: { articles: number };
  articles: Array<{
    id: string;
    title: string | null;
    topic: string | null;
    status: string;
    seriesOrder: number | null;
  }>;
};

export default function SeriesPage() {
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [domain, setDomain] = useState("engineering");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetch("/api/series")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { series?: SeriesRow[] } | null) => setSeries(data?.series ?? []))
      .catch(() => setSeries([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/series", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, description, domain }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Không tạo được series");
      return;
    }
    setTitle("");
    setDescription("");
    load();
  }

  return (
    <AppShell
      title="Series"
      subtitle="Nhóm bài cùng mạch — Memory tránh trùng góc trong series."
      backHref="/dashboard"
      backLabel="Biên tập"
    >
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <form onSubmit={onCreate} className="surface-card space-y-4 p-6">
          <p className="text-sm font-semibold text-[var(--ink)]">Tạo series mới</p>
          <div>
            <Label htmlFor="s-title">Tiêu đề</Label>
            <Input
              id="s-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Observability thực chiến"
              required
            />
          </div>
          <div>
            <Label htmlFor="s-domain">Domain</Label>
            <Select id="s-domain" value={domain} onChange={(e) => setDomain(e.target.value)}>
              {domainSelectOptions().map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="s-desc">Mô tả ngắn</Label>
            <Input
              id="s-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mạch chuyên đề / độc giả"
            />
            <FieldHint>Khi tạo bài mới, gắn series để pipeline nhớ các góc đã viết.</FieldHint>
          </div>
          {error && (
            <p className="text-sm text-[var(--danger)]">{error}</p>
          )}
          <Button type="submit" disabled={loading || !title.trim()} className="rounded-full">
            {loading ? "Đang tạo…" : "Tạo series"}
          </Button>
        </form>

        <div className="space-y-4">
          {series.length === 0 ? (
            <div className="hero-band px-6 py-12 text-center">
              <p className="text-sm text-[var(--ink-muted)]">Chưa có series — tạo một cái bên trái.</p>
            </div>
          ) : (
            series.map((s) => (
              <div key={s.id} className="surface-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link
                      href={`/series/${s.id}`}
                      className="font-[family-name:var(--font-source-serif)] text-lg font-semibold text-[var(--ink)] hover:text-[var(--accent)]"
                    >
                      {s.title}
                    </Link>
                    <p className="mt-1 text-xs text-[var(--ink-faint)]">
                      {s.domain} · {s._count.articles} bài · /{s.slug}
                    </p>
                  </div>
                  <Link
                    href={`/articles/new`}
                    className="text-xs font-medium text-[var(--accent)] hover:underline"
                  >
                    + Bài trong series
                  </Link>
                </div>
                {s.description && (
                  <p className="mt-2 text-sm text-[var(--ink-muted)]">{s.description}</p>
                )}
                {s.articles.length > 0 && (
                  <ul className="mt-3 space-y-1.5 border-t border-[var(--line)] pt-3">
                    {s.articles.map((a) => (
                      <li key={a.id} className="flex items-center gap-2 text-sm">
                        <span className="w-6 tabular-nums text-[var(--ink-faint)]">
                          {a.seriesOrder != null ? `#${a.seriesOrder}` : "·"}
                        </span>
                        <Link
                          href={
                            a.status === "PUBLISHED"
                              ? `/library/${a.id}`
                              : `/articles/${a.id}`
                          }
                          className="flex-1 truncate text-[var(--ink)] hover:text-[var(--accent)]"
                        >
                          {a.title || a.topic || "Untitled"}
                        </Link>
                        <StatusBadge status={a.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
