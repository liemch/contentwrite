"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import type { CohortStats } from "@/lib/cohort-tracker";

type CohortTrackerPanelProps = {
  initial: CohortStats;
};

export function CohortTrackerPanel({ initial }: CohortTrackerPanelProps) {
  const [stats, setStats] = useState(initial);
  const [articleIdsText, setArticleIdsText] = useState(initial.manifest.articleIds.join("\n"));
  const [cohortId, setCohortId] = useState(initial.manifest.cohortId);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    const res = await fetch("/api/admin/cohort");
    if (!res.ok) {
      setError("Không tải được cohort metrics");
      return;
    }
    const data = (await res.json()) as { stats: CohortStats };
    setStats(data.stats);
    setArticleIdsText(data.stats.manifest.articleIds.join("\n"));
    setCohortId(data.stats.manifest.cohortId);
  }

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    const articleIds = articleIdsText
      .split(/[\n,]+/)
      .map((id) => id.trim())
      .filter(Boolean);
    const res = await fetch("/api/admin/cohort", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cohortId, articleIds }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "Lưu thất bại");
      return;
    }
    const data = (await res.json()) as { stats: CohortStats };
    setStats(data.stats);
    setMessage("Đã lưu manifest cohort");
  }

  const { summary } = stats;

  return (
    <section className="surface-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-source-serif)] text-xl font-semibold text-[var(--ink)]">
            WP2.7 Cohort Tracker
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Gắn articleIds cohort — xem tiến độ publish, domain coverage, meta-leak rate.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void refresh()}>
          Làm mới metrics
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Bài trong cohort", value: summary.total, hint: `target ≥ ${summary.targetMinArticles}` },
          { label: "Published", value: summary.published, hint: "workflow PUBLISHED" },
          { label: "Domains", value: summary.domains, hint: "đa dạng lĩnh vực" },
          {
            label: "Meta-leak rate",
            value: `${(summary.metaLeakRate * 100).toFixed(1)}%`,
            hint: `${summary.metaLeakCount} bài có leak`,
          },
        ].map((item) => (
          <div key={item.label} className="metric-tile px-4 py-3">
            <p className="section-kicker">{item.label}</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--ink)]">{item.value}</p>
            <p className="text-xs text-[var(--ink-faint)]">{item.hint}</p>
          </div>
        ))}
      </div>

      <p
        className={`mt-4 text-sm font-medium ${
          summary.onTrack ? "text-[var(--accent)]" : "text-[var(--warm)]"
        }`}
      >
        {summary.onTrack
          ? "Cohort đang đạt target cơ bản (số bài + meta-leak)."
          : "Chưa đạt target — thêm bài hoặc sửa meta-leak trước khi kết luận chất lượng."}
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div>
          <Label htmlFor="cohort-id">Cohort ID</Label>
          <input
            id="cohort-id"
            className="mt-1 w-full rounded-xl border border-[var(--line)] px-3 py-2 text-sm"
            value={cohortId}
            onChange={(e) => setCohortId(e.target.value)}
          />
        </div>
        <div className="lg:col-span-2">
          <Label htmlFor="cohort-ids">Article IDs (mỗi dòng hoặc cách nhau bằng dấu phẩy)</Label>
          <Textarea
            id="cohort-ids"
            className="mt-1 min-h-[120px] font-mono text-xs"
            value={articleIdsText}
            onChange={(e) => setArticleIdsText(e.target.value)}
            placeholder="clxxx...\nclyyy..."
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm" busy={saving} onClick={() => void save()}>
          Lưu manifest
        </Button>
        {message ? <span className="text-sm text-[var(--accent)]">{message}</span> : null}
        {error ? <span className="text-sm text-[var(--warm)]">{error}</span> : null}
      </div>

      {stats.articles.length > 0 ? (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-[11px] uppercase tracking-wide text-[var(--ink-faint)]">
                <th className="py-2 pr-3">Bài</th>
                <th className="py-2 pr-3">Domain</th>
                <th className="py-2 pr-3">State</th>
                <th className="py-2">Meta-leak</th>
              </tr>
            </thead>
            <tbody>
              {stats.articles.map((row) => (
                <tr key={row.id} className="border-b border-[var(--line)]/60">
                  <td className="py-2 pr-3">
                    <a href={`/articles/${row.id}`} className="font-medium text-[var(--accent)] underline">
                      {row.title || row.topic || row.id.slice(0, 8)}
                    </a>
                  </td>
                  <td className="py-2 pr-3">{row.domain}</td>
                  <td className="py-2 pr-3">{row.workflowState}</td>
                  <td className="py-2">{row.metaLeak ? "⚠ có" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
