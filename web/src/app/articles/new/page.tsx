"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select } from "@/components/ui/input";
import type { AutoWriteSettings } from "@/lib/auto-write/schedule";
import {
  DEFAULT_AVOID_FORMATS,
  DEFAULT_TARGET_WORD_COUNT,
  MAX_TARGET_WORD_COUNT,
  MIN_TARGET_WORD_COUNT,
  normalizeAvoidFormatsText,
} from "@/lib/tfes/writing-prefs";
import { MemoryHints } from "@/components/memory-hints";
import { domainSelectOptions } from "@/lib/tfes/domains";
import { PUBLISH_FORMATS, PUBLISH_FORMAT_IDS, type PublishFormatId } from "@/lib/tfes/publish-formats";

type SeriesOption = { id: string; title: string; domain: string };

export default function NewArticlePage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [domain, setDomain] = useState("engineering");
  const [publishFormat, setPublishFormat] = useState<PublishFormatId>("blog");
  const [seriesId, setSeriesId] = useState("");
  const [seriesList, setSeriesList] = useState<SeriesOption[]>([]);
  const [targetWordCount, setTargetWordCount] = useState<number>(DEFAULT_TARGET_WORD_COUNT);
  const [avoidFormats, setAvoidFormats] = useState(DEFAULT_AVOID_FORMATS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [quota, setQuota] = useState<{ limit: number; used: number; remaining: number } | null>(
    null,
  );

  useEffect(() => {
    fetch("/api/settings/auto-write")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { config?: AutoWriteSettings } | null) => {
        if (!data?.config) return;
        setTargetWordCount(data.config.defaultTargetWordCount || DEFAULT_TARGET_WORD_COUNT);
        setAvoidFormats(
          normalizeAvoidFormatsText(data.config.defaultAvoidFormats || DEFAULT_AVOID_FORMATS) ||
            DEFAULT_AVOID_FORMATS,
        );
      })
      .catch(() => {
        /* giữ default */
      });

    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { quota?: { limit: number; used: number; remaining: number } } | null) => {
        if (data?.quota) setQuota(data.quota);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/series")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { series?: SeriesOption[] } | null) => {
        setSeriesList(data?.series ?? []);
      })
      .catch(() => setSeriesList([]));
  }, []);

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
        publishFormat,
        seriesId: seriesId || null,
        targetWordCount,
        avoidFormats: normalizeAvoidFormatsText(avoidFormats),
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      article?: { id: string };
      error?: string;
      quota?: { limit: number; used: number; remaining: number };
    };
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Không tạo được bài viết");
      if (data.quota) setQuota(data.quota);
      return;
    }

    if (data.quota) setQuota(data.quota);
    if (!data.article?.id) {
      setError("API không trả về bài viết");
      return;
    }
    router.push(`/articles/${data.article.id}`);
  }

  const quotaBlocked = quota != null && quota.remaining <= 0;
  const formatMeta = PUBLISH_FORMATS[publishFormat];
  const seriesForDomain = seriesList.filter((s) => s.domain === domain);

  return (
    <AppShell
      title="Tạo bài mới"
      subtitle="Khởi tạo chu trình AI-TFES. Chọn format + series trước khi research."
      backHref="/dashboard"
      backLabel="Biên tập"
    >
      {quota && (
        <div className="mb-5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink-muted)]">
          Hôm nay còn{" "}
          <span className="font-semibold text-[var(--ink)]">
            {quota.remaining}/{quota.limit}
          </span>{" "}
          bài (đã tạo {quota.used}).
          {quotaBlocked && (
            <span className="ml-1 text-[var(--danger)]">Đã hết hạn mức — liên hệ admin.</span>
          )}
        </div>
      )}

      <MemoryHints domain={domain} topic={topic} seriesId={seriesId || undefined} />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <form onSubmit={onSubmit} className="surface-card space-y-6 p-6 sm:p-8">
          <div>
            <Label htmlFor="domain">Domain profile</Label>
            <Select id="domain" value={domain} onChange={(e) => setDomain(e.target.value)}>
              {domainSelectOptions().map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
            <FieldHint>Quyết định tông giọng, tier nguồn và nhóm chủ đề.</FieldHint>
          </div>

          <div>
            <Label htmlFor="format">Định dạng xuất bản</Label>
            <Select
              id="format"
              value={publishFormat}
              onChange={(e) => {
                const next = e.target.value as PublishFormatId;
                setPublishFormat(next);
                setTargetWordCount(PUBLISH_FORMATS[next].wordHint);
              }}
            >
              {PUBLISH_FORMAT_IDS.map((id) => (
                <option key={id} value={id}>
                  {PUBLISH_FORMATS[id].labelVi}
                </option>
              ))}
            </Select>
            <FieldHint>{formatMeta.desc}. Gợi ý ~{formatMeta.wordHint} từ.</FieldHint>
          </div>

          <div>
            <Label htmlFor="series">Series (tuỳ chọn)</Label>
            <Select
              id="series"
              value={seriesId}
              onChange={(e) => setSeriesId(e.target.value)}
            >
              <option value="">— Không gắn series —</option>
              {seriesForDomain.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </Select>
            <FieldHint>
              Memory sẽ tránh trùng góc với bài cùng series. Quản lý tại{" "}
              <Link href="/series" className="text-[var(--accent)] underline-offset-2 hover:underline">
                Series
              </Link>
              .
            </FieldHint>
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
              Để trống → hệ thống tự chọn 1 dòng từ seed_topics theo domain (Domain Profile +
              Settings), tránh trùng bài đã có.
            </FieldHint>
          </div>

          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-muted)]/40 p-4 space-y-4">
            <p className="text-sm font-semibold text-[var(--ink)]">Cấu hình bài viết</p>
            <div>
              <Label htmlFor="words">Số từ gợi ý (bản sạch)</Label>
              <Input
                id="words"
                type="number"
                min={MIN_TARGET_WORD_COUNT}
                max={MAX_TARGET_WORD_COUNT}
                step={50}
                value={targetWordCount}
                onChange={(e) => {
                  const n = Number(e.target.value) || DEFAULT_TARGET_WORD_COUNT;
                  setTargetWordCount(
                    Math.max(MIN_TARGET_WORD_COUNT, Math.min(MAX_TARGET_WORD_COUNT, n)),
                  );
                }}
              />
              <FieldHint>
                Prefill theo format; tối đa {MAX_TARGET_WORD_COUNT}. Đổi được trước khi chạy.
              </FieldHint>
            </div>
            <div>
              <Label htmlFor="avoid-formats">Tránh format</Label>
              <Input
                id="avoid-formats"
                value={avoidFormats}
                onChange={(e) => setAvoidFormats(e.target.value)}
                placeholder="vd. table, mermaid, emoji, blockquote, numbered outline…"
              />
              <FieldHint>
                Nhập tự do (phẩy hoặc câu ngắn). Máy vẫn siết table/mermaid/listicle nếu anh ghi
                các từ đó. Áp vào Viết + Bản sạch.
              </FieldHint>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
              {error}
            </div>
          )}

          <Button type="submit" busy={loading} disabled={loading || quotaBlocked} className="rounded-full">
            Tạo & mở chu trình viết
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
                "Viết theo format đã chọn",
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
            Cùng pipeline TFES — đầu ra khác nhau: blog, field note, ADR, postmortem, brief, thread.
            Series giúp kho trí thức có chiều sâu; Digest tuần tận dụng bài điểm cao.
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
