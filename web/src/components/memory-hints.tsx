"use client";

import { useEffect, useState } from "react";
import type { MemoryAngle, SeriesSiblingClaim } from "@/lib/tfes/editorial-memory";

type MemoryHintsProps = {
  domain: string;
  topic: string;
  seriesId?: string;
};

type SeriesHint = {
  title: string;
  description: string | null;
  siblings: SeriesSiblingClaim[];
};

export function MemoryHints({ domain, topic, seriesId }: MemoryHintsProps) {
  const [angles, setAngles] = useState<MemoryAngle[]>([]);
  const [series, setSeries] = useState<SeriesHint | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!domain) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      const q = new URLSearchParams({ domain });
      if (topic.trim()) q.set("topic", topic.trim());
      if (seriesId) q.set("seriesId", seriesId);
      fetch(`/api/editorial-memory?${q}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then(
          (
            data: {
              angles?: MemoryAngle[];
              series?: SeriesHint | null;
            } | null,
          ) => {
            setAngles(data?.angles ?? []);
            setSeries(data?.series ?? null);
          },
        )
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [domain, topic, seriesId]);

  if (!loading && angles.length === 0 && !series) return null;

  return (
    <div className="mb-5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
        {seriesId ? "Series — góc đã chiếm" : "Editorial Memory — góc đã có"}
      </p>
      <p className="mt-1 text-xs text-[var(--ink-muted)]">
        {seriesId
          ? "Cùng series được phép cùng chủ đề; CẤM trùng luận điểm / hook với bài anh/em."
          : "Tránh trùng luận điểm. Chọn góc khác hoặc xoay mở bài / shape."}
      </p>
      {series && series.siblings.length > 0 ? (
        <ul className="mt-2 space-y-1.5 border-b border-[var(--line)] pb-2">
          {series.siblings.map((s) => (
            <li key={s.articleId} className="text-sm text-[var(--ink-muted)]">
              <span className="font-medium text-[var(--ink)]">
                {s.seriesOrder != null ? `#${s.seriesOrder} ` : ""}
                {s.topic || s.title}
              </span>
              {s.core ? (
                <span className="mt-0.5 block text-[11px] text-[var(--ink-faint)]">
                  Đã chiếm: {s.core}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {loading ? (
        <p className="mt-2 text-xs text-[var(--ink-faint)]">Đang tải…</p>
      ) : angles.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {angles.map((a) => (
            <li key={`${a.title}-${a.articleId ?? ""}`} className="text-sm text-[var(--ink-muted)]">
              <span className="font-medium text-[var(--ink)]">{a.title}</span>
              {a.score != null && (
                <span className="ml-2 text-[11px] text-[var(--accent)]">{a.score}/5</span>
              )}
              {a.core ? (
                <span className="mt-0.5 block text-[11px] text-[var(--ink-faint)]">{a.core}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
