"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldHint, Label, Select, Textarea } from "@/components/ui/input";

type DocMeta = {
  path: string;
  label: string;
  group: string;
  onDisk: boolean;
  hasOverride: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

type DocDetail = DocMeta & {
  content: string;
  diskContent: string | null;
};

export function TfesDocsEditor() {
  const [documents, setDocuments] = useState<DocMeta[]>([]);
  const [path, setPath] = useState("");
  const [detail, setDetail] = useState<DocDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const dirty = detail ? draft !== detail.content : false;

  const grouped = useMemo(() => {
    const map = new Map<string, DocMeta[]>();
    for (const doc of documents) {
      const list = map.get(doc.group) ?? [];
      list.push(doc);
      map.set(doc.group, list);
    }
    return [...map.entries()];
  }, [documents]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/settings/tfes-docs");
      const data = (await res.json()) as { documents?: DocMeta[]; error?: string };
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
        return;
      }
      const docs = data.documents ?? [];
      setDocuments(docs);
      if (!path && docs[0]) {
        setPath(docs[0].path);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi tải danh sách");
    } finally {
      setLoading(false);
    }
  }, [path]);

  const loadDoc = useCallback(async (nextPath: string) => {
    if (!nextPath) return;
    setLoadingDoc(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/settings/tfes-docs?path=${encodeURIComponent(nextPath)}`);
      const data = (await res.json()) as { document?: DocDetail; error?: string };
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
        return;
      }
      if (!data.document) {
        setError("Không có document");
        return;
      }
      setDetail(data.document);
      setDraft(data.document.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi tải file");
    } finally {
      setLoadingDoc(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (path) void loadDoc(path);
  }, [path, loadDoc]);

  async function onSave() {
    if (!path || !dirty) return;
    const ok = window.confirm(
      `Lưu override cho ${path}?\nBản này lưu trên DB và được pipeline ưu tiên hơn file trong repo.`,
    );
    if (!ok) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/settings/tfes-docs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content: draft }),
      });
      const data = (await res.json()) as { document?: DocDetail; error?: string };
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
        return;
      }
      if (data.document) {
        setDetail(data.document);
        setDraft(data.document.content);
      }
      setMessage("Đã lưu override — bước pipeline tiếp theo sẽ dùng bản này.");
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi lưu");
    } finally {
      setSaving(false);
    }
  }

  async function onReset() {
    if (!path || !detail?.hasOverride) return;
    const ok = window.confirm(
      `Xóa override DB cho ${path}?\nPipeline sẽ quay lại bản disk (repo / sync-tfes).`,
    );
    if (!ok) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/settings/tfes-docs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, reset: true }),
      });
      const data = (await res.json()) as { document?: DocDetail; error?: string };
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
        return;
      }
      if (data.document) {
        setDetail(data.document);
        setDraft(data.document.content);
      }
      setMessage("Đã reset — dùng lại bản disk.");
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi reset");
    } finally {
      setSaving(false);
    }
  }

  function restoreDisk() {
    if (detail?.diskContent != null) {
      setDraft(detail.diskContent);
      setMessage("Đã dán bản disk vào editor (chưa lưu).");
    }
  }

  if (loading) {
    return <div className="h-48 animate-pulse rounded-2xl bg-[var(--surface-muted)]" />;
  }

  return (
    <div className="surface-card w-full space-y-4 p-5 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--ink)]">Tài liệu AI-TFES (.md)</p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">
            Prompt / Domain Profile / Template mà pipeline nhúng vào LLM. Lưu = override trên DB
            (ưu tiên hơn file trong repo). Reset = về bản disk.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0">
          <Label htmlFor="tfes-doc-path">File</Label>
          <Select
            id="tfes-doc-path"
            value={path}
            onChange={(e) => {
              if (dirty && !window.confirm("Có thay đổi chưa lưu — đổi file?")) return;
              setPath(e.target.value);
            }}
          >
            {grouped.map(([group, docs]) => (
              <optgroup key={group} label={group}>
                {docs.map((doc) => (
                  <option key={doc.path} value={doc.path}>
                    {doc.label}
                    {doc.hasOverride ? " · DB" : ""}
                    {!doc.onDisk ? " · thiếu disk" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          <FieldHint>
            {detail?.hasOverride
              ? `Đang dùng override DB${detail.updatedAt ? ` · ${new Date(detail.updatedAt).toLocaleString("vi-VN")}` : ""}${detail.updatedBy ? ` · ${detail.updatedBy}` : ""}`
              : "Đang dùng bản disk (chưa có override)"}
          </FieldHint>
        </div>

        <div className="flex min-w-0 flex-wrap gap-2 lg:justify-end lg:pt-7">
          <Button type="button" disabled={!dirty || saving || loadingDoc} onClick={() => void onSave()}>
            {saving ? "Đang lưu…" : "Lưu override"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!detail?.hasOverride || saving}
            onClick={() => void onReset()}
          >
            Reset về disk
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!detail?.diskContent || saving}
            onClick={restoreDisk}
          >
            Dán bản disk
          </Button>
          {dirty && (
            <span className="self-center text-xs font-medium text-[var(--accent)]">Chưa lưu</span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
          {error}
          {/TfesDocument|does not exist|P2021/i.test(error) && (
            <p className="mt-1 text-xs">
              Chạy SQL: <code>web/prisma/migrations/manual_tfes_documents.sql</code> trên Neon rồi
              tải lại.
            </p>
          )}
        </div>
      )}
      {message && (
        <div className="rounded-xl border border-[rgba(15,118,110,0.25)] bg-[var(--accent-soft)] px-3.5 py-2.5 text-sm text-[var(--ink)]">
          {message}
        </div>
      )}

      <div className="min-w-0 w-full">
        <Label htmlFor="tfes-doc-body">Nội dung Markdown</Label>
        <Textarea
          id="tfes-doc-body"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={loadingDoc || saving}
          className="mt-2 min-h-[min(70vh,640px)] w-full max-w-none resize-y font-mono text-[13px] leading-relaxed"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
