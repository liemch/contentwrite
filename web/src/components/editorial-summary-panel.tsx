"use client";

import { useMemo } from "react";
import {
  extractHumanReviewSection,
  isAwaitingHumanReview,
  parseEditorialFindings,
} from "@/lib/tfes/human-review";
import { extractEditorialReview, READER_SIM_DONE_MARK } from "@/lib/tfes/parser";

type EditorialSummaryPanelProps = {
  article: {
    status: string;
    workflowState: string;
    knowledgeRecord?: string | null;
    factCheck?: string | null;
    reviewerNotes?: string | null;
    approvedAt?: string | Date | null;
    publishedAt?: string | Date | null;
  };
};

export function EditorialSummaryPanel({ article }: EditorialSummaryPanelProps) {
  const findings = useMemo(
    () => parseEditorialFindings(article.knowledgeRecord),
    [article.knowledgeRecord],
  );
  const humanSection = useMemo(
    () => extractHumanReviewSection(article.knowledgeRecord),
    [article.knowledgeRecord],
  );
  const reviewExcerpt = useMemo(() => {
    const full = extractEditorialReview(article.knowledgeRecord);
    if (!full) return "";
    return full.length > 900 ? `${full.slice(0, 900)}…` : full;
  }, [article.knowledgeRecord]);

  const awaiting = isAwaitingHumanReview(article);
  const hasReaderSim = (article.knowledgeRecord ?? "").includes(READER_SIM_DONE_MARK);
  const factPreview = (article.factCheck ?? "").trim();

  const stageLabel = awaiting
    ? "Đang chờ anh chốt Review"
    : article.workflowState === "PUBLISHED"
      ? "Đã publish"
      : article.workflowState === "APPROVED"
        ? "Đã duyệt — chờ Publish"
        : article.workflowState === "PUBLISH_READY"
          ? "Publish Ready — mở Cổng duyệt"
          : factPreview
            ? "Đã qua Review người · đang / đã Fact-check"
            : "Chưa tới bước Review người";

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--ink-muted)]">
        Một màn nhìn nhanh: AI góp ý gì, anh đã chốt ra sao, Fact / duyệt tới đâu — không phải tab
        ảnh.
      </p>

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)]/50 px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
          Trạng thái biên tập
        </p>
        <p className="mt-1 text-sm font-medium text-[var(--ink)]">{stageLabel}</p>
        {article.reviewerNotes?.trim() && (
          <pre className="mt-3 whitespace-pre-wrap border-t border-[var(--line)] pt-3 text-xs leading-relaxed text-[var(--ink-muted)]">
            {article.reviewerNotes.trim()}
          </pre>
        )}
      </div>

      <section>
        <h3 className="text-sm font-semibold text-[var(--ink)]">
          Góp ý AI Review ({findings.length || "—"})
        </h3>
        {findings.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {findings.map((f) => (
              <li
                key={f.id}
                className="rounded-xl border border-[var(--line)] bg-white/70 px-3 py-2 text-sm text-[var(--ink-muted)]"
              >
                {f.label}
              </li>
            ))}
          </ul>
        ) : reviewExcerpt ? (
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--line)] bg-white/70 p-3 text-xs text-[var(--ink-muted)]">
            {reviewExcerpt}
          </pre>
        ) : (
          <p className="mt-2 text-sm text-[var(--ink-faint)]">Chưa có Review AI.</p>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-[var(--ink)]">Anh đã chốt (Human Review)</h3>
        {humanSection ? (
          <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-[var(--line)] bg-white/70 p-3 text-xs leading-relaxed text-[var(--ink-muted)]">
            {humanSection}
          </pre>
        ) : awaiting ? (
          <p className="mt-2 text-sm text-[var(--warm)]">
            Chưa chốt — dùng panel «Chốt Review» phía trên trang.
          </p>
        ) : (
          <p className="mt-2 text-sm text-[var(--ink-faint)]">Chưa có xác nhận người (hoặc bài cũ).</p>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-[var(--ink)]">Fact-check</h3>
        {factPreview ? (
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--line)] bg-white/70 p-3 text-xs text-[var(--ink-muted)]">
            {factPreview.length > 800 ? `${factPreview.slice(0, 800)}…` : factPreview}
          </pre>
        ) : (
          <p className="mt-2 text-sm text-[var(--ink-faint)]">Chưa chạy Fact-check.</p>
        )}
      </section>

      <section className="flex flex-wrap gap-2 text-[11px]">
        <Chip ok={hasReaderSim} label="Reader Sim" />
        <Chip
          ok={["APPROVED", "PUBLISHED"].includes(article.workflowState)}
          label="Approve"
        />
        <Chip ok={article.workflowState === "PUBLISHED"} label="Published" />
      </section>
    </div>
  );
}

function Chip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 font-semibold ${
        ok
          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
          : "bg-[var(--surface-muted)] text-[var(--ink-faint)]"
      }`}
    >
      {ok ? "✓" : "·"} {label}
    </span>
  );
}
