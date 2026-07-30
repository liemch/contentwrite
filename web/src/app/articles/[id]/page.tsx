"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { MarkdownView } from "@/components/markdown-view";
import { PipelineSteps } from "@/components/pipeline-steps";
import { DomainBadge, StatusBadge, STEP_LABELS } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { prepareReaderContent } from "@/lib/publish-content";

type Article = {
  id: string;
  title: string | null;
  topic: string | null;
  domain: string;
  status: string;
  currentStep: string | null;
  errorMessage: string | null;
  researchBrief: string | null;
  insightGate: string | null;
  draft12: string | null;
  factCheck: string | null;
  knowledgeRecord: string | null;
  cleanPublish: string | null;
  heroBrief: string | null;
  heroImageUrl: string | null;
  heroImageModel: string | null;
  heroImageAlt: string | null;
  heroPromptUsed: string | null;
  reviewerNotes: string | null;
};

const TABS = [
  { key: "clean", label: "Bản sạch", desc: "Copy-paste để đăng" },
  { key: "research", label: "Research", desc: "Nguồn & trade-off" },
  { key: "insight", label: "Insight Gate", desc: "L2/L3 + quyết định" },
  { key: "draft", label: "12 sections", desc: "Bản làm việc" },
  { key: "fact", label: "Fact-check", desc: "Claim → nguồn" },
  { key: "knowledge", label: "Knowledge", desc: "Metadata editorial" },
  { key: "hero", label: "Hero brief", desc: "Ảnh minh hoạ" },
] as const;

function LoadingSkeleton() {
  return (
    <AppShell title="Đang tải..." subtitle="Lấy dữ liệu bài viết" backHref="/dashboard">
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-2xl bg-[var(--surface-muted)]" />
        <div className="h-64 animate-pulse rounded-2xl bg-[var(--surface-muted)]" />
      </div>
    </AppShell>
  );
}

