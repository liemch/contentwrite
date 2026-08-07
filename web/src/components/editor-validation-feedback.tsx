"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/input";
import { parseDeskJson } from "@/lib/tfes/desk-state";
import { isFactRemediationExhausted } from "@/lib/tfes/fact-ledger";
import { isRevisionRemediationExhausted } from "@/lib/tfes/retry-policy";

const RATINGS = [1, 2, 3, 4, 5] as const;

export function EditorValidationFeedback({
  articleId,
  workflowState,
  workflowVersion,
  errorMessage,
  deskJson,
  running,
  onArticleUpdate,
  onLog,
}: {
  articleId: string;
  workflowState: string;
  workflowVersion: number;
  errorMessage: string | null;
  deskJson: string | null | undefined;
  running: boolean;
  onArticleUpdate: (article: Record<string, unknown>) => void;
  onLog: (level: "info" | "success" | "error" | "warn", message: string) => void;
}) {
  const existing = useMemo(() => parseDeskJson(deskJson).validationFeedback, [deskJson]);
  const [finalUsability, setFinalUsability] = useState(existing?.finalUsability ?? 3);
  const [manualEditEffort, setManualEditEffort] = useState(existing?.manualEditEffort ?? 3);
  const [confusingStep, setConfusingStep] = useState(existing?.confusingStep ?? "");
  const [errorHelpfulness, setErrorHelpfulness] = useState(existing?.errorHelpfulness ?? 3);
  const [reuseIntent, setReuseIntent] = useState(existing?.reuseIntent ?? 3);
  const [note, setNote] = useState(existing?.note ?? "");
  const [busy, setBusy] = useState(false);

  const completed = ["PUBLISH_READY", "APPROVED", "PUBLISHED"].includes(workflowState);
  const exhausted =
    isRevisionRemediationExhausted(errorMessage) ||
    isFactRemediationExhausted(errorMessage);
  if (!completed && !exhausted) return null;

  async function save() {
    setBusy(true);
    try {
      const response = await fetch(`/api/articles/${articleId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-validation-feedback",
          expectedVersion: workflowVersion,
          finalUsability,
          manualEditEffort,
          confusingStep,
          errorHelpfulness,
          reuseIntent,
          notes: note || undefined,
        }),
      });
      const data = (await response.json()) as {
        article?: Record<string, unknown>;
        error?: string;
      };
      if (!response.ok || !data.article) {
        throw new Error(data.error || "Không lưu được feedback");
      }
      onArticleUpdate(data.article);
      onLog("success", "✓ Đã lưu feedback WP2.7 riêng cho bài này");
    } catch (error) {
      onLog("error", `✗ ${error instanceof Error ? error.message : "Lỗi feedback"}`);
    } finally {
      setBusy(false);
    }
  }

  const ratingSelect = (
    id: string,
    value: number,
    onChange: (value: number) => void,
  ) => (
    <Select
      id={id}
      value={value}
      disabled={busy || running}
      onChange={(event) => onChange(Number(event.target.value))}
    >
      {RATINGS.map((rating) => (
        <option key={rating} value={rating}>
          {rating}
        </option>
      ))}
    </Select>
  );

  return (
    <section className="mb-6 rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)]/50 p-4">
      <p className="text-sm font-semibold text-[var(--ink)]">Feedback validation WP2.7</p>
      <p className="mt-1 text-xs text-[var(--ink-faint)]">
        Thang 1–5. Feedback gắn với bài và tài khoản hiện tại, không hiển thị cho user khác.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="feedback-usability">1. Bài cuối có dùng được không?</Label>
          {ratingSelect("feedback-usability", finalUsability, setFinalUsability)}
        </div>
        <div>
          <Label htmlFor="feedback-edit-effort">2. Anh/chị đã phải sửa tay nhiều không?</Label>
          {ratingSelect("feedback-edit-effort", manualEditEffort, setManualEditEffort)}
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="feedback-confusing-step">3. Bước nào khó hiểu nhất?</Label>
          <Textarea
            id="feedback-confusing-step"
            value={confusingStep}
            onChange={(event) => setConfusingStep(event.target.value)}
            rows={2}
            maxLength={500}
            disabled={busy || running}
          />
        </div>
        <div>
          <Label htmlFor="feedback-error-help">4. Thông báo lỗi có giúp biết phải làm gì không?</Label>
          {ratingSelect("feedback-error-help", errorHelpfulness, setErrorHelpfulness)}
        </div>
        <div>
          <Label htmlFor="feedback-reuse">5. Có dùng lại cho bài tiếp theo không?</Label>
          {ratingSelect("feedback-reuse", reuseIntent, setReuseIntent)}
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="feedback-note">Ghi chú thêm</Label>
          <Textarea
            id="feedback-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            maxLength={1000}
            disabled={busy || running}
          />
        </div>
      </div>
      <Button
        className="mt-4"
        size="sm"
        busy={busy}
        disabled={busy || running}
        onClick={() => void save()}
      >
        {existing ? "Cập nhật feedback" : "Gửi feedback"}
      </Button>
    </section>
  );
}
