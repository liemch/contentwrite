"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { stripPipelineMarks } from "@/lib/tfes/parser";

type CleanEditPanelProps = {
  articleId: string;
  cleanPublish: string | null;
  status: string;
  running: boolean;
  onArticleUpdate: (article: Record<string, unknown>) => void;
  onLog: (level: "info" | "success" | "error" | "warn", message: string) => void;
};

export function CleanEditPanel({
  articleId,
  cleanPublish,
  status,
  running,
  onArticleUpdate,
  onLog,
}: CleanEditPanelProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const canEdit = status !== "PUBLISHED" && Boolean((cleanPublish ?? "").trim());

  useEffect(() => {
    if (!editing) {
      setDraft(stripPipelineMarks(cleanPublish));
    }
  }, [cleanPublish, editing]);

  async function save() {
    setBusy(true);
    onLog("info", "→ Lưu bản sạch (chỉnh tay)...");
    try {
      const res = await fetch(`/api/articles/${articleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cleanPublish: draft, editNote: note || undefined }),
      });
      const data = (await res.json()) as { article?: Record<string, unknown>; error?: string };
      if (!res.ok || !data.article) throw new Error(data.error || "Không lưu được");
      onArticleUpdate(data.article);
      setEditing(false);
      onLog("success", "✓ Đã lưu chỉnh sửa tay");
    } catch (err) {
      onLog("error", `✗ ${err instanceof Error ? err.message : "Lỗi lưu"}`);
    } finally {
      setBusy(false);
    }
  }

  async function polish() {
    setBusy(true);
    onLog("info", "→ Polish theo chỉnh sửa của anh (AI tôn trọng markup)...");
    try {
      if (editing) {
        const saveRes = await fetch(`/api/articles/${articleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cleanPublish: draft, editNote: note || undefined }),
        });
        const saveData = (await saveRes.json()) as {
          article?: Record<string, unknown>;
          error?: string;
        };
        if (!saveRes.ok || !saveData.article) {
          throw new Error(saveData.error || "Không lưu được trước khi polish");
        }
        onArticleUpdate(saveData.article);
      }

      const res = await fetch(`/api/articles/${articleId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "polish-human-edits",
          notes: note || undefined,
        }),
      });
      const data = (await res.json()) as { article?: Record<string, unknown>; error?: string };
      if (!res.ok || !data.article) throw new Error(data.error || "Polish thất bại");
      onArticleUpdate(data.article);
      setEditing(false);
      setDraft(stripPipelineMarks(String(data.article.cleanPublish ?? "")));
      onLog("success", "✓ Polish xong — giữ thay đổi của anh");
    } catch (err) {
      onLog("error", `✗ ${err instanceof Error ? err.message : "Lỗi polish"}`);
    } finally {
      setBusy(false);
    }
  }

  if (!canEdit) return null;

  return (
    <div className="mb-6 rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)]/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">Sửa tay bản sạch</p>
          <p className="mt-0.5 text-xs text-[var(--ink-faint)]">
            Sửa đúng chỗ anh muốn → Lưu hoặc «Polish theo chỉnh sửa» (AI chỉ làm mượt, không viết lại
            luận điểm).
          </p>
        </div>
        {!editing ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={running || busy}
            onClick={() => {
              setDraft(stripPipelineMarks(cleanPublish));
              setEditing(true);
            }}
          >
            Sửa markdown
          </Button>
        ) : (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(false)}>
            Huỷ
          </Button>
        )}
      </div>

      {editing && (
        <div className="mt-3 space-y-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={16}
            disabled={busy || running}
            className="font-mono text-xs leading-relaxed"
          />
          <div>
            <Label htmlFor="edit-note">Ghi chú cho AI (tuỳ chọn)</Label>
            <Textarea
              id="edit-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Vd. Giữ nguyên hook; chỉ nối đoạn ## 2 với ## 3"
              disabled={busy || running}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" busy={busy} disabled={busy || running} onClick={() => void save()}>
              Lưu chỉnh sửa
            </Button>
            <Button
              variant="success"
              size="sm"
              busy={busy}
              disabled={busy || running}
              onClick={() => void polish()}
            >
              Polish theo chỉnh sửa
            </Button>
          </div>
        </div>
      )}

      {!editing && (
        <div className="mt-3">
          <Button
            variant="secondary"
            size="sm"
            busy={busy}
            disabled={busy || running}
            onClick={() => void polish()}
            title="AI làm mượt bản sạch hiện tại, tôn trọng nội dung đã có"
          >
            Polish theo bản hiện tại
          </Button>
        </div>
      )}
    </div>
  );
}
