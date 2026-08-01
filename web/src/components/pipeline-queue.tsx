"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DomainBadge, StatusBadge, STEP_LABELS } from "@/components/status-badge";
import { Button } from "@/components/ui/button";

export type QueueItem = {
  id: string;
  title: string | null;
  topic: string | null;
  domain: string;
  status: string;
  currentStep: string | null;
  errorMessage: string | null;
  source?: string | null;
};

export function PipelineQueue({ items }: { items: QueueItem[] }) {
  const router = useRouter();
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function removeItem(id: string, label: string) {
    const ok = window.confirm(`Xoá bài “${label}”? Không hoàn tác được.`);
    if (!ok) return;

    setRemoving(id);
    setError("");
    const res = await fetch(`/api/articles/${id}`, { method: "DELETE" });
    setRemoving(null);

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error || "Không xoá được bài");
      return;
    }

    router.refresh();
  }

  if (items.length === 0) {
    return (
      <div className="surface-soft px-6 py-12 text-center">
        <p className="font-[family-name:var(--font-source-serif)] text-lg font-semibold text-[var(--ink)]">
          Hàng đợi trống
        </p>
        <p className="mt-2 text-sm text-[var(--ink-muted)]">
          Tạo bài mới để bắt đầu Research → Insight → Write.
        </p>
        <Link
          href="/articles/new"
          className="mt-5 inline-flex rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)]"
        >
          Bắt đầu viết
        </Link>
      </div>
    );
  }

  return (
    <div className="surface-card overflow-hidden">
      {error && (
        <div className="border-b border-red-200 bg-[var(--danger-soft)] px-5 py-2.5 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}
      <ul className="divide-y divide-[var(--line)]">
        {items.map((article) => {
          const label = article.title || article.topic || "Bài chưa có tiêu đề";
          const busy = removing === article.id;

          return (
            <li
              key={article.id}
              className="flex flex-wrap items-center gap-3 px-5 py-4 transition hover:bg-[var(--surface-muted)]"
            >
              <Link href={`/articles/${article.id}`} className="min-w-0 flex-1">
                <p className="truncate font-medium text-[var(--ink)] hover:text-[var(--accent)]">
                  {label}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[var(--ink-faint)]">
                  <DomainBadge domain={article.domain} />
                  {article.source === "auto" && (
                    <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                      Auto
                    </span>
                  )}
                  {article.currentStep && (
                    <>
                      <span>·</span>
                      <span>Bước: {STEP_LABELS[article.currentStep]}</span>
                    </>
                  )}
                  {article.errorMessage && (
                    <>
                      <span>·</span>
                      <span className="max-w-[28rem] truncate text-[var(--danger)]" title={article.errorMessage}>
                        {article.status === "FAILED" ? "Lỗi" : "Có lỗi"}: {article.errorMessage}
                      </span>
                    </>
                  )}
                </div>
              </Link>

              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status={article.status} />
                <Button
                  type="button"
                  variant={article.status === "FAILED" ? "danger" : "ghost"}
                  size="sm"
                  disabled={busy || removing !== null}
                  onClick={() => removeItem(article.id, label)}
                  title="Xoá khỏi hàng đợi"
                >
                  {busy ? "Đang xoá..." : "Xoá"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
