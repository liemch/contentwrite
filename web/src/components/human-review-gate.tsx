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

const DISPOSITIONS: {
  id: HumanReviewDisposition;
  label: string;
  hint: string;
}[] = [
  {
    id: "fixed",
    label: "Nhờ AI sửa tiếp",
    hint: "AI sửa draft một lượt theo điểm này, rồi đi tiếp Fact-check — không mở lại Review người",
  },
  {
    id: "accept",
    label: "Giữ nguyên",
    hint: "AI có thể sai hoặc điểm không đáng — bài đi tiếp với nội dung hiện tại",
  },
];

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

  function setAll(value: HumanReviewDisposition) {
    const next: Record<string, HumanReviewDisposition> = {};
    for (const f of findings) next[f.id] = value;
    setDispos(next);
  }

  function submit() {
    if (!canSubmit) return;
    const items: HumanReviewItem[] =
      findings.length > 0
        ? findings.map((f) => ({
            id: f.id,
            disposition: (dispos[f.id] || "accept") as HumanReviewDisposition,
          }))
        : [{ id: "ack-pass", disposition: "fixed", note: "Đã đọc Review AI — không Fail rõ" }];
    void onConfirm({ items, notes });
  }

  return (
    <section className="mb-8 rounded-2xl border border-[rgba(14,116,144,0.25)] bg-[rgba(14,116,144,0.06)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-source-serif)] text-lg font-semibold text-[var(--ink)]">
            Chốt Review trước khi đi tiếp
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            AI vừa tự chấm nháp. Anh chỉ cần nói với hệ thống: điểm nào nhờ sửa, điểm nào bỏ qua.
          </p>
        </div>
        <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-muted)] ring-1 ring-[var(--line)]">
          Người · sau bước 8
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-[var(--line)] bg-white/80 px-3.5 py-3 text-sm leading-relaxed text-[var(--ink-muted)]">
        <p className="font-medium text-[var(--ink)]">Cách dùng (30 giây)</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4">
          <li>Đọc từng góp ý AI bên dưới.</li>
          <li>
            Chọn <span className="font-semibold text-[var(--ink)]">Nhờ AI sửa tiếp</span> hoặc{" "}
            <span className="font-semibold text-[var(--ink)]">Giữ nguyên</span> —{" "}
            <span className="italic">không phải ô edit bài</span>.
          </li>
          <li>
            Bấm xác nhận → hệ thống chạy Fact-check / Polish theo lựa chọn + ghi chú của anh.
          </li>
        </ol>
      </div>

      {findings.length > 0 ? (
        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
              AI góp ý ({findings.length})
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={running}
                onClick={() => setAll("fixed")}
                className="text-xs font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
              >
                Tất cả: nhờ AI sửa
              </button>
              <span className="text-[var(--ink-faint)]">·</span>
              <button
                type="button"
                disabled={running}
                onClick={() => setAll("accept")}
                className="text-xs font-semibold text-[var(--ink-muted)] underline-offset-2 hover:underline"
              >
                Tất cả: giữ nguyên
              </button>
            </div>
          </div>
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
          AI không tách ra Fail rõ ràng. Anh có thể mở Review đầy đủ bên dưới — nếu ổn thì bấm xác
          nhận để đi Fact-check.
        </div>
      )}

      <div className="mt-4">
        <button
          type="button"
          className="text-xs font-semibold text-[var(--accent)] underline-offset-2 hover:underline"
          onClick={() => setShowFull((v) => !v)}
        >
          {showFull ? "Ẩn Review AI đầy đủ" : "Xem Review AI đầy đủ (tuỳ chọn)"}
        </button>
        {showFull && (
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--line)] bg-white/80 p-3 text-xs leading-relaxed text-[var(--ink-muted)]">
            {reviewText || "(trống)"}
          </pre>
        )}
      </div>

      <div className="mt-4">
        <Label htmlFor="human-review-notes">Ghi chú thêm (tuỳ chọn)</Label>
        <Textarea
          id="human-review-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Vd. “Điểm thiếu URL: nhờ bổ sung từ Research” · “Giữ nguyên mở bài vì đúng shape”"
          rows={2}
          disabled={running}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          variant="success"
          size="sm"
          busy={running}
          disabled={!canSubmit}
          onClick={submit}
          title={!allResolved ? "Chọn hết các điểm trước" : "Lưu lựa chọn và chạy Fact-check"}
        >
          {running ? "Đang lưu..." : "Xong — chạy Fact-check"}
        </Button>
        {!allResolved && (
          <p className="text-xs text-[var(--warm)]">
            Còn điểm chưa chọn. Dùng «Tất cả: nhờ AI sửa» nếu muốn nhanh.
          </p>
        )}
      </div>
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
      ? "Cần xem"
      : finding.severity === "decision"
        ? "Kết luận AI"
        : "Góp ý";

  return (
    <div className="rounded-xl border border-[var(--line)] bg-white/80 px-3.5 py-3">
      <div className="flex flex-wrap items-start gap-2">
        <span className="rounded-md bg-[var(--warn-soft)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--warm)]">
          {severityLabel}
        </span>
        <p className="min-w-0 flex-1 text-sm font-medium text-[var(--ink)]">{finding.label}</p>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {DISPOSITIONS.map((d) => {
          const active = value === d.id;
          return (
            <button
              key={d.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(d.id)}
              className={`rounded-xl border px-3 py-2.5 text-left transition ${
                active
                  ? "border-[var(--ink)] bg-[var(--ink)] text-white"
                  : "border-[var(--line)] bg-[var(--surface-muted)]/60 text-[var(--ink)] hover:border-[var(--line-strong)]"
              }`}
            >
              <span className="block text-sm font-semibold">{d.label}</span>
              <span
                className={`mt-0.5 block text-[11px] leading-snug ${
                  active ? "text-white/75" : "text-[var(--ink-faint)]"
                }`}
              >
                {d.hint}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
