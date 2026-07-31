"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select } from "@/components/ui/input";
import type { AutoWriteSettings } from "@/lib/auto-write/schedule";
import {
  AVOID_FORMAT_FLAGS,
  type AvoidFormatFlag,
  DEFAULT_TARGET_WORD_COUNT,
  parseAvoidFormats,
  serializeAvoidFormats,
} from "@/lib/tfes/writing-prefs";

const AVOID_LABELS: Record<AvoidFormatFlag, string> = {
  table: "Table (bảng markdown)",
  mermaid: "Mermaid / sơ đồ code",
  numbered_outline: "Outline listicle đánh số (1. Hook…)",
};

export default function NewArticlePage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [domain, setDomain] = useState("engineering");
  const [targetWordCount, setTargetWordCount] = useState(DEFAULT_TARGET_WORD_COUNT);
  const [avoidFlags, setAvoidFlags] = useState<AvoidFormatFlag[]>(["table"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings/auto-write")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { config?: AutoWriteSettings } | null) => {
        if (!data?.config) return;
        setTargetWordCount(data.config.defaultTargetWordCount || DEFAULT_TARGET_WORD_COUNT);
        setAvoidFlags(parseAvoidFormats(data.config.defaultAvoidFormats || "table"));
      })
      .catch(() => {
        /* giữ default */
      });
  }, []);

  function toggleAvoid(flag: AvoidFormatFlag) {
    setAvoidFlags((prev) =>
      prev.includes(flag) ? prev.filter((f) => f !== flag) : [...prev, flag],
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic,
        domain,
        targetWordCount,
        avoidFormats: serializeAvoidFormats(avoidFlags),
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error || "Không tạo được bài viết");
      return;
    }

    const data = (await res.json()) as { article: { id: string } };
    router.push(`/articles/${data.article.id}`);
  }

  return (
    <AppShell
      title="Tạo bài mới"
      subtitle="Khởi tạo chu trình AI-TFES. Agent research nguồn thật trước khi viết."
      backHref="/dashboard"
      backLabel="Biên tập"
    >
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <form onSubmit={onSubmit} className="surface-card space-y-6 p-6 sm:p-8">
          <div>
            <Label htmlFor="domain">Domain profile</Label>
            <Select id="domain" value={domain} onChange={(e) => setDomain(e.target.value)}>
              <option value="engineering">engineering — kỹ thuật</option>
              <option value="soft-skills">soft-skills — kỹ năng mềm</option>
            </Select>
            <FieldHint>Quyết định tông giọng, tier nguồn và nhóm chủ đề.</FieldHint>
          </div>

          <div>
            <Label htmlFor="topic">Chủ đề (tuỳ chọn)</Label>
            <Input
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="VD: MCP là gì và vì sao thành chuẩn kết nối agent"
            />
            <FieldHint>
              Để trống → hệ thống tự chọn 1 dòng từ seed_topics (engineering/soft-skills), tránh trùng bài đã có.
            </FieldHint>
          </div>

          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-muted)]/40 p-4 space-y-4">
            <p className="text-sm font-semibold text-[var(--ink)]">Cấu hình bài viết</p>
            <div>
              <Label htmlFor="words">Số từ gợi ý (bản sạch)</Label>
              <Input
                id="words"
                type="number"
                min={400}
                max={4000}
                step={50}
                value={targetWordCount}
                onChange={(e) => setTargetWordCount(Number(e.target.value) || DEFAULT_TARGET_WORD_COUNT)}
              />
              <FieldHint>Bản đăng đọc liền nhắm khoảng số từ này (±15%). Prefill từ Settings.</FieldHint>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-[var(--ink)]">Tránh format</p>
              <ul className="space-y-2">
                {AVOID_FORMAT_FLAGS.map((flag) => (
                  <li key={flag} className="flex items-start gap-2 text-sm text-[var(--ink-muted)]">
                    <input
                      id={`avoid-${flag}`}
                      type="checkbox"
                      className="mt-1"
                      checked={avoidFlags.includes(flag)}
                      onChange={() => toggleAvoid(flag)}
                    />
                    <label htmlFor={`avoid-${flag}`} className="cursor-pointer">
                      {AVOID_LABELS[flag]}
                    </label>
                  </li>
                ))}
              </ul>
              <FieldHint>Áp vào bước Viết + Bản sạch. Nháp 12 phần vẫn theo Article.md nội bộ.</FieldHint>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
              {error}
            </div>
          )}

          <Button type="submit" disabled={loading} className="rounded-full">
            {loading ? "Đang tạo..." : "Tạo & mở chu trình viết"}
          </Button>
        </form>

        <aside className="space-y-4">
          <div className="hero-band p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
              Workflow
            </p>
            <ol className="mt-4 space-y-3">
              {[
                "Research + nguồn",
                "Insight Gate ≥ L2",
                "Viết 12 phần (nội bộ)",
                "Bản sạch đọc liền để đăng",
              ].map((step, i) => (
                <li key={step} className="flex items-center gap-3 text-sm text-[var(--ink-muted)]">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-bold text-[var(--accent)]">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
          <div className="surface-soft p-5 text-sm leading-relaxed text-[var(--ink-muted)]">
            Bản sạch = bài đăng cho mọi người đọc (mở → thân → kết), không heading biên tập. Đổi mặc định
            số từ / tránh Table tại <strong className="text-[var(--ink)]">Settings</strong>.
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
