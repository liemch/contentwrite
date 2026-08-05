"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { parseEditorialFindings } from "@/lib/tfes/human-review";
import {
  GOLD_BAR_CHECK_LABELS,
  inspectEngineeringGoldBar,
  type GoldBarCheckId,
} from "@/lib/tfes/engineering-gold-bar";

const SCORE_LABELS: Record<number, string> = {
  1: "Yếu — nên sửa / rewrite trước khi đăng",
  2: "Còn lệch — đăng sẽ làm loãng thư viện",
  3: "Ổn đăng — đúng bar tối thiểu",
  4: "Hay — gần gold sample, đáng giữ",
  5: "Đáng bookmark — nuôi memory / gold",
};

type ApproveGateProps = {
  hasHero: boolean;
  running: boolean;
  notes: string;
  onNotesChange: (value: string) => void;
  knowledgeRecord?: string | null;
  domain?: string | null;
  cleanPublish?: string | null;
  researchBrief?: string | null;
  onApprove: (opts: {
    allowWithoutHero?: boolean;
    editorialScore: number;
    checklist?: string[];
    reviewFindingsAck?: string[];
    goldBarOverride?: boolean;
  }) => void | Promise<void>;
  onPublish: () => void | Promise<void>;
  status: "PUBLISH_READY" | "APPROVED" | string;
};

