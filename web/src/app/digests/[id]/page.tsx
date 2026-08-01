"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { MarkdownView } from "@/components/markdown-view";

type DigestSource = {
  articleId: string;
  title: string;
  score: number | null;
  domain: string;
  core: string;
};

type Digest = {
  id: string;
  title: string;
  weekLabel: string;
  domain: string | null;
  body: string;
  sourceJson: string | null;
  status: string;
  publishedAt: string | null;
  createdAt: string;
};

export default function DigestDetailPage() {
  const params = useParams();
  const id = String(params.id ?? "");
  const [digest, setDigest] = useState<Digest | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    fetch(`/api/digests/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { digest?: Digest } | null) => {
        if (!data?.digest) {
          setError("Không tìm thấy digest");
          return;
        }
        setDigest(data.digest);
      })
      .catch(() => setError("Lỗi tải digest"));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(status: "DRAFT" | "PUBLISHED") {
    if (!digest) return;
    setBusy(true);
    const res = await fetch(`/api/digests/${digest.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    if (res.ok) {
      const data = (await res.json()) as { digest: Digest };
      setDigest(data.digest);
    }
  }

  if (error) {
    return (
      <AppShell title="Digest" backHref="/digests" backLabel="Digests">
        <p className="text-[var(--danger)]">{error}</p>
      </AppShell>
    );
  }

  if (!digest) {
    return (
      <AppShell title="Digest" backHref="/digests" backLabel="Digests">
        <p className="text-sm text-[var(--ink-faint)]">Đang tải…</p>
      </AppShell>
    );
  }

  let sources: DigestSource[] = [];
  try {
    sources = digest.sourceJson ? (JSON.parse(digest.sourceJson) as DigestSource[]) : [];
  } catch {
    sources = [];
  }

  return (
    <AppShell
      title={digest.title}
      subtitle={`${digest.weekLabel}${digest.domain ? ` · ${digest.domain}` : ""}`}
      backHref="/digests"
      backLabel="Digests"
      actions={
        <div className="flex gap-2">
          {digest.status !== "PUBLISHED" ? (
            <Button
              type="button"
              disabled={busy}
              onClick={() => setStatus("PUBLISHED")}
              className="rounded-full"
            >
              Xuất bản digest
            </Button>
          ) : (
            <Button
              type="button"
              disabled={busy}
              variant="secondary"
              onClick={() => setStatus("DRAFT")}
              className="rounded-full"
            >
              Về nháp
            </Button>
          )}
        </div>
      }
    >
      <div className="mb-6 flex flex-wrap gap-2 text-xs text-[var(--ink-muted)]">
        <span className="rounded-full bg-white/80 px-3 py-1 ring-1 ring-[var(--line)]">
          {digest.status}
        </span>
        {digest.publishedAt && (
          <span className="rounded-full bg-white/80 px-3 py-1 ring-1 ring-[var(--line)]">
            {new Date(digest.publishedAt).toLocaleDateString("vi-VN")}
          </span>
        )}
      </div>

      {sources.length > 0 && (
        <div className="mb-8 surface-soft p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
            Nguồn điểm cao
          </p>
          <ul className="mt-2 space-y-1.5">
            {sources.map((s) => (
              <li key={s.articleId} className="text-sm text-[var(--ink-muted)]">
                <Link
                  href={`/library/${s.articleId}`}
                  className="font-medium text-[var(--ink)] hover:text-[var(--accent)]"
                >
                  {s.title}
                </Link>
                {s.score != null && (
                  <span className="ml-2 text-[11px] text-[var(--accent)]">{s.score}/5</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <article className="surface-card prose-article p-6 sm:p-8">
        <MarkdownView content={digest.body} />
      </article>
    </AppShell>
  );
}
