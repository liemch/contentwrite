"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select } from "@/components/ui/input";
import type { AutoWriteSettings } from "@/lib/auto-write/schedule";
import {
  CREATION_MODES,
  type CreationMode,
} from "@/lib/editor-journey";
import {
  DEFAULT_AVOID_FORMATS,
  DEFAULT_TARGET_WORD_COUNT,
  FAST_TARGET_WORD_COUNT,
  MAX_TARGET_WORD_COUNT,
  MIN_TARGET_WORD_COUNT,
  normalizeAvoidFormatsText,
} from "@/lib/tfes/writing-prefs";
import { MemoryHints } from "@/components/memory-hints";
import { SAMPLE_TOPICS_BY_DOMAIN } from "@/lib/sample-topics";
import { domainSelectOptions } from "@/lib/tfes/domains";
import { PUBLISH_FORMATS, PUBLISH_FORMAT_IDS, type PublishFormatId } from "@/lib/tfes/publish-formats";
import {
  resolveShapeSelection,
  shapesCompatibleWithFormat,
} from "@/lib/tfes/shape-selection";
import { wordsToSyllables } from "@/lib/tfes/word-count";

type SeriesOption = { id: string; title: string; domain: string };

export default function NewArticlePage() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [domain, setDomain] = useState("engineering");
  const [creationMode, setCreationMode] = useState<CreationMode>("standard");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [publishFormat, setPublishFormat] = useState<PublishFormatId>("blog");
  const [articleShapeId, setArticleShapeId] = useState<string>("auto");
  const [seriesId, setSeriesId] = useState("");
  const [seriesList, setSeriesList] = useState<SeriesOption[]>([]);
  const [targetWordCount, setTargetWordCount] = useState<number>(DEFAULT_TARGET_WORD_COUNT);
  const [avoidFormats, setAvoidFormats] = useState(DEFAULT_AVOID_FORMATS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [quota, setQuota] = useState<{ limit: number; used: number; remaining: number } | null>(
    null,
  );

  const modeMeta = CREATION_MODES[creationMode];

  useEffect(() => {
    setTargetWordCount(
      creationMode === "fast" ? FAST_TARGET_WORD_COUNT : DEFAULT_TARGET_WORD_COUNT,
    );
  }, [creationMode]);

  const shapeMeta = useMemo(
    () =>
      resolveShapeSelection({
        publishFormat,
        domain,
        articleShapeId: articleShapeId === "auto" ? null : articleShapeId,
        requestedMode: articleShapeId === "auto" ? "auto" : "manual",
      }),
    [publishFormat, domain, articleShapeId],
  );
  const shapeChoices = useMemo(
    () => shapesCompatibleWithFormat(publishFormat, domain),
    [publishFormat, domain],
  );
  const recommendedShapes = useMemo(
    () => shapeChoices.filter((item) => item.recommended),
    [shapeChoices],
  );

  useEffect(() => {
    if (articleShapeId === "auto") return;
    if (shapeMeta.lockedByFormat) return;
    const stillOk = recommendedShapes.some((item) => item.id === articleShapeId);
    if (!stillOk) setArticleShapeId("auto");
  }, [domain, publishFormat]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch("/api/settings/auto-write")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { config?: AutoWriteSettings } | null) => {
        if (!data?.config || creationMode === "fast") return;
        setTargetWordCount(data.config.defaultTargetWordCount || DEFAULT_TARGET_WORD_COUNT);
        setAvoidFormats(
          normalizeAvoidFormatsText(data.config.defaultAvoidFormats || DEFAULT_AVOID_FORMATS) ||
            DEFAULT_AVOID_FORMATS,
        );
      })
      .catch(() => {});

    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { quota?: { limit: number; used: number; remaining: number } } | null) => {
        if (data?.quota) setQuota(data.quota);
      })
      .catch(() => {});

    fetch("/api/series")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { series?: SeriesOption[] } | null) => {
        setSeriesList(data?.series ?? []);
      })
      .catch(() => setSeriesList([]));
  }, [creationMode]);

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
        creationMode,
        articleShapeId: articleShapeId === "auto" ? "auto" : articleShapeId,
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
    router.push(`/articles/${data.article.id}?autorun=1`);
  }

  const quotaBlocked = quota != null && quota.remaining <= 0;
  const formatMeta = PUBLISH_FORMATS[publishFormat];
  const seriesForDomain = seriesList.filter((s) => s.domain === domain);

  return (
    <AppShell
      title="Viết bài mới"
      subtitle="Chỉ cần chủ đề + domain — hệ thống tự chạy chu trình sau khi tạo."
      backHref="/dashboard"
      backLabel="Biên tập"
    >
      {quota && (
        <div className="mb-5 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink-muted)]">
          Hôm nay còn{" "}
          <span className="font-semibold text-[var(--ink)]">
            {quota.remaining}/{quota.limit}
          </span>{" "}
          bài.
          {quotaBlocked && (
            <span className="ml-1 text-[var(--danger)]">Đã hết hạn mức — liên hệ admin.</span>
          )}
        </div>
      )}

      <MemoryHints domain={domain} topic={topic} seriesId={seriesId || undefined} />

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <form onSubmit={onSubmit} className="surface-card space-y-6 p-4 sm:p-8">
          <div>
            <Label htmlFor="topic">Chủ đề bài viết</Label>
            <Input
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="VD: Khi nào không nên dùng agent thay cron job"
              autoFocus
            />
            <FieldHint>
              Càng cụ thể càng tốt. Để trống → hệ thống tự chọn chủ đề từ seed theo domain.
            </FieldHint>
            {(SAMPLE_TOPICS_BY_DOMAIN[domain] ?? []).length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {(SAMPLE_TOPICS_BY_DOMAIN[domain] ?? []).map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => setTopic(sample)}
                    className="rounded-full border border-[var(--line)] bg-[var(--surface-muted)] px-3 py-1.5 text-left text-xs text-[var(--ink-muted)] transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div>
            <Label htmlFor="domain">Lĩnh vực</Label>
            <Select
              id="domain"
              value={domain}
              onChange={(e) => {
                setDomain(e.target.value);
                setSeriesId("");
              }}
            >
              {domainSelectOptions().map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-[var(--ink)]">Tốc độ viết</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(Object.keys(CREATION_MODES) as CreationMode[]).map((mode) => {
                const meta = CREATION_MODES[mode];
                const active = creationMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setCreationMode(mode)}
                    className={`rounded-xl border px-3 py-3 text-left transition ${
                      active
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-[0_0_0_2px_var(--accent-glow)]"
                        : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--accent)]/40"
                    }`}
                  >
                    <span className="text-sm font-semibold text-[var(--ink)]">{meta.label}</span>
                    <span className="mt-1 block text-[11px] leading-snug text-[var(--ink-muted)]">
                      {meta.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            className="text-sm font-medium text-[var(--accent)] hover:underline"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? "▾ Ẩn tùy chọn nâng cao" : "▸ Tùy chọn nâng cao (format, khung, series…)"}
          </button>

          {showAdvanced && (
            <div className="space-y-5 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)]/40 p-4">
              <div>
                <Label htmlFor="format">Định dạng xuất bản</Label>
                <Select
                  id="format"
                  value={publishFormat}
                  onChange={(e) => {
                    const next = e.target.value as PublishFormatId;
                    setPublishFormat(next);
                    if (creationMode === "standard") {
                      setTargetWordCount(PUBLISH_FORMATS[next].wordHint);
                    }
                    const nextMeta = resolveShapeSelection({
                      publishFormat: next,
                      domain,
                      requestedMode: "auto",
                    });
                    setArticleShapeId(nextMeta.lockedByFormat ? nextMeta.shape!.id : "auto");
                  }}
                >
                  {PUBLISH_FORMAT_IDS.map((id) => (
                    <option key={id} value={id}>
                      {PUBLISH_FORMATS[id].labelVi}
                    </option>
                  ))}
                </Select>
                <FieldHint>{formatMeta.desc}</FieldHint>
              </div>

              <div>
                <Label htmlFor="shape">Khung bài</Label>
                <Select
                  id="shape"
                  value={shapeMeta.lockedByFormat ? shapeMeta.shape!.id : articleShapeId}
                  disabled={shapeMeta.lockedByFormat}
                  onChange={(e) => setArticleShapeId(e.target.value)}
                >
                  {!shapeMeta.lockedByFormat && (
                    <option value="auto">Tự chọn theo domain</option>
                  )}
                  {recommendedShapes.map((shape) => (
                    <option key={shape.id} value={shape.id}>
                      {shape.labelVi}
                    </option>
                  ))}
                </Select>
                <FieldHint>{shapeMeta.hint}</FieldHint>
              </div>

              <div>
                <Label htmlFor="series">Series</Label>
                <Select
                  id="series"
                  value={seriesId}
                  onChange={(e) => setSeriesId(e.target.value)}
                >
                  <option value="">Không gắn series</option>
                  {seriesForDomain.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label htmlFor="words">Số từ mục tiêu</Label>
                <Input
                  id="words"
                  type="number"
                  min={MIN_TARGET_WORD_COUNT}
                  max={MAX_TARGET_WORD_COUNT}
                  step={50}
                  value={targetWordCount}
                  onChange={(e) => {
                    const n = Number(e.target.value) || modeMeta.wordTarget;
                    setTargetWordCount(
                      Math.max(MIN_TARGET_WORD_COUNT, Math.min(MAX_TARGET_WORD_COUNT, n)),
                    );
                  }}
                />
                <FieldHint>
                  ≈ {wordsToSyllables(targetWordCount)} tiếng · tối đa {MAX_TARGET_WORD_COUNT}
                </FieldHint>
              </div>

              <div>
                <Label htmlFor="avoid-formats">Tránh format</Label>
                <Input
                  id="avoid-formats"
                  value={avoidFormats}
                  onChange={(e) => setAvoidFormats(e.target.value)}
                  placeholder="table, mermaid…"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
              {error}
            </div>
          )}

          <div className="rounded-xl border border-[rgba(12,110,107,0.2)] bg-[var(--accent-soft)]/60 px-4 py-3 text-sm text-[var(--ink-muted)]">
            Sau khi tạo, hệ thống <strong>tự chạy chu trình</strong> (~{modeMeta.etaMinutes} phút
            ước lượng). <strong>Giữ tab mở</strong> — có lúc dừng chờ anh/chị xác nhận Review.
          </div>

          <Button
            type="submit"
            busy={loading}
            disabled={loading || quotaBlocked}
            className="w-full rounded-full sm:w-auto"
          >
            {loading ? "Đang tạo…" : "Tạo & bắt đầu viết"}
          </Button>
        </form>

        <aside className="space-y-4">
          <div className="hero-band p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
              Quy trình (6 bước dễ hiểu)
            </p>
            <ol className="mt-4 space-y-3">
              {[
                "Nghiên cứu nguồn",
                "Chốt góc bài",
                "Viết nháp",
                "Review & chỉnh",
                "Kiểm tra fact",
                "Hoàn thiện bản đăng",
              ].map((step, i) => (
                <li key={step} className="flex items-center gap-3 text-sm text-[var(--ink-muted)]">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-bold text-[var(--accent)]">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
          <div className="surface-soft p-5 text-sm leading-relaxed text-[var(--ink-muted)]">
            Chế độ <strong>Nhanh</strong> phù hợp thử ý tưởng. <strong>Chuẩn</strong> cho bài đăng
            chính thức. Cả hai đều qua review AI + fact-check — không bỏ chất lượng, chỉ rút độ
            dài.
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