export function ApproveGate({
  hasHero,
  running,
  notes,
  onNotesChange,
  knowledgeRecord,
  domain,
  cleanPublish,
  researchBrief,
  onApprove,
  onPublish,
  status,
}: ApproveGateProps) {
  const [reviewAck, setReviewAck] = useState<Record<string, boolean>>({});
  const [goldAck, setGoldAck] = useState<Record<string, boolean>>({});
  const [goldBarOverride, setGoldBarOverride] = useState(false);
  const [score, setScore] = useState<number>(0);

  const findings = useMemo(
    () => parseEditorialFindings(knowledgeRecord),
    [knowledgeRecord],
  );

  const goldBar = useMemo(
    () =>
      inspectEngineeringGoldBar({
        domain,
        body: cleanPublish,
        researchBrief,
      }),
    [domain, cleanPublish, researchBrief],
  );

  const goldFailures = goldBar.applicable ? goldBar.failures : [];
  const goldNeedsAttention = goldFailures.length > 0;
  const allGoldAck =
    !goldNeedsAttention || goldFailures.every((f) => goldAck[f.id]);
  const overrideNotesOk = !goldBarOverride || notes.trim().length >= 20;

  const allFindingsAck =
    findings.length === 0 || findings.every((f) => reviewAck[f.id]);
  const notesOk =
    (score >= 3 || notes.trim().length >= 8) && overrideNotesOk;
  // Khi còn fail: phải override + ack từng mục + ghi chú
  const goldGateOk =
    !goldNeedsAttention || (goldBarOverride && allGoldAck && overrideNotesOk);
  const canApprove =
    allFindingsAck &&
    goldGateOk &&
    score >= 1 &&
    score <= 5 &&
    notesOk &&
    !running;

  function toggleFinding(id: string) {
    setReviewAck((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleGold(id: GoldBarCheckId) {
    setGoldAck((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function submit(allowWithoutHero?: boolean) {
    if (!allFindingsAck || !goldGateOk || score < 1 || score > 5 || !notesOk) return;
    void onApprove({
      allowWithoutHero,
      editorialScore: score,
      reviewFindingsAck: findings.filter((f) => reviewAck[f.id]).map((f) => f.id),
      goldBarOverride: goldNeedsAttention ? goldBarOverride : undefined,
      checklist: goldFailures.filter((f) => goldAck[f.id]).map((f) => f.id),
    });
  }

  return (
    <section className="mb-8 rounded-2xl border border-[rgba(180,83,9,0.2)] bg-[var(--warn-soft)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-source-serif)] text-lg font-semibold text-[var(--ink)]">
            Cổng duyệt
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Quyết định thật: chấm điểm + (nếu có) đối chiếu Review AI
            {goldBar.applicable ? " + chuẩn vàng draft" : ""}. Hook / case / fact đã do
            pipeline + tab Fact chặn trước.
          </p>
        </div>
      </div>

      {status === "PUBLISH_READY" && (
        <>
          {!hasHero && (
            <div className="mt-4 rounded-xl border border-[rgba(180,83,9,0.35)] bg-white/60 px-3.5 py-3 text-sm text-[var(--ink)]">
              Chưa có hero image — gen FLUX/Qwen ở panel trên trước khi duyệt (hoặc Duyệt không
              ảnh).
            </div>
          )}

          {goldBar.applicable && goldNeedsAttention && (
            <div className="mt-5 space-y-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
                Chuẩn vàng draft — chưa đạt ({goldFailures.length})
              </p>
              <p className="text-xs text-[var(--ink-muted)]">
                Sửa bản sạch (Polish) rồi duyệt lại, hoặc tick từng mục + Override kèm ghi chú ≥20
                ký tự.
              </p>
              {goldFailures.map((f) => (
                <label
                  key={f.id}
                  className="flex cursor-pointer gap-3 rounded-xl border border-[var(--line)] bg-white/80 px-3.5 py-3 transition hover:border-[var(--line-strong)]"
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-[var(--accent)]"
                    checked={Boolean(goldAck[f.id])}
                    onChange={() => toggleGold(f.id)}
                    disabled={running}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[var(--ink)]">
                      {GOLD_BAR_CHECK_LABELS[f.id]}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--ink-faint)]">{f.message}</span>
                  </span>
                </label>
              ))}
              <label className="mt-2 flex cursor-pointer items-start gap-3 rounded-xl border border-[rgba(180,83,9,0.35)] bg-white/70 px-3.5 py-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-[var(--accent)]"
                  checked={goldBarOverride}
                  onChange={(e) => setGoldBarOverride(e.target.checked)}
                  disabled={running || !allGoldAck}
                />
                <span className="text-sm text-[var(--ink)]">
                  Override — vẫn duyệt dù chưa đạt chuẩn vàng (bắt buộc ghi chú ≥20 ký tự)
                </span>
              </label>
            </div>
          )}

          {goldBar.applicable && !goldNeedsAttention && (
            <p className="mt-4 text-xs font-medium text-[var(--success,#166534)]">
              Chuẩn vàng draft: đạt (máy)
            </p>
          )}

          {findings.length > 0 && (
            <div className="mt-5 space-y-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
                Còn góp ý Review AI — anh xác nhận đã ổn trên bản sạch ({findings.length})
              </p>
              {findings.map((f) => (
                <label
                  key={f.id}
                  className="flex cursor-pointer gap-3 rounded-xl border border-[var(--line)] bg-white/80 px-3.5 py-3 transition hover:border-[var(--line-strong)]"
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-[var(--accent)]"
                    checked={Boolean(reviewAck[f.id])}
                    onChange={() => toggleFinding(f.id)}
                    disabled={running}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[var(--ink)]">{f.label}</span>
                    <span className="mt-0.5 block text-xs text-[var(--ink-faint)]">
                      Tick khi đã sửa trên bản sạch hoặc chủ đích giữ nguyên
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}

          <div className="mt-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
              Điểm biên tập (bắt buộc)
            </p>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">
              Đây là quyết định chính — nuôi Memory / gold_samples khi ≥4.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={running}
                  onClick={() => setScore(n)}
                  className={`min-w-10 rounded-full px-3 py-2 text-sm font-semibold transition ${
                    score === n
                      ? "bg-[var(--ink)] text-white shadow-sm"
                      : "bg-white/80 text-[var(--ink-muted)] ring-1 ring-[var(--line)] hover:text-[var(--ink)]"
                  }`}
                  aria-label={`Điểm ${n}`}
                >
                  {n}
                </button>
              ))}
            </div>
            {score >= 1 && (
              <p className="mt-2 text-sm font-medium text-[var(--ink)]">{SCORE_LABELS[score]}</p>
            )}
          </div>
        </>
      )}

      <div className="mt-4">
        <Label htmlFor="notes">
          Ghi chú reviewer
          {goldBarOverride
            ? " (bắt buộc ≥20 ký tự khi Override chuẩn vàng)"
            : score > 0 && score <= 2
              ? " (bắt buộc khi điểm ≤2)"
              : " (tuỳ chọn)"}
        </Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder={
            goldBarOverride
              ? "Vì sao vẫn duyệt dù chưa đạt chuẩn vàng draft?"
              : score > 0 && score <= 2
                ? "Vì sao điểm thấp — cần sửa gì trước khi đăng?"
                : "Strength / lý do điểm / lưu ý cho lần sau…"
          }
          rows={3}
          disabled={running}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {status === "PUBLISH_READY" && (
          <>
            <Button
              variant="success"
              size="sm"
              busy={running}
              disabled={!canApprove || !hasHero || !goldGateOk}
              onClick={() => submit(false)}
              title={
                !allFindingsAck
                  ? "Tick đủ điểm Review AI còn sót"
                  : goldNeedsAttention && !goldBarOverride
                    ? "Sửa bản sạch hoặc tick Override chuẩn vàng"
                    : !goldGateOk
                      ? "Tick đủ mục GOLD_BAR + ghi chú override"
                      : score < 1
                        ? "Chọn điểm 1–5"
                        : !notesOk
                          ? "Ghi chú chưa đủ"
                          : hasHero
                            ? "Duyệt bài có hero"
                            : "Gen hero trước, hoặc dùng «Duyệt không ảnh»"
              }
            >
              {running ? "Đang duyệt..." : "Duyệt (Approve)"}
            </Button>
            {!hasHero && (
              <Button
                variant="secondary"
                size="sm"
                busy={running}
                disabled={!canApprove || !goldGateOk}
                onClick={() => {
                  if (
                    !window.confirm(
                      "Duyệt không có hero image? Bài trong thư viện sẽ thiếu ảnh minh họa.",
                    )
                  ) {
                    return;
                  }
                  submit(true);
                }}
              >
                Duyệt không ảnh
              </Button>
            )}
          </>
        )}
        {status === "APPROVED" && (
          <Button size="sm" busy={running} disabled={running} onClick={() => void onPublish()}>
            {running ? "Đang đăng..." : "Publish nội bộ"}
          </Button>
        )}
      </div>

      {status === "PUBLISH_READY" && (!canApprove || score < 1 || !goldGateOk) && (
        <p className="mt-3 text-xs text-[var(--warm)]">
          {goldNeedsAttention && !goldBarOverride
            ? `Chuẩn vàng draft còn ${goldFailures.length} mục — sửa bản sạch hoặc Override.`
            : goldBarOverride && !allGoldAck
              ? "Tick xác nhận từng mục chuẩn vàng trước khi Override."
              : goldBarOverride && !overrideNotesOk
                ? "Override cần ghi chú ≥20 ký tự."
                : !allFindingsAck
                  ? `Còn ${findings.filter((f) => !reviewAck[f.id]).length} góp ý Review chưa xác nhận.`
                  : score < 1
                    ? "Chọn điểm biên tập 1–5 — đây là quyết định duyệt."
                    : !notesOk
                      ? "Điểm ≤2 cần ghi chú ngắn (vì sao / cần sửa gì)."
                      : null}
        </p>
      )}
      {status === "APPROVED" && (
        <p className="mt-3 text-xs text-[var(--ink-muted)]">
          Đã duyệt — Publish để đưa vào Thư viện (chỉ bài Published).
        </p>
      )}
    </section>
  );
}
