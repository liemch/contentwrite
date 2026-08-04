"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { UsersAdminPanel } from "@/components/users-admin-panel";
import { TfesDocsEditor } from "@/components/tfes-docs-editor";
import { ArticleShapeManager } from "@/components/article-shape-manager";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import type { AutoWriteSettings } from "@/lib/auto-write/schedule";
import {
  MAX_TARGET_WORD_COUNT,
  MIN_TARGET_WORD_COUNT,
  normalizeAvoidFormatsText,
} from "@/lib/tfes/writing-prefs";
import { DOMAIN_IDS, domainSelectOptions, type DomainId } from "@/lib/tfes/domains";
import { PIPELINE_CONFIG } from "@/lib/tfes/pipeline-config";

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function SettingsPage() {
  const router = useRouter();
  const [config, setConfig] = useState<AutoWriteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [adminUsers, setAdminUsers] = useState<{ id: string; email: string }[]>([]);

  const [checking, setChecking] = useState(false);
  const [health, setHealth] = useState<{
    ok?: boolean;
    tavily?: { ok: boolean; detail: string; ms?: number };
    nvidia?: { ok: boolean; detail: string; ms?: number; pending?: boolean };
  } | null>(null);

  const [suggesting, setSuggesting] = useState<DomainId | null>(null);
  const [seedPreview, setSeedPreview] = useState<{
    domain: DomainId;
    topics: string[];
    searchHits: number;
  } | null>(null);

  async function load() {
    setLoading(true);
    const meRes = await fetch("/api/auth/me");
    if (!meRes.ok) {
      router.replace("/login");
      return;
    }
    const me = (await meRes.json()) as { user?: { role?: string } };
    if (me.user?.role !== "ADMIN") {
      router.replace("/dashboard");
      return;
    }

    const [res, usersRes] = await Promise.all([
      fetch("/api/settings/auto-write"),
      fetch("/api/users"),
    ]);
    setLoading(false);
    if (!res.ok) {
      setError("Không tải được cấu hình");
      return;
    }
    const data = (await res.json()) as { config: AutoWriteSettings };
    setConfig(data.config);

    if (usersRes.ok) {
      const ud = (await usersRes.json()) as {
        users: { id: string; email: string; role: string; active: boolean }[];
      };
      setAdminUsers(
        ud.users.filter((u) => u.role === "ADMIN" && u.active).map((u) => ({ id: u.id, email: u.email })),
      );
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function checkIntegrations() {
    setChecking(true);
    setError("");
    setMessage("");
    setHealth(null);

    try {
      // 1) Tavily nhanh
      const tavilyRes = await fetch("/api/health/tavily", {
        signal: AbortSignal.timeout(15000),
      });
      let tavilyData: {
        ok?: boolean;
        tavily?: { ok: boolean; detail: string; ms?: number };
        error?: string;
      } = {};
      try {
        tavilyData = (await tavilyRes.json()) as typeof tavilyData;
      } catch {
        /* ignore */
      }

      if (tavilyRes.status === 401 || tavilyData.error === "Unauthorized") {
        setError("Phiên đăng nhập hết hạn — reload / login lại rồi Test.");
        return;
      }

      if (!tavilyRes.ok && !tavilyData.tavily) {
        setHealth({
          ok: false,
          tavily: {
            ok: false,
            detail: tavilyData.error || `HTTP ${tavilyRes.status}`,
            ms: 0,
          },
        });
        setMessage("Tavily lỗi — kiểm tra TAVILY_API_KEY trên Vercel.");
        return;
      }

      setHealth({
        ok: Boolean(tavilyData.tavily?.ok),
        tavily: tavilyData.tavily,
        nvidia: { ok: false, detail: "Đang kiểm tra NVIDIA…", ms: 0, pending: true },
      });

      // 2) NVIDIA riêng (≤20s server-side)
      let nvidiaRes: Response;
      try {
        nvidiaRes = await fetch("/api/health/tavily?nvidia=1", {
          signal: AbortSignal.timeout(45000),
        });
      } catch (e) {
        const aborted = e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
        const detail = aborted
          ? "Timeout phía trình duyệt (45s) — NIM chậm hoặc mạng/Vercel"
          : e instanceof Error
            ? e.message
            : "Không gọi được NVIDIA health";
        setHealth({
          ok: false,
          tavily: tavilyData.tavily,
          nvidia: { ok: false, detail, ms: 0 },
        });
        setMessage("Tavily OK — NVIDIA lỗi/timeout (xem panel).");
        return;
      }

      let nvidiaData: {
        ok?: boolean;
        tavily?: { ok: boolean; detail: string; ms?: number };
        nvidia?: { ok: boolean; detail: string; ms?: number };
        error?: string;
      } = {};
      try {
        nvidiaData = (await nvidiaRes.json()) as typeof nvidiaData;
      } catch {
        setHealth({
          ok: false,
          tavily: tavilyData.tavily,
          nvidia: {
            ok: false,
            detail: `Phản hồi không phải JSON (HTTP ${nvidiaRes.status}) — thường là 504`,
            ms: 0,
          },
        });
        setMessage("Tavily OK — NVIDIA lỗi/timeout (xem panel).");
        return;
      }

      const nvidia =
        nvidiaData.nvidia ??
        ({
          ok: false,
          detail: nvidiaData.error || `Không có kết quả NVIDIA (HTTP ${nvidiaRes.status})`,
          ms: 0,
        } as const);

      setHealth({
        ok: Boolean((nvidiaData.tavily ?? tavilyData.tavily)?.ok && nvidia.ok),
        tavily: nvidiaData.tavily ?? tavilyData.tavily,
        nvidia,
      });

      if ((nvidiaData.tavily ?? tavilyData.tavily)?.ok && nvidia.ok) {
        setMessage("Tavily + NVIDIA đều OK.");
      } else if ((nvidiaData.tavily ?? tavilyData.tavily)?.ok) {
        setMessage("Tavily OK — NVIDIA lỗi/timeout (xem panel).");
      } else {
        setMessage("Tavily lỗi — kiểm tra TAVILY_API_KEY trên Vercel.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không kiểm tra được");
    } finally {
      setChecking(false);
    }
  }

  async function suggestSeeds(domain: DomainId) {
    if (!config) return;
    setSuggesting(domain);
    setError("");
    setMessage("");
    setSeedPreview(null);
    const existing =
      domain === "engineering" ? config.seedTopicsEngineering : config.seedTopicsSoftSkills;
    try {
      const res = await fetch("/api/settings/suggest-seeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, existingSeeds: existing }),
      });
      const data = (await res.json()) as {
        error?: string;
        topics?: string[];
        searchHits?: number;
        count?: number;
      };
      if (!res.ok) {
        setError(data.error ?? "Gợi ý seed thất bại");
        return;
      }
      setSeedPreview({
        domain,
        topics: data.topics ?? [],
        searchHits: data.searchHits ?? 0,
      });
      setMessage(
        `Đã gợi ý ${data.count ?? data.topics?.length ?? 0} seed trend (${domain}) từ ${data.searchHits ?? "?"} nguồn · chưa lưu — chọn Thêm hoặc Thay thế.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi mạng khi gợi ý seed");
    } finally {
      setSuggesting(null);
    }
  }

  function applySeedPreview(mode: "append" | "replace") {
    if (!config || !seedPreview) return;
    const blob = seedPreview.topics.join("\n");
    if (seedPreview.domain === "engineering") {
      const next =
        mode === "replace"
          ? blob
          : [config.seedTopicsEngineering.trim(), blob].filter(Boolean).join("\n");
      setConfig({ ...config, seedTopicsEngineering: next });
    } else if (seedPreview.domain === "soft-skills") {
      const next =
        mode === "replace"
          ? blob
          : [config.seedTopicsSoftSkills.trim(), blob].filter(Boolean).join("\n");
      setConfig({ ...config, seedTopicsSoftSkills: next });
    } else {
      // product / ai-ml / security — ghi vào Custom topics (chưa có cột seed riêng)
      const next =
        mode === "replace"
          ? blob
          : [config.customTopics.trim(), blob].filter(Boolean).join("\n");
      setConfig({ ...config, customTopics: next });
    }
    setSeedPreview(null);
    setMessage(
      mode === "replace"
        ? `Đã thay seed ${seedPreview.domain} — nhớ bấm Lưu cấu hình.`
        : `Đã thêm seed vào ${seedPreview.domain} — nhớ bấm Lưu cấu hình.`,
    );
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    setError("");
    setMessage("");
    const res = await fetch("/api/settings/auto-write", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: config.enabled,
        scheduleMode: config.scheduleMode,
        intervalHours: config.intervalHours,
        preferredHour: config.preferredHour,
        timezone: config.timezone,
        domain: config.domain,
        useSeedTopics: config.useSeedTopics,
        customTopics: config.customTopics,
        seedTopicsEngineering: config.seedTopicsEngineering,
        seedTopicsSoftSkills: config.seedTopicsSoftSkills,
        maxPendingReview: config.maxPendingReview,
        defaultTargetWordCount: config.defaultTargetWordCount,
        defaultAvoidFormats: normalizeAvoidFormatsText(config.defaultAvoidFormats),
        ownerUserId: config.ownerUserId,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Lưu thất bại");
      return;
    }
    const data = (await res.json()) as { config: AutoWriteSettings };
    setConfig(data.config);
    setMessage("Đã lưu cấu hình. Lịch chạy kế tiếp đã được tính lại.");
  }

  async function runNow() {
    if (!config) return;
    const ok = window.confirm(
      "Chạy auto-write ngay? Mỗi lần gọi chỉ 1 bước (tránh 504 trên Vercel Hobby). Em sẽ lặp đến Chờ duyệt.",
    );
    if (!ok) return;
    setRunning(true);
    setError("");
    setMessage("Đang chạy từng bước…");

    let articleId: string | undefined;
    let topic: string | undefined;
    let lastStatus = "";
    let lastError: string | undefined;

    try {
      for (let i = 0; i < PIPELINE_CONFIG.retries.autoWriteRunNowMaxSteps; i++) {
        setMessage(`Đang chạy bước ${i + 1}/${PIPELINE_CONFIG.retries.autoWriteRunNowMaxSteps}…`);
        let res: Response;
        try {
          res = await fetch("/api/auto-write/run", { method: "POST" });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Mất kết nối";
          setError(`Không gọi được API: ${msg}`);
          break;
        }

        let data: {
          ran?: boolean;
          skipped?: string;
          articleId?: string;
          status?: string;
          topic?: string;
          error?: string;
        } = {};
        try {
          data = (await res.json()) as typeof data;
        } catch {
          /* 504 HTML */
        }

        if (res.status === 504 || res.status === 408) {
          setError(
            "Timeout 504 (Vercel Hobby ~60s). Bấm Chạy ngay lại — sẽ tiếp tục bài dở.",
          );
          break;
        }
        if (!res.ok) {
          setError(data.error || `HTTP ${res.status}`);
          break;
        }
        if (!data.ran) {
          setMessage(`Bỏ qua: ${data.skipped}`);
          break;
        }

        articleId = data.articleId ?? articleId;
        topic = data.topic ?? topic;
        lastStatus = data.status ?? lastStatus;
        lastError = data.error;

        if (lastStatus === "PUBLISH_READY" || lastStatus === "FAILED") {
          setMessage(
            `Xong → ${lastStatus}. Chủ đề: ${topic ?? "—"}${
              articleId ? ` · /articles/${articleId}` : ""
            }${lastError ? ` · Lỗi: ${lastError}` : ""}`,
          );
          break;
        }
        if (i === PIPELINE_CONFIG.retries.autoWriteRunNowMaxSteps - 1) {
          setMessage(
            `Chưa xong (${lastStatus}). Bấm Chạy ngay lại hoặc mở /articles/${articleId ?? ""}`,
          );
        }
      }
    } finally {
      setRunning(false);
      await load();
    }
  }

  return (
    <AppShell
      title="Cài đặt"
      subtitle="Users, tài liệu AI-TFES (.md), auto-write và kiểm tra API."
      backHref="/dashboard"
      backLabel="Biên tập"
    >
      <div className="mb-6">
        <UsersAdminPanel />
      </div>

      <div className="mb-6">
        <TfesDocsEditor />
      </div>

      <div className="mb-6">
        <ArticleShapeManager />
      </div>

      {loading || !config ? (
        <div className="h-64 animate-pulse rounded-2xl bg-[var(--surface-muted)]" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <form onSubmit={onSave} className="surface-card space-y-6 p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[var(--ink)]">Bật auto-write</p>
                <p className="text-xs text-[var(--ink-muted)]">
                  Cron Hobby chạy 1 lần/ngày; mỗi lần chỉ chạy 1 bước chu trình (tránh 504).
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={config.enabled}
                onClick={() => setConfig({ ...config, enabled: !config.enabled })}
                className={`relative h-8 w-14 rounded-full transition ${
                  config.enabled ? "bg-[var(--accent)]" : "bg-[var(--line-strong)]"
                }`}
              >
                <span
                  className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white shadow transition ${
                    config.enabled ? "translate-x-6" : ""
                  }`}
                />
              </button>
            </div>

            <div>
              <Label htmlFor="ownerUserId">Owner bài auto-write</Label>
              <Select
                id="ownerUserId"
                value={config.ownerUserId ?? ""}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    ownerUserId: e.target.value || null,
                  })
                }
              >
                <option value="">— Chưa chọn —</option>
                {adminUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.email}
                  </option>
                ))}
              </Select>
              <FieldHint>
                Bài auto gắn createdById của admin này (không trừ hạn mức editor).
              </FieldHint>
            </div>

            <div>
              <Label htmlFor="scheduleMode">Lịch chạy</Label>
              <Select
                id="scheduleMode"
                value={config.scheduleMode}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    scheduleMode: e.target.value === "interval" ? "interval" : "daily",
                  })
                }
              >
                <option value="daily">Mỗi ngày vào giờ cố định</option>
                <option value="interval">Mỗi N giờ</option>
              </Select>
            </div>

            {config.scheduleMode === "daily" ? (
              <div>
                <Label htmlFor="preferredHour">Giờ chạy (0–23)</Label>
                <Input
                  id="preferredHour"
                  type="number"
                  min={0}
                  max={23}
                  value={config.preferredHour}
                  onChange={(e) =>
                    setConfig({ ...config, preferredHour: Number(e.target.value) || 0 })
                  }
                />
                <FieldHint>Timezone mặc định: Asia/Ho_Chi_Minh (UTC+7).</FieldHint>
              </div>
            ) : (
              <div>
                <Label htmlFor="intervalHours">Khoảng cách (giờ)</Label>
                <Input
                  id="intervalHours"
                  type="number"
                  min={1}
                  max={168}
                  value={config.intervalHours}
                  onChange={(e) =>
                    setConfig({ ...config, intervalHours: Number(e.target.value) || 24 })
                  }
                />
                <FieldHint>Ví dụ 6 = khoảng 4 bài/ngày (nếu chưa đầy hàng chờ duyệt).</FieldHint>
              </div>
            )}

            <div>
              <Label htmlFor="domain">Domain</Label>
              <Select
                id="domain"
                value={config.domain}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    domain: e.target.value as AutoWriteSettings["domain"],
                  })
                }
              >
                <option value="rotate">Xoay vòng tất cả domain</option>
                {domainSelectOptions().map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="maxPendingReview">Tối đa bài chờ duyệt</Label>
              <Input
                id="maxPendingReview"
                type="number"
                min={1}
                max={20}
                value={config.maxPendingReview}
                onChange={(e) =>
                  setConfig({ ...config, maxPendingReview: Number(e.target.value) || 3 })
                }
              />
              <FieldHint>
                Gồm bài PUBLISH_READY (chờ Approve) và bài đang chờ người xác nhận Review AI.
                Đủ số này thì auto bỏ qua lần chạy (không spam hàng chờ).
              </FieldHint>
            </div>

            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)]/60 p-4 space-y-4">
              <div>
                <p className="text-sm font-semibold text-[var(--ink)]">Mặc định bài viết</p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">
                  Prefill form Tạo bài mới và copy vào bài auto-write. Bản sạch = bài đọc liền (không
                  heading biên tập).
                </p>
              </div>
              <div>
                <Label htmlFor="defaultTargetWordCount">Số từ gợi ý (bản sạch)</Label>
                <Input
                  id="defaultTargetWordCount"
                  type="number"
                  min={MIN_TARGET_WORD_COUNT}
                  max={MAX_TARGET_WORD_COUNT}
                  step={50}
                  value={config.defaultTargetWordCount ?? 1200}
                  onChange={(e) => {
                    const n = Number(e.target.value) || 1200;
                    setConfig({
                      ...config,
                      defaultTargetWordCount: Math.max(
                        MIN_TARGET_WORD_COUNT,
                        Math.min(MAX_TARGET_WORD_COUNT, n),
                      ),
                    });
                  }}
                />
                <FieldHint>Tối đa {MAX_TARGET_WORD_COUNT} từ (đếm khoảng trắng).</FieldHint>
              </div>
              <div>
                <Label htmlFor="defaultAvoidFormats">Tránh format (mặc định)</Label>
                <Input
                  id="defaultAvoidFormats"
                  value={config.defaultAvoidFormats ?? ""}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      defaultAvoidFormats: e.target.value,
                    })
                  }
                  placeholder="vd. table, mermaid, emoji, blockquote…"
                />
                <FieldHint>
                  Chuỗi tự do — prefill khi Tạo bài / auto-write. Gợi ý phổ biến: table, mermaid,
                  numbered_outline.
                </FieldHint>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <input
                id="useSeedTopics"
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-[var(--line-strong)]"
                checked={config.useSeedTopics}
                onChange={(e) => setConfig({ ...config, useSeedTopics: e.target.checked })}
              />
              <div>
                <label htmlFor="useSeedTopics" className="text-sm font-medium text-[var(--ink)]">
                  Ghép seed từ Domain Profile (file AI-TFES)
                </label>
                <FieldHint>
                  Bật = lấy seed trong Domain Profile ({DOMAIN_IDS.join(", ")}) + seed Cài đặt bên
                  dưới (engineering / soft-skills). product / ai-ml / security: seed trong file
                  profile + Custom topics. Tắt = chỉ seed Cài đặt + custom.
                </FieldHint>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)]/60 p-4 space-y-4">
              <div>
                <p className="text-sm font-semibold text-[var(--ink)]">Seed topics theo miền</p>
                <p className="mt-1 text-xs text-[var(--ink-muted)]">
                  Mỗi dòng một chủ đề. Nút ✨: Tavily (≈3 tháng) + AI format 20–30 seed trend — anh
                  duyệt Thêm/Thay trước khi Lưu.
                </p>
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <Label htmlFor="seedTopicsEngineering">Engineering</Label>
                  <button
                    type="button"
                    title="Gợi ý seed trend 3 tháng (Tavily + NVIDIA)"
                    disabled={!!suggesting || saving || running}
                    onClick={() => suggestSeeds("engineering")}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--line-strong)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--accent)] transition hover:border-[var(--accent)] disabled:opacity-50"
                  >
                    {suggesting === "engineering" ? "Đang quét…" : "✨ Trend"}
                  </button>
                </div>
                <Textarea
                  id="seedTopicsEngineering"
                  rows={5}
                  value={config.seedTopicsEngineering}
                  onChange={(e) =>
                    setConfig({ ...config, seedTopicsEngineering: e.target.value })
                  }
                  placeholder={"API versioning pitfalls\nObservability cơ bản\n..."}
                />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <Label htmlFor="seedTopicsSoftSkills">Soft skills</Label>
                  <button
                    type="button"
                    title="Gợi ý seed trend 3 tháng (Tavily + NVIDIA)"
                    disabled={!!suggesting || saving || running}
                    onClick={() => suggestSeeds("soft-skills")}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--line-strong)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--accent)] transition hover:border-[var(--accent)] disabled:opacity-50"
                  >
                    {suggesting === "soft-skills" ? "Đang quét…" : "✨ Trend"}
                  </button>
                </div>
                <Textarea
                  id="seedTopicsSoftSkills"
                  rows={5}
                  value={config.seedTopicsSoftSkills}
                  onChange={(e) => setConfig({ ...config, seedTopicsSoftSkills: e.target.value })}
                  placeholder={"Feedback khó\nDecision-making dưới áp lực\n..."}
                />
              </div>

              {seedPreview && (
                <div className="rounded-xl border border-[rgba(12,110,107,0.25)] bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
                    Preview · {seedPreview.domain} · {seedPreview.topics.length} seed ·{" "}
                    {seedPreview.searchHits} nguồn
                  </p>
                  <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto text-sm text-[var(--ink-muted)]">
                    {seedPreview.topics.map((t) => (
                      <li key={t} className="leading-snug">
                        · {t}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-full"
                      onClick={() => applySeedPreview("append")}
                    >
                      Thêm vào seed
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="rounded-full"
                      onClick={() => applySeedPreview("replace")}
                    >
                      Thay thế toàn bộ
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="rounded-full"
                      onClick={() => setSeedPreview(null)}
                    >
                      Bỏ preview
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="customTopics">Chủ đề chung thêm (mọi miền)</Label>
              <Textarea
                id="customTopics"
                rows={4}
                value={config.customTopics}
                onChange={(e) => setConfig({ ...config, customTopics: e.target.value })}
                placeholder={"Chủ đề dùng chung mọi domain (kể cả product / ai-ml / security)\n..."}
              />
              <FieldHint>Ghép thêm vào pool bất kể domain đang chạy (rotate cũng dùng).</FieldHint>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
                {error}
              </div>
            )}
            {message && (
              <div className="rounded-xl border border-[rgba(12,110,107,0.2)] bg-[var(--accent-soft)] px-3.5 py-2.5 text-sm text-[var(--accent)]">
                {message}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving || running} className="rounded-full">
                {saving ? "Đang lưu..." : "Lưu cấu hình"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={saving || running}
                onClick={runNow}
                className="rounded-full"
              >
                {running ? "Đang chạy chu trình..." : "Chạy ngay 1 bài"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={saving || running || checking}
                onClick={checkIntegrations}
                className="rounded-full"
              >
                {checking ? "Đang kiểm tra..." : "Test Tavily + NVIDIA"}
              </Button>
            </div>
          </form>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <div className="surface-card p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
                Kiểm tra API
              </p>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                Ping Tavily + NVIDIA để biết key còn sống (không chạy chu trình viết).
              </p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-4 rounded-full"
                disabled={checking || saving || running}
                onClick={checkIntegrations}
              >
                {checking ? "Đang kiểm tra..." : "Test Tavily + NVIDIA"}
              </Button>
              {health && (
                <ul className="mt-4 space-y-2 text-sm">
                  <li
                    className={
                      health.tavily?.ok ? "text-[var(--success)]" : "text-[var(--danger)]"
                    }
                  >
                    <strong>Tavily:</strong> {health.tavily?.ok ? "OK" : "LỖI"} —{" "}
                    {health.tavily?.detail}
                    {health.tavily?.ms != null ? ` · ${health.tavily.ms}ms` : ""}
                  </li>
                  <li
                    className={
                      health.nvidia?.pending
                        ? "text-[var(--ink-muted)]"
                        : health.nvidia?.ok
                          ? "text-[var(--success)]"
                          : "text-[var(--danger)]"
                    }
                  >
                    <strong>NVIDIA:</strong>{" "}
                    {health.nvidia?.pending
                      ? "Đang kiểm tra…"
                      : health.nvidia?.ok
                        ? "OK"
                        : "LỖI"}{" "}
                    — {health.nvidia?.detail}
                    {health.nvidia?.ms != null && !health.nvidia.pending
                      ? ` · ${Math.round((health.nvidia.ms || 0) / 1000)}s`
                      : ""}
                  </li>
                </ul>
              )}
            </div>

            <div className="hero-band p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
                Trạng thái
              </p>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-[var(--ink-faint)]">Trạng thái</dt>
                  <dd className="font-medium text-[var(--ink)]">
                    {config.enabled ? "Đang bật" : "Đang tắt"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--ink-faint)]">Lần chạy gần nhất</dt>
                  <dd className="font-medium text-[var(--ink)]">{formatWhen(config.lastRunAt)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--ink-faint)]">Lần chạy kế tiếp</dt>
                  <dd className="font-medium text-[var(--ink)]">{formatWhen(config.nextRunAt)}</dd>
                </div>
                {config.lastArticleId && (
                  <div>
                    <dt className="text-[var(--ink-faint)]">Bài gần nhất</dt>
                    <dd>
                      <a
                        className="font-medium text-[var(--accent)] underline"
                        href={`/articles/${config.lastArticleId}`}
                      >
                        Mở workspace →
                      </a>
                    </dd>
                  </div>
                )}
                {config.lastError && (
                  <div>
                    <dt className="text-[var(--ink-faint)]">Ghi chú / lỗi</dt>
                    <dd className="text-[var(--danger)]">{config.lastError}</dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="surface-soft p-5 text-sm text-[var(--ink-muted)]">
              <p className="font-semibold text-[var(--ink)]">Luồng auto</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>Chọn topic mới (seed / custom), tránh trùng bài đã có</li>
                <li>Chạy Research → Insight → Write → Finalize</li>
                <li>Dừng ở <strong>Chờ duyệt</strong> — không tự Approve/Publish</li>
              </ol>
              <p className="mt-3 text-xs text-[var(--ink-faint)]">
                Hết chủ đề mới → auto bỏ qua lần chạy (không viết lại bài cũ). Thêm Custom
                topics hoặc xoá bài lỗi khỏi kho. Production: Vercel Cron +{" "}
                <code>CRON_SECRET</code>.
              </p>
            </div>
          </aside>
        </div>
      )}
    </AppShell>
  );
}
