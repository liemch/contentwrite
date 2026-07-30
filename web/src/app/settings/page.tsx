"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import type { AutoWriteSettings } from "@/lib/auto-write/schedule";

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function SettingsPage() {
  const [config, setConfig] = useState<AutoWriteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [checking, setChecking] = useState(false);
  const [health, setHealth] = useState<{
    ok?: boolean;
    tavily?: { ok: boolean; detail: string; ms?: number };
    nvidia?: { ok: boolean; detail: string; ms?: number };
  } | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/settings/auto-write");
    setLoading(false);
    if (!res.ok) {
      setError("Không tải được cấu hình");
      return;
    }
    const data = (await res.json()) as { config: AutoWriteSettings };
    setConfig(data.config);
  }

  useEffect(() => {
    load();
  }, []);

  async function checkIntegrations() {
    setChecking(true);
    setError("");
    setMessage("");
    setHealth(null);

    const controller = new AbortController();
    const kill = setTimeout(() => controller.abort(), 35000);

    try {
      // 1) Tavily nhanh
      const tavilyRes = await fetch("/api/health/tavily", { signal: controller.signal });
      const tavilyData = (await tavilyRes.json()) as {
        ok?: boolean;
        tavily?: { ok: boolean; detail: string; ms?: number };
        error?: string;
      };

      if (tavilyRes.status === 401 || tavilyData.error === "Unauthorized") {
        setError("Phiên đăng nhập hết hạn — reload / login lại rồi Test.");
        setChecking(false);
        clearTimeout(kill);
        return;
      }

      setHealth({
        ok: Boolean(tavilyData.tavily?.ok),
        tavily: tavilyData.tavily,
        nvidia: { ok: false, detail: "Đang kiểm tra NVIDIA...", ms: 0 },
      });

      // 2) NVIDIA riêng (chậm hơn)
      const nvidiaRes = await fetch("/api/health/tavily?nvidia=1", {
        signal: controller.signal,
      });
      const nvidiaData = (await nvidiaRes.json()) as {
        ok?: boolean;
        tavily?: { ok: boolean; detail: string; ms?: number };
        nvidia?: { ok: boolean; detail: string; ms?: number };
      };

      setHealth({
        ok: Boolean(nvidiaData.tavily?.ok && nvidiaData.nvidia?.ok),
        tavily: nvidiaData.tavily ?? tavilyData.tavily,
        nvidia: nvidiaData.nvidia,
      });

      if (nvidiaData.tavily?.ok && nvidiaData.nvidia?.ok) {
        setMessage("Tavily + NVIDIA đều OK.");
      } else if (nvidiaData.tavily?.ok) {
        setMessage("Tavily OK — NVIDIA lỗi/timeout (xem panel).");
      } else {
        setMessage("Tavily lỗi — kiểm tra TAVILY_API_KEY trên Vercel.");
      }
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      setError(
        aborted
          ? "Timeout 35s — Tavily thường <3s; nếu kẹt có thể NVIDIA chậm hoặc mất mạng."
          : e instanceof Error
            ? e.message
            : "Không kiểm tra được",
      );
    } finally {
      clearTimeout(kill);
      setChecking(false);
    }
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
        maxPendingReview: config.maxPendingReview,
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
      for (let i = 0; i < 10; i++) {
        setMessage(`Đang chạy bước ${i + 1}/10…`);
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
        if (i === 9) {
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
      title="Cấu hình Auto-write"
      subtitle="Lên lịch Agent tự viết bài theo AI-TFES. Bài auto chỉ dừng ở Chờ duyệt — anh duyệt tay."
      backHref="/dashboard"
      backLabel="Pipeline"
    >
      {loading || !config ? (
        <div className="h-64 animate-pulse rounded-2xl bg-[var(--surface-muted)]" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <form onSubmit={onSave} className="surface-card space-y-6 p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-[var(--ink)]">Bật auto-write</p>
                <p className="text-xs text-[var(--ink-muted)]">
                  Cron Hobby chạy 1 lần/ngày; mỗi tick chỉ 1 bước pipeline (tránh 504).
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
                <option value="engineering">engineering</option>
                <option value="soft-skills">soft-skills</option>
                <option value="rotate">Xoay vòng hai domain</option>
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
                Nếu đã đủ số bài PUBLISH_READY, auto sẽ bỏ qua lần chạy (không spam hàng chờ).
              </FieldHint>
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
                  Dùng seed_topics từ Domain Profile
                </label>
                <FieldHint>Ưu tiên chủ đề chưa viết; hết thì quay vòng.</FieldHint>
              </div>
            </div>

            <div>
              <Label htmlFor="customTopics">Chủ đề thêm (mỗi dòng một chủ đề)</Label>
              <Textarea
                id="customTopics"
                rows={6}
                value={config.customTopics}
                onChange={(e) => setConfig({ ...config, customTopics: e.target.value })}
                placeholder={"MCP production pitfalls\nFeature flags tại scale\n..."}
              />
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
                {running ? "Đang chạy pipeline..." : "Chạy ngay 1 bài"}
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
                Ping Tavily + NVIDIA để biết key còn sống (không chạy pipeline).
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
                      health.nvidia?.ok ? "text-[var(--success)]" : "text-[var(--danger)]"
                    }
                  >
                    <strong>NVIDIA:</strong> {health.nvidia?.ok ? "OK" : "LỖI"} —{" "}
                    {health.nvidia?.detail}
                    {health.nvidia?.ms != null
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
