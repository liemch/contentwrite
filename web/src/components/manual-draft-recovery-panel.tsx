"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { stripPipelineMarks } from "@/lib/tfes/parser";
import { isFactRemediationExhausted } from "@/lib/tfes/fact-ledger";
import { isRevisionRemediationExhausted } from "@/lib/tfes/retry-policy";

type Props = {
  articleId: string;
  workflowVersion: number;
  errorMessage: string | null;
  draft12: string | null;
  running: boolean;
  onArticleUpdate: (article: Record<string, unknown>) => void;
  onLog: (level: "info" | "success" | "error" | "warn", message: string) => void;
};

export function ManualDraftRecoveryPanel({
  articleId,
  workflowVersion,
  errorMessage,
  draft12,
  running,
  onArticleUpdate,
  onLog,
}: Props) {
  const exhausted =
    isRevisionRemediationExhausted(errorMessage) ||
    isFactRemediationExhausted(errorMessage);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!exhausted || !draft12?.trim()) return null;

  async function save() {
    setBusy(true);
    onLog("info", "→ Lưu manual draft revision...");
    try {
      const response = await fetch(`/api/articles/${articleId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-manual-draft",
          draftMarkdown: draft,
          expectedVersion: workflowVersion,
        }),
      });
      const data = (await response.json()) as {
        article?: Record<string, unknown>;
        error?: string;
      };
      if (!response.ok || !data.article) {
        throw new Error(data.error || "Không lưu được manual draft");
      }
      onArticleUpdate(data.article);
      setEditing(false);
      onLog(
        "success",
        "✓ Đã tạo draft revision mới — bước tiếp theo chạy lại Editorial Review; counter giữ nguyên.",
      );
    } catch (error) {
      onLog("error", `✗ ${error instanceof Error ? error.message : "Lỗi recovery"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-950">Recovery sau remediation exhausted</p>
      <p className="mt-1 text-xs leading-relaxed text-amber-900">
        Sửa toàn bộ <code>draft12</code> và lưu thành revision mới. Hệ thống sẽ quay về
        Editorial Review, vô hiệu Fact/Final/Clean cũ và giữ nguyên số lượt remediation đã dùng.
      </p>
      {!editing ? (
        <Button
          className="mt-3"
          size="sm"
          variant="secondary"
          disabled={running || busy}
          onClick={() => {
            setDraft(stripPipelineMarks(draft12));
            setEditing(true);
          }}
        >
          Mở draft để recovery
        </Button>
      ) : (
        <div className="mt-3 space-y-3">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={20}
            disabled={running || busy}
            className="font-mono text-xs leading-relaxed"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              busy={busy}
              disabled={running || busy || draft.trim().length < 80}
              onClick={() => void save()}
            >
              Lưu revision và về Editorial Review
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              Huỷ
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
