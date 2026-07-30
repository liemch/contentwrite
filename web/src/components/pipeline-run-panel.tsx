"use client";

import { useEffect, useRef, useState } from "react";

export type PipelineLogLine = {
  id: string;
  level: "info" | "success" | "error" | "warn";
  text: string;
  at: number;
};

function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, "0")}` : `${r}s`;
}

export function PipelineRunPanel({
  running,
  runningLabel,
  status,
  currentStepLabel,
  errorMessage,
  logs,
  onClear,
  /** Mặc định thu gọn log; tự mở khi đang chạy / có lỗi */
  defaultExpanded = false,
}: {
  running: boolean;
  runningLabel?: string;
  status: string;
  currentStepLabel?: string | null;
  errorMessage?: string | null;
  logs: PipelineLogLine[];
  onClear?: () => void;
  defaultExpanded?: boolean;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const startedAt = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!running) {
      startedAt.current = null;
      setElapsed(0);
      return;
    }
    setExpanded(true);
    startedAt.current = Date.now();
    const t = setInterval(() => {
      if (startedAt.current) setElapsed(Date.now() - startedAt.current);
    }, 250);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    if (errorMessage) setExpanded(true);
  }, [errorMessage]);

  useEffect(() => {
    if (expanded) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [logs.length, running, expanded]);

  const tone =
    status === "FAILED" || errorMessage
      ? "border-red-200 bg-[var(--danger-soft)]"
      : running
        ? "border-[rgba(12,110,107,0.25)] bg-[var(--accent-soft)]"
        : status === "PUBLISH_READY"
          ? "border-[rgba(180,83,9,0.2)] bg-[var(--warn-soft)]"
          : "border-[var(--line)] bg-[var(--surface)]";

  return (
    <section className={`mb-6 overflow-hidden rounded-2xl border ${tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-faint)]">
            Trạng thái chạy
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
            {running
              ? runningLabel || "Đang gọi AI / search..."
              : errorMessage
                ? "Cần chú ý — xem chi tiết"
                : status === "PUBLISH_READY"
                  ? "Xong chu trình — chờ duyệt"
                  : status === "FAILED"
                    ? "Dừng vì lỗi"
                    : currentStepLabel
                      ? `Tiếp theo: ${currentStepLabel}`
                      : "Chưa chạy"}
          </p>
          {running && (
            <p className="mt-1 text-xs text-[var(--ink-muted)]">
              Đã chạy {formatElapsed(elapsed)} · mỗi bước có thể 30–120s — đừng đóng tab.
            </p>
          )}
          {!running && errorMessage && (
            <p className="mt-2 text-sm text-[var(--danger)]">{errorMessage}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {running && (
            <span className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-[var(--accent)]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]" />
              LIVE · {formatElapsed(elapsed)}
            </span>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-full border border-[var(--line)] bg-white/80 px-3 py-1 text-xs font-medium text-[var(--ink-muted)] hover:text-[var(--ink)]"
          >
            {expanded ? "Thu log" : `Log${logs.length ? ` (${logs.length})` : ""}`}
          </button>
          {logs.length > 0 && onClear && !running && expanded && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-full px-3 py-1 text-xs text-[var(--ink-faint)] hover:bg-white/70 hover:text-[var(--ink)]"
            >
              Xoá
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="max-h-52 overflow-y-auto border-t border-[var(--line)]/70 bg-[rgba(255,255,255,0.55)] px-4 py-3 font-mono text-[11px] leading-relaxed sm:px-5">
          {logs.length === 0 ? (
            <p className="text-[var(--ink-faint)]">
              Log hiện khi chạy bước. Mặc định thu gọn để trang gọn hơn.
            </p>
          ) : (
            <ul className="space-y-1">
              {logs.map((line) => (
                <li
                  key={line.id}
                  className={
                    line.level === "error"
                      ? "text-[var(--danger)]"
                      : line.level === "success"
                        ? "text-[var(--success)]"
                        : line.level === "warn"
                          ? "text-[var(--warn)]"
                          : "text-[var(--ink-muted)]"
                  }
                >
                  <span className="text-[var(--ink-faint)]">
                    {new Date(line.at).toLocaleTimeString("vi-VN", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}{" "}
                  </span>
                  {line.text}
                </li>
              ))}
              <div ref={bottomRef} />
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
