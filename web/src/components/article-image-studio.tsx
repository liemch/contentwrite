"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import {
  MAX_ARTICLE_IMAGES,
  resolveGallery,
  type GalleryImage,
  type ImageBriefSlot,
} from "@/lib/image/gallery";

type ArticleLite = {
  id: string;
  title: string | null;
  topic: string | null;
  heroBrief: string | null;
  heroImageUrl: string | null;
  heroImageModel: string | null;
  heroImageAlt: string | null;
  heroPromptUsed: string | null;
  galleryJson?: string | null;
  cleanPublish: string | null;
};

type ArticleImageStudioProps = {
  article: ArticleLite;
  running: boolean;
  onArticleUpdate: (article: ArticleLite & Record<string, unknown>) => void;
  onLog: (level: "info" | "success" | "error" | "warn", message: string) => void;
};

type DraftSlot = {
  key: string;
  role: "hero" | "inline";
  promptEn: string;
  altVi: string;
  conceptVi: string;
  afterHeadingIndex: number | null;
};

export function ArticleImageStudio({
  article,
  running,
  onArticleUpdate,
  onLog,
}: ArticleImageStudioProps) {
  const [open, setOpen] = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const [genningKey, setGenningKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [count, setCount] = useState(3);
  const [drafts, setDrafts] = useState<DraftSlot[]>([]);

  const gallery = useMemo(() => resolveGallery(article), [article]);

  useEffect(() => {
    if (drafts.length > 0) return;
    if (article.heroPromptUsed || article.heroBrief) {
      setDrafts([
        {
          key: "draft-hero",
          role: "hero",
          promptEn: article.heroPromptUsed || "",
          altVi: article.heroImageAlt || "",
          conceptVi: "",
          afterHeadingIndex: null,
        },
      ]);
    }
  }, [article.heroPromptUsed, article.heroBrief, article.heroImageAlt, drafts.length]);

  async function suggestFromArticle() {
    setSuggesting(true);
    setError("");
    onLog("info", `→ Đọc toàn bài và kiểm tra độ bám nội dung cho ${count} prompt ảnh...`);
    const started = Date.now();
    try {
      const res = await fetch(`/api/articles/${article.id}/hero`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "suggest", count }),
      });
      const data = (await res.json()) as { slots?: ImageBriefSlot[]; error?: string };
      if (!res.ok) {
        setError(data.error || "Gợi ý thất bại");
        onLog("error", `✗ gợi ý ảnh: ${data.error || "lỗi"}`);
        return;
      }
      const slots = data.slots || [];
      setDrafts(
        slots.map((s, i) => ({
          key: `draft-${i}-${Date.now().toString(36)}`,
          role: s.role,
          promptEn: s.promptEn,
          altVi: s.altVi,
          conceptVi: s.conceptVi,
          afterHeadingIndex: s.afterHeadingIndex ?? (i === 0 ? null : i - 1),
        })),
      );
      onLog(
        "success",
        `✓ Gợi ý ${slots.length} prompt (~${Math.round((Date.now() - started) / 1000)}s) — chỉnh rồi gen`,
      );
    } finally {
      setSuggesting(false);
    }
  }

  async function generateSlot(slot: DraftSlot, model: "flux" | "qwen") {
    if (!slot.promptEn.trim()) {
      setError("Nhập prompt English trước khi gen.");
      return;
    }
    // Hero gen lại = thay slot hero; chỉ chặn khi thêm inline mà đã đủ 5
    if (slot.role === "inline" && gallery.length >= MAX_ARTICLE_IMAGES) {
      setError(`Đã đủ ${MAX_ARTICLE_IMAGES} ảnh. Xoá bớt trước.`);
      return;
    }

    setGenningKey(`${slot.key}-${model}`);
    setError("");
    onLog("info", `→ Gen ${slot.role} (${model})...`);
    const started = Date.now();

    const res = await fetch(`/api/articles/${article.id}/hero`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "generate",
        model,
        role: slot.role,
        prompt: slot.promptEn,
        alt: slot.altVi,
        conceptVi: slot.conceptVi,
        afterHeadingIndex: slot.afterHeadingIndex,
      }),
    });
    const data = (await res.json()) as {
      article?: ArticleLite & Record<string, unknown>;
      error?: string;
      image?: GalleryImage;
    };
    setGenningKey(null);
    const sec = Math.round((Date.now() - started) / 1000);

    if (!res.ok) {
      setError(data.error || "Gen ảnh thất bại");
      onLog("error", `✗ ${slot.role} ${model}: ${data.error || "lỗi"} (${sec}s)`);
      return;
    }
    if (data.article) {
      onArticleUpdate(data.article);
      onLog("success", `✓ ${slot.role} · ${model} (${sec}s) — đã chèn vào bản sạch`);
    }
  }

  async function removeImage(imageId: string) {
    setError("");
    const res = await fetch(`/api/articles/${article.id}/hero`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", imageId }),
    });
    const data = (await res.json()) as {
      article?: ArticleLite & Record<string, unknown>;
      error?: string;
    };
    if (!res.ok) {
      setError(data.error || "Không xoá được ảnh");
      return;
    }
    if (data.article) {
      onArticleUpdate(data.article);
      onLog("warn", "Đã xoá ảnh khỏi gallery / bản sạch");
    }
  }

  function updateDraft(key: string, patch: Partial<DraftSlot>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  const busy = suggesting || Boolean(genningKey) || running;

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5"
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
            Ảnh minh họa · 1–{MAX_ARTICLE_IMAGES} ảnh / bài
          </p>
          <p className="mt-0.5 text-sm text-[var(--ink-muted)]">
            {gallery.length > 0
              ? `${gallery.length} ảnh · hero ${gallery.some((g) => g.role === "hero") ? "✓" : "—"}`
              : "Gợi ý prompt từ luận điểm bài → gen hero + ảnh trong thân"}
          </p>
        </div>
        <span className="shrink-0 text-xs font-medium text-[var(--accent)]">
          {open ? "Thu gọn" : "Mở"}
        </span>
      </button>

      {open && (
        <div className="border-t border-[var(--line)] px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-[var(--ink-muted)]">
              Số ảnh gợi ý
              <select
                className="rounded-lg border border-[var(--line-strong)] bg-white px-2 py-1.5 text-sm text-[var(--ink)]"
                value={count}
                disabled={busy}
                onChange={(e) => setCount(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <Button
              size="sm"
              variant="secondary"
              busy={suggesting}
              disabled={busy}
              onClick={() => void suggestFromArticle()}
            >
              {suggesting ? "Đang phân tích bài..." : "Gợi ý prompt từ bài"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-[var(--ink-faint)]">
            LLM đọc mở bài + từng section + kết luận, rồi chạy visual grounding check trước khi
            đưa prompt để gen.
          </p>

          {drafts.length > 0 && (
            <div className="mt-5 space-y-5">
              {drafts.map((slot, idx) => (
                <div
                  key={slot.key}
                  className="rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)]/40 p-4"
                >
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-[var(--ink)]">
                      {slot.role === "hero" ? "Hero (đầu bài)" : `Ảnh trong bài #${idx}`}
                    </p>
                    {slot.role === "inline" && (
                      <label className="flex items-center gap-2 text-xs text-[var(--ink-muted)]">
                        Chèn sau ## thứ
                        <input
                          type="number"
                          min={0}
                          className="w-16 rounded-lg border border-[var(--line-strong)] bg-white px-2 py-1"
                          value={slot.afterHeadingIndex ?? 0}
                          disabled={busy}
                          onChange={(e) =>
                            updateDraft(slot.key, {
                              afterHeadingIndex: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </label>
                    )}
                  </div>
                  {slot.conceptVi && (
                    <p className="mb-2 text-xs text-[var(--accent)]">Concept: {slot.conceptVi}</p>
                  )}
                  <Label htmlFor={`prompt-${slot.key}`}>Prompt (English)</Label>
                  <Textarea
                    id={`prompt-${slot.key}`}
                    rows={3}
                    className="mt-1.5 font-mono text-xs"
                    value={slot.promptEn}
                    disabled={busy}
                    onChange={(e) => updateDraft(slot.key, { promptEn: e.target.value })}
                  />
                  <div className="mt-3">
                    <Label htmlFor={`alt-${slot.key}`}>Alt text (TIẾNG VIỆT)</Label>
                    <Textarea
                      id={`alt-${slot.key}`}
                      rows={2}
                      className="mt-1.5 text-sm"
                      value={slot.altVi}
                      disabled={busy}
                      onChange={(e) => updateDraft(slot.key, { altVi: e.target.value })}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      busy={genningKey === `${slot.key}-flux`}
                      disabled={busy}
                      onClick={() => void generateSlot(slot, "flux")}
                    >
                      Gen FLUX
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      busy={genningKey === `${slot.key}-qwen`}
                      disabled={busy}
                      onClick={() => void generateSlot(slot, "qwen")}
                    >
                      Gen Qwen
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-xl border border-red-200 bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
              {error}
            </div>
          )}

          {gallery.length > 0 && (
            <div className="mt-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
                Gallery ({gallery.length}/{MAX_ARTICLE_IMAGES})
              </p>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {gallery.map((img) => (
                  <div
                    key={img.id}
                    className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.alt}
                      className="aspect-[16/9] w-full object-cover"
                    />
                    <div className="space-y-2 p-3">
                      <p className="text-xs font-semibold text-[var(--ink)]">
                        {img.role === "hero" ? "Hero" : "Inline"} · {img.modelLabel}
                      </p>
                      <p className="line-clamp-2 text-xs text-[var(--ink-muted)]">{img.alt}</p>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void removeImage(img.id)}
                      >
                        Xoá
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
