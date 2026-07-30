"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { MarkdownView } from "@/components/markdown-view";
import { PipelineRunPanel, type PipelineLogLine } from "@/components/pipeline-run-panel";
import { PipelineSteps } from "@/components/pipeline-steps";
import { DomainBadge, StatusBadge, STEP_HINTS, STEP_LABELS } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { prepareReaderContent } from "@/lib/publish-content";
import { stripPipelineMarks } from "@/lib/tfes/parser";

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
  { key: "research", label: "Nghiên cứu", desc: "Nguồn & trade-off" },
  { key: "insight", label: "Cổng Insight", desc: "Gate → Decision → Planning" },
  { key: "draft", label: "Bản nháp 12 phần", desc: "Bản làm việc" },
  { key: "fact", label: "Fact-check", desc: "Bước 9 · Claim → nguồn" },
  { key: "knowledge", label: "Review / Knowledge", desc: "Bước 8 → 10 metadata" },
  { key: "hero", label: "Hero brief", desc: "Ảnh minh hoạ" },
] as const;

function timeoutMessage(status: number): string {
  if (status === 504 || status === 408) {
    return "Timeout — bấm chạy bước lại (chu trình tách nhỏ từng bước).";
  }
  return `HTTP ${status}`;
}

function tabForArticle(a: Article): string {
  const clean = (a.cleanPublish ?? "").trim();
  const draft = stripPipelineMarks(a.draft12);
  if (clean.length >= 80) return "clean";
  if (draft.length >= 40) return "draft";
  if (a.factCheck) return "fact";
  if (a.insightGate) return "insight";
  if (a.researchBrief) return "research";
  return "research";
}

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

let logSeq = 0;

