"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import {
  parseEditorialFindings,
  type EditorialFinding,
  type HumanReviewDisposition,
  type HumanReviewItem,
} from "@/lib/tfes/human-review";
import { extractEditorialReview } from "@/lib/tfes/parser";

type HumanReviewGateProps = {
  knowledgeRecord: string | null | undefined;
  running: boolean;
  onConfirm: (payload: {
    items: HumanReviewItem[];
    notes: string;
  }) => void | Promise<void>;
};

export function HumanReviewGate({
  knowledgeRecord,
  running,
  onConfirm,
}: HumanReviewGateProps) {
  const findings = useMemo(
    () => parseEditorialFindings(knowledgeRecord),
    [knowledgeRecord],
  );
  const reviewText = useMemo(
    () => extractEditorialReview(knowledgeRecord),
    [knowledgeRecord],
  );

  const [dispos, setDispos] = useState<Record<string, HumanReviewDisposition | "">>(
    {},
  );
  const [notes, setNotes] = useState("");
  const [showFull, setShowFull] = useState(false);

  const allResolved =
    findings.length === 0 ||
    findings.every((f) => dispos[f.id] === "fixed" || dispos[f.id] === "accept");

  const canSubmit = allResolved && !running;

  function setDisposition(id: string, value: HumanReviewDisposition) {
    setDispos((prev) => ({ ...prev, [id]: value }));
  }

  function submit() {
    if (!canSubmit) return;
    const items: HumanReviewItem[] =
      findings.length > 0
        ? findings.map((f) => ({
            id: f.id,
            disposition: (dispos[f.id] || "accept") as HumanReviewDisposition,
          }))
        : [{ id: "ack-pass", disposition: "fixed", note: "Review AI không có Fail rõ — đã đọc" }];
    void onConfirm({ items, notes });
  }

  return (
    <section className="mb-8 rounded-2xl border border-[rgba(14,116,144,0.25)] bg-[rgba(14,116,144,0.06)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-source-serif)] text-lg font-semibold text-[var(--ink)]">
            Xác nhận Review (người)
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            AI đã tự review — anh xác nhận từng Fail / Revision trước khi Fact-check tiếp.
          </p>
        </div>
        <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-muted)] ring-1 ring-[var(--line)]">
          Bước 8 → người
        </span>
      </div>

      {findings.length > 0 ? (
        <div className="mt-5 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
            Điểm AI đánh dấu ({findings.length})
          </p>
          {findings.map((f) => (
            <FindingRow
              key={f.id}
              finding={f}
              value={dispos[f.id] || ""}
              disabled={running}
              onChange={(v) => setDisposition(f.id, v)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-[var(--line)] bg-white/70 px-3.5 py-3 text-sm text-[var(--ink-muted)]">
          Không tách được Fail cụ thể từ Review AI — đọc nhanh bản Review bên dưới rồi xác nhận
          để tiếp tục.
        </div>
      )}

      <div className="mt-4">
        <button
          type="button"
          className="text-xs font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
          onClick={() => setShowFull((v) => !v)}
        >
          {showFull ? "Ẩn Review AI" : "Xem Review AI đầy đủ"}
        </button>
        {showFull && (
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--line)] bg-white/80 p-3 text-xs leading-relaxed text-[var(--ink-muted)]">
            {reviewText || "(trống)"}
          </pre>
        )}
      </div>

      <div className="mt-4">
        <Label htmlFor="human-review-notes">Ghi chú cho Fact-check / Polish</Label>
        <Textarea
          id="human-review-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Vd. Fail G3 đã bổ sung URL; chấp nhận N2 vì shape essay…"
          rows={3}
          disabled={running}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="success"
          size="sm"
          busy={running}
          disabled={!canSubmit}
          onClick={submit}
          title={!allResolved ? "Xác nhận hết các điểm Fail/Revision" : "Tiếp tục Fact-check"}
        >
          {running ? "Đang lưu..." : "Xác nhận & chạy Fact-check"}
        </Button>
      </div>

      {!allResolved && (
        <p className="mt-3 text-xs text-[var(--warm)]">
          Chọn «Đã sửa» hoặc «Chấp nhận rủi ro» cho từng điểm trước khi tiếp tục.
        </p>
      )}
    </section>
  );
}

function FindingRow({
  finding,
  value,
  disabled,
  onChange,
}: {
  finding: EditorialFinding;
  value: HumanReviewDisposition | "";
  disabled: boolean;
  onChange: (v: HumanReviewDisposition) => void;
}) {
  const severityLabel =
    finding.severity === "fail"
      ? "Fail"
      : finding.severity === "decision"
        ? "Kết luận"
        : "Revision";

  return (
    <div className="rounded-xl border border-[var(--line)] bg-white/80 px-3.5 py-3">
      <div className="flex flex-wrap items-start gap-2">
        <span className="rounded-md bg-[var(--warn-soft)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--warm)]">
          {severityLabel}
        </span>
        <p className="min-w-0 flex-1 text-sm font-medium text-[var(--ink)]">{finding.label}</p>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {(
          [
            ["fixed", "Đã sửa"],
            ["accept", "Chấp nhận rủi ro"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => onChange(key)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              value === key
                ? "bg-[var(--ink)] text-white"
                : "bg-[var(--surface-muted)] text-[var(--ink-muted)] hover:text-[var(--ink)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
