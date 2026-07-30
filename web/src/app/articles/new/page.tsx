"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select } from "@/components/ui/input";

export default function NewArticlePage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [domain, setDomain] = useState("engineering");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, domain }),
    });

    setLoading(false);

    if (!res.ok) {
      setError("Không tạo được bài viết");
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
      backLabel="Pipeline"
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
            <FieldHint>Để trống → Agent tự chọn theo Seeding Mode / backlog.</FieldHint>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
              {error}
            </div>
          )}

          <Button type="submit" disabled={loading} className="rounded-full">
            {loading ? "Đang tạo..." : "Tạo & mở pipeline"}
          </Button>
        </form>

        <aside className="space-y-4">
          <div className="hero-band p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
              Workflow
            </p>
            <ol className="mt-4 space-y-3">
              {["Research + nguồn", "Insight Gate ≥ L2", "Viết 12 phần", "Fact-check & bản sạch"].map(
                (step, i) => (
                  <li key={step} className="flex items-center gap-3 text-sm text-[var(--ink-muted)]">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-bold text-[var(--accent)]">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ),
              )}
            </ol>
          </div>
          <div className="surface-soft p-5 text-sm leading-relaxed text-[var(--ink-muted)]">
            Sau khi <strong className="text-[var(--ink)]">Approve / Publish</strong>, bài vào{" "}
            <strong className="text-[var(--ink)]">Thư viện</strong> để đọc lại gọn gàng.
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