export default function ArticleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [id, setId] = useState<string>("");
  const [article, setArticle] = useState<Article | null>(null);
  const [tab, setTab] = useState<string>("clean");
  const [running, setRunning] = useState(false);
  const [runningLabel, setRunningLabel] = useState("");
  const [logs, setLogs] = useState<PipelineLogLine[]>([]);
  const [notes, setNotes] = useState("");
  const [genning, setGenning] = useState<"flux" | "qwen" | null>(null);
  const [heroError, setHeroError] = useState("");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  const pushLog = useCallback((level: PipelineLogLine["level"], text: string) => {
    logSeq += 1;
    setLogs((prev) => [
      ...prev,
      { id: `${Date.now()}-${logSeq}`, level, text, at: Date.now() },
    ]);
  }, []);

  const load = useCallback(async () => {
    if (!id) return null;
    const res = await fetch(`/api/articles/${id}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { article: Article };
    setArticle(data.article);
    return data.article;
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function callAction(
    action: "run-step" | "reset" | "approve" | "publish",
  ): Promise<Article | null> {
    if (!id) return null;

    const stepBefore = article?.currentStep ?? "RESEARCH";
    if (action === "run-step") {
      setRunningLabel(STEP_HINTS[stepBefore] || `Đang chạy ${STEP_LABELS[stepBefore] || stepBefore}`);
      pushLog("info", `→ Bắt đầu ${STEP_LABELS[stepBefore] || stepBefore}...`);
    } else {
      setRunningLabel(
        action === "reset"
          ? "Đang làm lại từ đầu..."
          : action === "approve"
            ? "Đang duyệt..."
            : "Đang đăng...",
      );
      pushLog("info", `→ ${action}...`);
    }

    setRunning(true);
    setActionError("");

    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(`/api/articles/${id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, notes: notes || undefined }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Mất kết nối tới server";
      setRunning(false);
      setRunningLabel("");
      setActionError(msg);
      pushLog("error", `✗ Không gọi được API: ${msg}`);
      return null;
    }

    let data: {
      article?: Article;
      error?: string;
      timings?: {
        searchMs?: number;
        llmMs?: number;
        searchHits?: number;
        searchQueries?: number;
        researchPhase?: string;
        insightPhase?: string;
        writePhase?: string;
        finalizePhase?: string;
      };
    } = {};
    try {
      data = (await res.json()) as typeof data;
    } catch {
      /* Vercel 504 thường trả HTML */
    }
    const elapsedSec = Math.round((Date.now() - started) / 1000);
    setRunning(false);
    setRunningLabel("");

    if (!res.ok) {
      const msg = data.error ?? timeoutMessage(res.status);
      setActionError(msg);
      pushLog("error", `✗ ${msg} (${elapsedSec}s)`);
      await load();
      return null;
    }

    if (!data.article) {
      pushLog("error", "✗ API không trả về article");
      return null;
    }

    const next = data.article;
    setArticle(next);

    if (next.status === "FAILED") {
      const msg = next.errorMessage || "Chu trình lỗi";
      setActionError(msg);
      pushLog("error", `✗ Lỗi · ${msg} (${elapsedSec}s)`);
      if (next.currentStep === "INSIGHT" || /Insight|Cổng Insight|Gate/i.test(msg)) {
        setTab("insight");
        pushLog(
          "warn",
          "→ Gate vẫn < L2 sau khi nghiên cứu lại. Đổi chủ đề hoặc Làm lại từ đầu.",
        );
      } else {
        setTab(tabForArticle(next));
      }
      return next;
    }

    const isGateRetry =
      Boolean(next.errorMessage) && /Gate < L2|nghiên cứu lại/i.test(next.errorMessage || "");

    if (isGateRetry && action === "run-step") {
      setActionError(next.errorMessage || "");
      pushLog("warn", `⚠ ${next.errorMessage} (${elapsedSec}s)`);
      pushLog("info", "→ Quay bước Research (Tavily + Verify/Synth) với góc sắc hơn");
      setTab("research");
      return next;
    }

    if (next.errorMessage && action === "run-step") {
      setActionError(next.errorMessage);
      pushLog("warn", `⚠ ${next.errorMessage} (${elapsedSec}s)`);
      setTab(tabForArticle(next));
      return next;
    }

    if (action === "run-step") {
      const phase = data.timings?.researchPhase;
      const insightPhase = data.timings?.insightPhase;
      const writePhase = data.timings?.writePhase;
      const finalizePhase = data.timings?.finalizePhase;
      const finished =
        phase === "search"
          ? "1–2 · Memory + Research (Tavily)"
          : phase === "llm"
            ? "3–4 · Verification + Synthesis"
            : insightPhase === "gate-retry"
              ? "Gate < L2 → Research lại"
              : insightPhase === "gate" || insightPhase === "gate-fail"
                ? "Gate · Insight L2"
                : insightPhase === "decision"
                  ? "5 · Editorial Decision"
                  : insightPhase === "planning"
                    ? "6 · Planning"
                    : writePhase === "a"
                      ? "7 · Writing nửa đầu"
                      : writePhase === "b"
                        ? "7 · Writing nửa sau"
                        : finalizePhase === "review"
                          ? "8 · Review"
                          : finalizePhase === "fact" || finalizePhase === "a"
                            ? "9 · Fact Check"
                            : finalizePhase === "publish" || finalizePhase === "b"
                              ? "10 · Publish Ready"
                              : finalizePhase === "self-check-fail"
                                ? "10 · Self-check"
                                : STEP_LABELS[stepBefore] || stepBefore;
      if (phase === "search" && data.timings) {
        const s = Math.round((data.timings.searchMs || 0) / 1000);
        pushLog(
          "info",
          `·· Tavily ${data.timings.searchQueries ?? "?"} query · ${data.timings.searchHits ?? "?"} hits · ${s}s (bước tiếp: Verify + Synth)`,
        );
      } else if (phase === "llm" && data.timings) {
        const l = Math.round((data.timings.llmMs || 0) / 1000);
        pushLog("info", `·· Verification + Synthesis → Research Brief · ${l}s`);
      } else if (data.timings?.llmMs != null) {
        pushLog("info", `·· NVIDIA · ${Math.round((data.timings.llmMs || 0) / 1000)}s`);
      }
      if (next.status === "PUBLISH_READY") {
        pushLog("success", `✓ Xong ${finished} → Chờ duyệt (PUBLISH_READY) · ${elapsedSec}s`);
      } else if (
        phase === "search" ||
        insightPhase === "gate" ||
        insightPhase === "decision" ||
        writePhase === "a" ||
        finalizePhase === "review" ||
        finalizePhase === "fact" ||
        finalizePhase === "a"
      ) {
        pushLog("success", `✓ Xong ${finished} · còn phase tiếp · ${elapsedSec}s`);
      } else {
        pushLog(
          "success",
          `✓ Xong ${finished} · bước tới: ${next.currentStep ? STEP_LABELS[next.currentStep] : "—"} · ${elapsedSec}s`,
        );
      }
      setTab(tabForArticle(next));
    } else if (action === "reset") {
      pushLog("warn", `✓ Đã làm lại từ đầu (${elapsedSec}s)`);
      setActionError("");
    } else {
      pushLog("success", `✓ ${action} → ${next.status} (${elapsedSec}s)`);
    }

    return next;
  }

  async function runFullPipeline() {
    if (!article || !id) return;
    setActionError("");
    pushLog("info", "→ Chạy cả chu trình AI-TFES (10 bước + Gate)...");

    let safety = 0;
    let current = article;

    while (
      safety < 24 &&
      current.status !== "PUBLISH_READY" &&
      current.status !== "FAILED" &&
      current.status !== "PUBLISHED" &&
      current.status !== "APPROVED"
    ) {
      safety += 1;
      const next = await callAction("run-step");
      if (!next) {
        pushLog("error", "✗ Dừng chu trình vì lỗi mạng/API — bấm lại để tiếp tục");
        break;
      }
      current = next;
      const softRetry =
        Boolean(current.errorMessage) &&
        /Gate < L2|nghiên cứu lại/i.test(current.errorMessage || "");
      if (current.status === "FAILED" || current.status === "PUBLISH_READY") break;
      // Self-check fail cứng (DRAFT + error) dừng; gate-retry thì tiếp tục
      if (current.errorMessage && !softRetry) break;
    }

    if (current.status === "PUBLISH_READY") {
      pushLog("success", "✓ Chu trình xong — xem Bản sạch / Bản nháp 12 phần");
    } else if (current.status === "FAILED") {
      pushLog(
        "error",
        current.currentStep === "INSIGHT" || /Insight|Cổng Insight|Gate|Self-check/i.test(current.errorMessage || "")
          ? "✗ Dừng ở cổng chất lượng (Gate/Self-check). Xem log · đổi góc hoặc Làm lại từ đầu."
          : "✗ Chu trình dừng vì lỗi",
      );
      if (current.errorMessage && current.status !== "FAILED") {
        pushLog("warn", `⚠ ${current.errorMessage}`);
      }
    } else if (
      current.errorMessage &&
      /Gate < L2|nghiên cứu lại/i.test(current.errorMessage)
    ) {
      pushLog("warn", `⚠ ${current.errorMessage} — bấm tiếp để Research lại`);
    }
  }

  async function generateHero(model: "flux" | "qwen") {
    if (!id) return;
    setGenning(model);
    setHeroError("");
    pushLog("info", `→ Gen hero (${model})...`);

    const started = Date.now();
    const res = await fetch(`/api/articles/${id}/hero`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    const data = (await res.json()) as { article?: Article; error?: string; hero?: { modelLabel: string } };
    setGenning(null);
    const sec = Math.round((Date.now() - started) / 1000);

    if (!res.ok) {
      setHeroError(data.error ?? "Gen ảnh thất bại");
      pushLog("error", `✗ hero ${model}: ${data.error ?? "lỗi"} (${sec}s)`);
      return;
    }

    if (data.article) {
      setArticle(data.article);
      setTab("clean");
      pushLog("success", `✓ hero ${data.hero?.modelLabel ?? model} (${sec}s)`);
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
    research: article.researchBrief?.includes("<!--TFES_SEARCH_BLOB-->")
      ? "Đã có kết quả Tavily (blob). Chạy bước Research lần 2 để GLM/Llama viết Research Brief."
      : article.researchBrief,
    insight: article.insightGate,
    draft: article.draft12
      ? prepareReaderContent(stripPipelineMarks(article.draft12), {
          stripLeadingHeroImage: true,
          stripHeroBriefSection: true,
        })
      : null,
    fact: article.factCheck,
    knowledge: article.knowledgeRecord
      ? stripPipelineMarks(article.knowledgeRecord)
      : null,
    hero: article.heroBrief,
  };

  const activeTab = TABS.find((t) => t.key === tab);
  const activeContent = contentMap[tab];
  const displayError = actionError || article.errorMessage;

  return (
    <AppShell
      title={article.title || article.topic || "Bài mới"}
      subtitle={
        running
          ? runningLabel
          : article.currentStep
            ? `Bước tiếp theo: ${STEP_LABELS[article.currentStep]}`
            : "Chu trình xong — sẵn sàng duyệt hoặc đăng"
      }
      backHref="/dashboard"
      backLabel="Biên tập"
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
      <section className="mb-6">
        <PipelineSteps article={article} running={running} />
      </section>

      <PipelineRunPanel
        running={running}
        runningLabel={runningLabel}
        status={article.status}
        currentStepLabel={article.currentStep ? STEP_LABELS[article.currentStep] : null}
        errorMessage={displayError}
        logs={logs}
        onClear={() => setLogs([])}
      />

      <section className="mb-6 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={running || article.status === "PUBLISHED"}
          onClick={() => callAction("run-step")}
        >
          {running ? "Đang chạy..." : "Chạy bước tiếp"}
        </Button>
        <Button
          size="sm"
          disabled={running || article.status === "PUBLISHED"}
          onClick={runFullPipeline}
        >
          Chạy cả chu trình
        </Button>
        <Button variant="ghost" size="sm" disabled={running} onClick={() => callAction("reset")}>
          Làm lại từ đầu
        </Button>
        {article.status !== "PUBLISHED" && (
          <Button
            variant="danger"
            size="sm"
            disabled={running}
            onClick={async () => {
              const label = article.title || article.topic || "bài này";
              if (!window.confirm(`Xoá bài “${label}”? Không hoàn tác được.`)) return;
              setRunning(true);
              setRunningLabel("Đang xoá bài...");
              const res = await fetch(`/api/articles/${id}`, { method: "DELETE" });
              setRunning(false);
              setRunningLabel("");
              if (!res.ok) {
                const data = (await res.json().catch(() => ({}))) as { error?: string };
                pushLog("error", `✗ ${data.error ?? "Không xoá được"}`);
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
            <Button size="sm" disabled={!!genning || running} onClick={() => generateHero("flux")}>
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
                Chạy chu trình để sinh {activeTab?.label.toLowerCase()}.
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
    </AppShell>
  );
}
