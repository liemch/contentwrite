import { STEP_LABELS } from "@/components/status-badge";

const STEPS = ["RESEARCH", "INSIGHT", "WRITE", "FINALIZE"] as const;

export function PipelineSteps({
  currentStep,
  status,
  running = false,
}: {
  currentStep: string | null;
  status: string;
  running?: boolean;
}) {
  const currentIndex =
    status === "PUBLISH_READY" || status === "APPROVED" || status === "PUBLISHED"
      ? STEPS.length
      : currentStep
        ? STEPS.indexOf(currentStep as (typeof STEPS)[number])
        : 0;

  return (
    <ol className="grid gap-3 sm:grid-cols-4">
      {STEPS.map((step, index) => {
        const done =
          index < currentIndex ||
          status === "PUBLISH_READY" ||
          status === "APPROVED" ||
          status === "PUBLISHED";
        const active =
          status === "RUNNING"
            ? index === Math.max(currentIndex, 0)
            : index === currentIndex &&
              status !== "PUBLISH_READY" &&
              status !== "APPROVED" &&
              status !== "PUBLISHED" &&
              status !== "FAILED";
        const failed = status === "FAILED" && index === currentIndex;
        const showActive = active || (running && index === Math.max(currentIndex, 0) && !failed && !done);

        return (
          <li
            key={step}
            className={`rounded-2xl border px-4 py-3 transition ${
              failed
                ? "border-red-200 bg-[var(--danger-soft)]"
                : done && !showActive
                  ? "border-[rgba(15,118,110,0.25)] bg-[var(--accent-soft)]"
                  : showActive
                    ? "border-[var(--accent)] bg-white shadow-[0_0_0_4px_var(--accent-glow)]"
                    : "border-[var(--line)] bg-[var(--surface)]"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                  failed
                    ? "bg-[var(--danger)] text-white"
                    : done && !showActive
                      ? "bg-[var(--accent)] text-white"
                      : showActive
                        ? "bg-[var(--accent)] text-white animate-pulse-soft"
                        : "bg-[var(--surface-muted)] text-[var(--ink-faint)]"
                }`}
              >
                {failed ? "!" : done && !showActive ? "✓" : index + 1}
              </span>
              <div className="min-w-0">
                <span className="block text-sm font-medium text-[var(--ink)]">{STEP_LABELS[step]}</span>
                {showActive && running && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                    Đang chạy…
                  </span>
                )}
                {failed && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--danger)]">
                    Lỗi
                  </span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
