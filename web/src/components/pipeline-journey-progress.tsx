"use client";

import {
  EDITOR_JOURNEY_PHASES,
  resolveEditorJourneyProgress,
  type EditorJourneyProgress,
} from "@/lib/editor-journey";

type ArticleLite = Parameters<typeof resolveEditorJourneyProgress>[0];

export function PipelineJourneyProgress({
  article,
  running = false,
}: {
  article: ArticleLite;
  running?: boolean;
}) {
  const progress = resolveEditorJourneyProgress(article);

  return (
    <section className="mb-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-faint)]">
            Tiến độ viết bài
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
            {progress.completed
              ? "✓ Chu trình xong — sẵn sàng duyệt"
              : progress.label}
          </p>
        </div>
        <div className="text-right text-xs text-[var(--ink-muted)]">
          {progress.completed ? (
            <span className="font-semibold text-[var(--accent)]">100%</span>
          ) : (
            <>
              <span className="font-semibold text-[var(--ink)]">
                Bước {progress.phaseIndex}/{progress.phaseTotal}
              </span>
              {progress.etaRemainingMinutes != null && (
                <p className="mt-0.5">Còn ~{progress.etaRemainingMinutes} phút (ước lượng)</p>
              )}
            </>
          )}
        </div>
      </div>

      <div
        className="mb-4 h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]"
        role="progressbar"
        aria-valuenow={progress.progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            progress.awaitingHuman
              ? "bg-[var(--warn)]"
              : running
                ? "animate-pulse-soft bg-[var(--accent)]"
                : "bg-[var(--accent)]"
          }`}
          style={{ width: `${progress.progressPercent}%` }}
        />
      </div>

      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {EDITOR_JOURNEY_PHASES.map((phase, index) => {
          const phaseNum = index + 1;
          const done = progress.completed || phaseNum < progress.phaseIndex;
          const active =
            !progress.completed &&
            phaseNum === progress.phaseIndex &&
            !progress.awaitingHuman;
          const paused =
            progress.awaitingHuman && phase.id === "review" && phaseNum === progress.phaseIndex;

          return (
            <li
              key={phase.id}
              className={`rounded-xl border px-2.5 py-2 text-center transition ${
                paused
                  ? "border-[rgba(180,83,9,0.35)] bg-[var(--warn-soft)]"
                  : done
                    ? "border-[rgba(15,118,110,0.25)] bg-[var(--accent-soft)]"
                    : active
                      ? "border-[var(--accent)] bg-white shadow-[0_0_0_2px_var(--accent-glow)]"
                      : "border-[var(--line)] bg-[var(--surface-muted)]/50 opacity-70"
              }`}
            >
              <span
                className={`text-[10px] font-bold uppercase tracking-wide ${
                  done || active || paused ? "text-[var(--accent)]" : "text-[var(--ink-faint)]"
                }`}
              >
                {done ? "✓" : phaseNum}
              </span>
              <p className="mt-1 text-[11px] font-medium leading-tight text-[var(--ink)]">
                {phase.short}
              </p>
              {active && running && (
                <p className="mt-1 text-[9px] font-semibold text-[var(--accent)]">Đang chạy…</p>
              )}
              {paused && (
                <p className="mt-1 text-[9px] font-semibold text-[var(--warn)]">Chờ anh/chị</p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export type { EditorJourneyProgress };