export default function ArticleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [id, setId] = useState<string>("");
  const [article, setArticle] = useState<Article | null>(null);
  const [tab, setTab] = useState<string>("clean");
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [genning, setGenning] = useState<"flux" | "qwen" | null>(null);
  const [heroError, setHeroError] = useState("");

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  const load = useCallback(async () => {
    if (!id) return;
    const res = await fetch(`/api/articles/${id}`);
    if (res.ok) {
      const data = (await res.json()) as { article: Article };
      setArticle(data.article);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function callAction(action: "run-step" | "reset" | "approve" | "publish") {
    if (!id) return;
    setRunning(true);
    setLog((prev) => [...prev, `→ ${action}...`]);

    const res = await fetch(`/api/articles/${id}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, notes: notes || undefined }),
    });

    const data = (await res.json()) as { article?: Article; error?: string };
    setRunning(false);

    if (!res.ok) {
      setLog((prev) => [...prev, `✗ ${data.error ?? "Lỗi"}`]);
      await load();
      return;
    }

    if (data.article) {
      setArticle(data.article);
      setLog((prev) => [
        ...prev,
        `✓ ${data.article!.status}${data.article!.currentStep ? ` · ${STEP_LABELS[data.article!.currentStep]}` : ""}`,
      ]);
    }
  }

  async function runFullPipeline() {
    if (!article) return;
    let safety = 0;
    let current = article;

    while (
      safety < 6 &&
      current.status !== "PUBLISH_READY" &&
      current.status !== "FAILED" &&
      current.status !== "PUBLISHED"
    ) {
      safety += 1;
      await callAction("run-step");
      const res = await fetch(`/api/articles/${id}`);
      const data = (await res.json()) as { article: Article };
      current = data.article;
      setArticle(current);
      if (current.status === "FAILED" || current.status === "PUBLISH_READY") break;
    }
  }

  async function generateHero(model: "flux" | "qwen") {
    if (!id) return;
    setGenning(model);
    setHeroError("");
    setLog((prev) => [...prev, `→ gen hero (${model})...`]);

    const res = await fetch(`/api/articles/${id}/hero`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    const data = (await res.json()) as { article?: Article; error?: string; hero?: { modelLabel: string } };
    setGenning(null);

    if (!res.ok) {
      setHeroError(data.error ?? "Gen ảnh thất bại");
      setLog((prev) => [...prev, `✗ hero ${model}: ${data.error ?? "lỗi"}`]);
      return;
    }

    if (data.article) {
      setArticle(data.article);
      setTab("clean");
      setLog((prev) => [...prev, `✓ hero ${data.hero?.modelLabel ?? model}`]);
    }
  }

  if (!article) return <LoadingSkeleton />;

  const contentMap: Record<string, string | null> = {
    clean: article.cleanPublish
      ? prepareReaderContent(article.cleanPublish, {
          stripLeadingHeroImage: Boolean(article.heroImageUrl),
          stripHeroBriefSection: true,
        })
      : null,
    research: article.researchBrief,
    insight: article.insightGate,
    draft: article.draft12,
    fact: article.factCheck,
    knowledge: article.knowledgeRecord,
    hero: article.heroBrief,
  };

  const activeTab = TABS.find((t) => t.key === tab);
  const activeContent = contentMap[tab];

  return (
    <AppShell
      title={article.title || article.topic || "Bài mới"}
      subtitle={
        article.currentStep
          ? `Bước tiếp theo: ${STEP_LABELS[article.currentStep]}`
          : "Pipeline hoàn tất — sẵn sàng duyệt hoặc publish"
      }
      backHref="/dashboard"
      backLabel="Pipeline"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={article.status} />
          <DomainBadge domain={article.domain} />
          {(article.status === "PUBLISHED" || article.status === "APPROVED") && (
            <Link
              href={`/library/${article.id}`}
              className="rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)]"
            >
              Xem trong Thư viện →
            </Link>
          )}
        </div>
      }
    >
      {article.errorMessage && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          {article.errorMessage}
        </div>
      )}

      <section className="mb-6">
        <PipelineSteps currentStep={article.currentStep} status={article.status} />
      </section>

      <section className="mb-6 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={running || article.status === "PUBLISHED"}
          onClick={() => callAction("run-step")}
        >
          {running ? "Đang chạy..." : "Chạy 1 bước"}
        </Button>
        <Button
          size="sm"
          disabled={running || article.status === "PUBLISHED"}
          onClick={runFullPipeline}
        >
          Chạy full pipeline
        </Button>
        <Button variant="ghost" size="sm" disabled={running} onClick={() => callAction("reset")}>
          Reset pipeline
        </Button>
        {article.status !== "PUBLISHED" && (
          <Button
            variant="danger"
            size="sm"
            disabled={running}
            onClick={async () => {
              const label = article.title || article.topic || "bài này";
              if (!window.confirm(`Xoá pipeline “${label}”? Không hoàn tác được.`)) return;
              setRunning(true);
              const res = await fetch(`/api/articles/${id}`, { method: "DELETE" });
              setRunning(false);
              if (!res.ok) {
                const data = (await res.json().catch(() => ({}))) as { error?: string };
                setLog((prev) => [...prev, `✗ ${data.error ?? "Không xoá được"}`]);
                return;
              }
              router.push("/dashboard");
              router.refresh();
            }}
          >
            Xoá bài
          </Button>
        )}
      </section>

      <section className="mb-8 surface-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
              Hero image
            </p>
            <h2 className="mt-1 font-[family-name:var(--font-source-serif)] text-lg font-semibold">
              Gen ảnh minh họa (song song 2 model)
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Dùng Hero Brief từ Finalize. Flux qua NVIDIA · Qwen qua fal.ai.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!!genning || running}
              onClick={() => generateHero("flux")}
            >
              {genning === "flux" ? "Đang gen Flux..." : "Gen FLUX.1-dev"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!!genning || running}
              onClick={() => generateHero("qwen")}
            >
              {genning === "qwen" ? "Đang gen Qwen..." : "Gen Qwen-Image"}
            </Button>
          </div>
        </div>

        {heroError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
            {heroError}
          </div>
        )}

        {article.heroImageUrl ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={article.heroImageUrl}
              alt={article.heroImageAlt || "Hero"}
              className="w-full rounded-2xl border border-[var(--line)] object-cover"
            />
            <div className="text-sm text-[var(--ink-muted)]">
              <p>
                <span className="font-medium text-[var(--ink)]">Model:</span>{" "}
                {article.heroImageModel || "—"}
              </p>
              <p className="mt-2">
                <span className="font-medium text-[var(--ink)]">Alt:</span>{" "}
                {article.heroImageAlt || "—"}
              </p>
              {article.heroPromptUsed && (
                <p className="mt-3 rounded-xl bg-[var(--surface-muted)] p-3 text-xs leading-relaxed">
                  {article.heroPromptUsed}
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-[var(--ink-faint)]">
            Chưa có ảnh. Nên chạy Finalize trước để có Hero Brief chất lượng hơn.
          </p>
        )}
      </section>

      {(article.status === "PUBLISH_READY" || article.status === "APPROVED") && (
        <section className="mb-8 rounded-2xl border border-[rgba(180,83,9,0.2)] bg-[var(--warn-soft)] p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-[family-name:var(--font-source-serif)] text-lg font-semibold text-[var(--ink)]">
                Cổng duyệt
              </h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                AI-TFES dừng ở Publish Ready — người duyệt kiểm fact-check trước khi đăng.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <Label htmlFor="notes">Ghi chú reviewer</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Tuỳ chọn — strength, revision, lưu ý fact-check..."
              rows={3}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {article.status === "PUBLISH_READY" && (
              <Button variant="success" size="sm" disabled={running} onClick={() => callAction("approve")}>
                Duyệt (Approve)
              </Button>
            )}
            {(article.status === "APPROVED" || article.status === "PUBLISH_READY") && (
              <Button size="sm" disabled={running} onClick={() => callAction("publish")}>
                Publish nội bộ
              </Button>
            )}
          </div>
        </section>
      )}

      <section className="grid gap-5 lg:grid-cols-[240px_1fr]">
        <nav className="flex flex-row gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {TABS.map((t) => {
            const hasContent = Boolean(contentMap[t.key]);
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`min-w-[140px] rounded-2xl border px-3.5 py-3 text-left transition lg:min-w-0 ${
                  tab === t.key
                    ? "border-[var(--accent)] bg-white shadow-[0_0_0_4px_var(--accent-glow)]"
                    : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--line-strong)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-[var(--ink)]">{t.label}</span>
                  <span
                    className={`h-2 w-2 rounded-full ${hasContent ? "bg-[var(--accent)]" : "bg-[var(--line-strong)]"}`}
                  />
                </div>
                <p className="mt-0.5 text-[11px] text-[var(--ink-faint)]">{t.desc}</p>
              </button>
            );
          })}
        </nav>

        <article className="surface-card min-h-[420px] p-6 sm:p-8">
          {activeTab && (
            <header className="mb-6 border-b border-[var(--line)] pb-4">
              <h2 className="font-[family-name:var(--font-source-serif)] text-xl font-semibold text-[var(--ink)]">
                {activeTab.label}
              </h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">{activeTab.desc}</p>
            </header>
          )}

          {activeContent ? (
            <MarkdownView content={activeContent} />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm font-medium text-[var(--ink-muted)]">Chưa có nội dung</p>
              <p className="mt-1 max-w-sm text-xs text-[var(--ink-faint)]">
                Chạy pipeline để sinh {activeTab?.label.toLowerCase()}.
              </p>
              {article.status !== "PUBLISHED" && (
                <Button size="sm" className="mt-4" disabled={running} onClick={() => callAction("run-step")}>
                  Chạy bước tiếp theo
                </Button>
              )}
            </div>
          )}
        </article>
      </section>

      {log.length > 0 && (
        <section className="mt-6 surface-card p-5">
          <h3 className="text-sm font-semibold text-[var(--ink)]">Pipeline log</h3>
          <ul className="mt-3 space-y-1.5 font-mono text-xs text-[var(--ink-muted)]">
            {log.map((line, i) => (
              <li
                key={i}
                className={`rounded-lg px-2 py-1 ${line.startsWith("✗") ? "bg-[var(--danger-soft)] text-[var(--danger)]" : line.startsWith("✓") ? "bg-[var(--success-soft)] text-[var(--success)]" : ""}`}
              >
                {line}
              </li>
            ))}
          </ul>
        </section>
      )}
    </AppShell>
  );
}
