"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { parseEditorialFindings } from "@/lib/tfes/human-review";

export const APPROVE_CHECKLIST = [
  {
    id: "hook",
    label: "Hook kéo ~15 giây",
    hint: "Cảnh hoặc nghịch lý — không mở giáo trình / “Trong bối cảnh…”",
  },
  {
    id: "case",
    label: "Có mini-case cụ thể",
    hint: "Pipeline / stage / incident / họp / quyết định có hậu quả",
  },
  {
    id: "guardrail",
    label: "Có điều kiện không áp dụng",
    hint: "“Không nên / chỉ khi / không phù hợp khi…” rõ ràng",
  },
  {
    id: "insight",
    label: "Insight không hiển nhiên với senior",
    hint: "Không chỉ tóm best practice phổ biến",
  },
  {
    id: "facts",
    label: "Fact-check ổn",
    hint: "Không còn claim FAIL nặng / số liệu nghi bịa",
  },
] as const;

type ApproveGateProps = {
  hasHero: boolean;
  running: boolean;
  notes: string;
  onNotesChange: (value: string) => void;
  knowledgeRecord?: string | null;
  onApprove: (opts: {
    allowWithoutHero?: boolean;
    editorialScore: number;
    checklist: string[];
    reviewFindingsAck?: string[];
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
  onApprove,
  onPublish,
  status,
}: ApproveGateProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [reviewAck, setReviewAck] = useState<Record<string, boolean>>({});
  const [score, setScore] = useState<number>(0);

  const findings = useMemo(
    () => parseEditorialFindings(knowledgeRecord),
    [knowledgeRecord],
  );

  const allChecked = useMemo(
    () => APPROVE_CHECKLIST.every((item) => checked[item.id]),
    [checked],
  );
  const allFindingsAck =
    findings.length === 0 || findings.every((f) => reviewAck[f.id]);
  const canApprove =
    allChecked && allFindingsAck && score >= 1 && score <= 5 && !running;

  function toggle(id: string) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleFinding(id: string) {
    setReviewAck((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function submit(allowWithoutHero?: boolean) {
    if (!allChecked || score < 1 || !allFindingsAck) return;
    void onApprove({
      allowWithoutHero,
      editorialScore: score,
      checklist: APPROVE_CHECKLIST.filter((i) => checked[i.id]).map((i) => i.id),
      reviewFindingsAck: findings.filter((f) => reviewAck[f.id]).map((f) => f.id),
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
            Checklist nhanh + điểm 1–5 trước khi Approve / Publish. Đối chiếu lại góp ý Review AI.
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

          {findings.length > 0 && (
            <div className="mt-5 space-y-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
                Đối chiếu Review AI ({findings.length})
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
                    <span className="block text-sm font-medium text-[var(--ink)]">
                      Điểm này đã ổn trên bản sạch: {f.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--ink-faint)]">
                      Tick khi anh thấy AI đã xử lý hoặc anh chủ đích giữ nguyên
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}

          <div className="mt-5 space-y-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
              Checklist biên tập
            </p>
            {APPROVE_CHECKLIST.map((item) => (
              <label
                key={item.id}
                className="flex cursor-pointer gap-3 rounded-xl border border-[var(--line)] bg-white/80 px-3.5 py-3 transition hover:border-[var(--line-strong)]"
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-[var(--accent)]"
                  checked={Boolean(checked[item.id])}
                  onChange={() => toggle(item.id)}
                  disabled={running}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[var(--ink)]">{item.label}</span>
                  <span className="mt-0.5 block text-xs text-[var(--ink-faint)]">{item.hint}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="mt-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
              Điểm biên tập (1–5)
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={running}
                  onClick={() => setScore(n)}
                  className={`h-10 w-10 rounded-full text-sm font-semibold transition ${
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
            <p className="mt-2 text-xs text-[var(--ink-faint)]">
              5 = đáng bookmark · 3 = ổn đăng · 1–2 = nên sửa trước khi publish
            </p>
          </div>
        </>
      )}

      <div className="mt-4">
        <Label htmlFor="notes">Ghi chú reviewer</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Tuỳ chọn — strength, revision, lưu ý fact-check..."
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
              disabled={!canApprove || !hasHero}
              onClick={() => submit(false)}
              title={
                !allFindingsAck
                  ? "Tick đủ điểm Review AI"
                  : !allChecked
                    ? "Tick đủ checklist"
                    : score < 1
                      ? "Chọn điểm 1–5"
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
                disabled={!canApprove}
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

      {status === "PUBLISH_READY" && (!allChecked || score < 1 || !allFindingsAck) && (
        <p className="mt-3 text-xs text-[var(--warm)]">
          {!allFindingsAck
            ? `Tick đủ ${findings.length} điểm Review AI, checklist và chọn điểm trước khi duyệt.`
            : `Tick đủ ${APPROVE_CHECKLIST.length} mục và chọn điểm trước khi duyệt.`}
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
