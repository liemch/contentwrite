"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import type { ShapeProfileView } from "@/lib/tfes/article-shape-manager";

export function ArticleShapeManager() {
  const [shapes, setShapes] = useState<ShapeProfileView[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings/article-shapes")
      .then(async (response) => {
        const data = (await response.json()) as { shapes?: ShapeProfileView[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Không tải được khung bài");
        setShapes(data.shapes ?? []);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Lỗi tải khung"));
  }, []);

  function update(id: string, patch: Partial<ShapeProfileView>) {
    setShapes((current) => current.map((shape) => shape.id === id ? { ...shape, ...patch } : shape));
  }

  function updateDefinition(id: string, patch: Partial<ShapeProfileView["definition"]>) {
    setShapes((current) => current.map((shape) =>
      shape.id === id ? { ...shape, definition: { ...shape.definition, ...patch } } : shape,
    ));
  }

  async function save(shape: ShapeProfileView) {
    setSaving(shape.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/settings/article-shapes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shape }),
      });
      const data = (await response.json()) as { shape?: ShapeProfileView; error?: string };
      if (!response.ok || !data.shape) throw new Error(data.error || "Không lưu được");
      setShapes((current) => current.map((item) => item.id === shape.id ? data.shape! : item));
      setMessage(`Đã lưu ${shape.labelVi} v${shape.version}. Bài đang chạy giữ snapshot cũ.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Lỗi lưu khung");
    } finally {
      setSaving(null);
    }
  }

  return (
    <section className="surface-card p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">Article Shape Manager</p>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--ink-muted)]">
            Điều chỉnh khung, trọng số và cooldown. Thay đổi chỉ áp dụng cho bài chưa chọn khung;
            bài đang chạy dùng snapshot bất biến.
          </p>
        </div>
        <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">
          {shapes.filter((shape) => shape.active).length}/{shapes.length} active
        </span>
      </div>

      {error && <p className="mt-4 rounded-xl bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">{error}</p>}
      {message && <p className="mt-4 rounded-xl bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--accent)]">{message}</p>}

      <div className="mt-5 grid gap-3">
        {shapes.map((shape) => {
          const open = expanded === shape.id;
          return (
            <div key={shape.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)]/35 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <input type="checkbox" checked={shape.active} onChange={(event) => update(shape.id, { active: event.target.checked })} />
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setExpanded(open ? null : shape.id)}>
                  <span className="font-semibold text-[var(--ink)]">{shape.labelVi}</span>
                  <span className="ml-2 text-xs text-[var(--ink-faint)]">{shape.id} · v{shape.version}</span>
                  <span className="mt-0.5 block truncate text-xs text-[var(--ink-muted)]">{shape.fit}</span>
                </button>
                <span className="text-xs text-[var(--ink-muted)]">weight {shape.weight} · cooldown {shape.cooldownArticles}</span>
                <Button size="sm" variant="ghost" type="button" onClick={() => setExpanded(open ? null : shape.id)}>{open ? "Thu" : "Sửa"}</Button>
              </div>

              {open && (
                <div className="mt-5 grid gap-4 border-t border-[var(--line)] pt-5 md:grid-cols-2">
                  <div><Label>Version</Label><Input value={shape.version} onChange={(event) => update(shape.id, { version: event.target.value })} /></div>
                  <div><Label>Tên hiển thị</Label><Input value={shape.labelVi} onChange={(event) => update(shape.id, { labelVi: event.target.value, definition: { ...shape.definition, labelVi: event.target.value } })} /></div>
                  <div><Label>Weight (0–100)</Label><Input type="number" min={0} max={100} value={shape.weight} onChange={(event) => update(shape.id, { weight: Number(event.target.value) })} /></div>
                  <div><Label>Cooldown số bài</Label><Input type="number" min={0} max={50} value={shape.cooldownArticles} onChange={(event) => update(shape.id, { cooldownArticles: Number(event.target.value) })} /></div>
                  <div><Label>Formats (CSV)</Label><Input value={shape.compatibleFormats} onChange={(event) => update(shape.id, { compatibleFormats: event.target.value })} /></div>
                  <div><Label>Domains (CSV hoặc *)</Label><Input value={shape.domains} onChange={(event) => update(shape.id, { domains: event.target.value })} /></div>
                  <div className="md:col-span-2"><Label>Insight kinds (CSV)</Label><Input value={shape.insightKinds} onChange={(event) => update(shape.id, { insightKinds: event.target.value })} placeholder="paradox,failure,question,decision…" /></div>
                  <div className="md:col-span-2"><Label>Hợp khi</Label><Textarea rows={2} value={shape.fit} onChange={(event) => { update(shape.id, { fit: event.target.value }); updateDefinition(shape.id, { fit: event.target.value }); }} /></div>
                  <div><Label>Kiểu mở</Label><Textarea rows={3} value={shape.definition.opening} onChange={(event) => updateDefinition(shape.id, { opening: event.target.value })} /></div>
                  <div><Label>Kiểu kết</Label><Textarea rows={3} value={shape.definition.ending} onChange={(event) => updateDefinition(shape.id, { ending: event.target.value })} /></div>
                  <div><Label>Story beats — mỗi dòng một nhịp</Label><Textarea rows={7} value={shape.definition.beats.join("\n")} onChange={(event) => updateDefinition(shape.id, { beats: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean) })} /></div>
                  <div><Label>Heading hints — mỗi dòng một gợi ý</Label><Textarea rows={7} value={shape.definition.headingHints.join("\n")} onChange={(event) => updateDefinition(shape.id, { headingHints: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean) })} /></div>
                  <div><Label>Recommendation style</Label><Textarea rows={3} value={shape.definition.recommendations} onChange={(event) => updateDefinition(shape.id, { recommendations: event.target.value })} /></div>
                  <div><Label>Discussion</Label><Select value={shape.definition.discussion} onChange={(event) => updateDefinition(shape.id, { discussion: event.target.value as "required" | "optional" | "skip" })}><option value="required">Bắt buộc</option><option value="optional">Tuỳ chọn</option><option value="skip">Không dùng</option></Select></div>
                  <div className="md:col-span-2"><Label>Draft hint</Label><Textarea rows={3} value={shape.definition.draftHint} onChange={(event) => updateDefinition(shape.id, { draftHint: event.target.value })} /></div>
                  <div className="md:col-span-2"><Button type="button" busy={saving === shape.id} disabled={saving != null} onClick={() => void save(shape)}>Lưu khung này</Button></div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
