"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { DomainBadge, StatusBadge } from "@/components/status-badge";
import { resolvePublishFormat } from "@/lib/tfes/publish-formats";

type SeriesDetail = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  domain: string;
  articles: Array<{
    id: string;
    title: string | null;
    topic: string | null;
    status: string;
    domain: string;
    publishFormat: string;
    seriesOrder: number | null;
    publishedAt: string | null;
  }>;
};

export default function SeriesDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const [series, setSeries] = useState<SeriesDetail | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!id) return;
    fetch(`/api/series/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { series?: SeriesDetail; error?: string } | null) => {
        if (!data?.series) {
          setError(data?.error || "Không tìm thấy series");
          return;
        }
        setSeries(data.series);
      })
      .catch(() => setError("Lỗi tải series"));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <AppShell title="Series" backHref="/series" backLabel="Series">
        <p className="text-[var(--danger)]">{error}</p>
      </AppShell>
    );
  }

  if (!series) {
    return (
      <AppShell title="Series" backHref="/series" backLabel="Series">
        <p className="text-sm text-[var(--ink-faint)]">Đang tải…</p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={series.title}
      subtitle={series.description || `Series · ${series.domain}`}
      backHref="/series"
      backLabel="Series"
      actions={
        <Link
          href="/articles/new"
          className="rounded-full bg-[var(--accent)] px-3.5 py-2 text-xs font-semibold text-white"
        >
          + Bài mới
        </Link>
      }
    >
      <div className="mb-6 flex flex-wrap gap-2">
        <DomainBadge domain={series.domain} />
        <span className="rounded-full bg-white/80 px-3 py-1 text-xs text-[var(--ink-muted)] ring-1 ring-[var(--line)]">
          {series.articles.length} bài · /{series.slug}
        </span>
      </div>

      {series.articles.length === 0 ? (
        <div className="hero-band px-6 py-12 text-center">
          <p className="text-sm text-[var(--ink-muted)]">
            Chưa có bài — tạo bài mới và chọn series này.
          </p>
        </div>
      ) : (
        <ol className="space-y-3">
          {series.articles.map((a) => {
            const fmt = resolvePublishFormat(a.publishFormat);
            return (
              <li key={a.id} className="surface-card flex flex-wrap items-center gap-3 p-4">
                <span className="w-10 text-center text-sm font-semibold tabular-nums text-[var(--accent)]">
                  {a.seriesOrder != null ? `#${a.seriesOrder}` : "·"}
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={
                      a.status === "PUBLISHED" ? `/library/${a.id}` : `/articles/${a.id}`
                    }
                    className="font-medium text-[var(--ink)] hover:text-[var(--accent)]"
                  >
                    {a.title || a.topic || "Untitled"}
                  </Link>
                  <p className="mt-0.5 text-xs text-[var(--ink-faint)]">{fmt.labelVi}</p>
                </div>
                <StatusBadge status={a.status} />
              </li>
            );
          })}
        </ol>
      )}
    </AppShell>
  );
}
