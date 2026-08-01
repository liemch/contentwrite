"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { domainSelectOptions } from "@/lib/tfes/domains";

/** ISO week label — client-safe (không import digest server). */
function currentWeekLabel(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

type DigestRow = {
  id: string;
  title: string;
  weekLabel: string;
  domain: string | null;
  status: string;
  createdAt: string;
  publishedAt: string | null;
};

export default function DigestsPage() {
  const [digests, setDigests] = useState<DigestRow[]>([]);
  const [domain, setDomain] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    fetch("/api/digests")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { digests?: DigestRow[] } | null) => setDigests(data?.digests ?? []))
      .catch(() => setDigests([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/digests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain: domain === "all" ? null : domain,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      digest?: { id: string };
      error?: string;
    };
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Không tạo được digest");
      return;
    }
    if (data.digest?.id) {
      window.location.href = `/digests/${data.digest.id}`;
      return;
    }
    load();
  }

  return (
    <AppShell
      title="Weekly digest"
      subtitle={`Tổng hợp insight điểm ≥4 từ Thư viện — tuần ${currentWeekLabel()}.`}
      backHref="/library"
      backLabel="Thư viện"
    >
      <div className="mb-8 flex flex-wrap items-end gap-4 surface-card p-5">
        <div className="min-w-[180px]">
          <Label htmlFor="d-domain">Lọc domain nguồn</Label>
          <Select id="d-domain" value={domain} onChange={(e) => setDomain(e.target.value)}>
            <option value="all">Tất cả domain</option>
            {domainSelectOptions().map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>
        <Button
          type="button"
          onClick={generate}
          disabled={loading}
          className="rounded-full"
        >
          {loading ? "Đang sinh…" : "Tạo digest tuần này"}
        </Button>
        {error && <p className="w-full text-sm text-[var(--danger)]">{error}</p>}
      </div>

      {digests.length === 0 ? (
        <div className="hero-band px-6 py-14 text-center">
          <h2 className="font-[family-name:var(--font-source-serif)] text-xl font-semibold">
            Chưa có digest
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--ink-muted)]">
            Cần bài đã Publish với điểm biên tập ≥4. Approve score cao rồi Publish trước.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {digests.map((d) => (
            <li key={d.id}>
              <Link
                href={`/digests/${d.id}`}
                className="surface-card flex flex-wrap items-center justify-between gap-3 p-5 transition hover:-translate-y-0.5"
              >
                <div>
                  <p className="font-[family-name:var(--font-source-serif)] text-lg font-semibold text-[var(--ink)]">
                    {d.title}
                  </p>
                  <p className="mt-1 text-xs text-[var(--ink-faint)]">
                    {d.weekLabel}
                    {d.domain ? ` · ${d.domain}` : " · mixed"}
                    {" · "}
                    {new Date(d.createdAt).toLocaleDateString("vi-VN")}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                    d.status === "PUBLISHED"
                      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "bg-[var(--surface-muted)] text-[var(--ink-muted)]"
                  }`}
                >
                  {d.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
