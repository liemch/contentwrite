import {
  isTrackerStepDone,
  resolveTrackerIndex,
  TFES_TRACKER_STEPS,
} from "@/lib/tfes/tracker";

type ArticleLite = {
  status: string;
  currentStep: string | null;
  researchBrief?: string | null;
  insightGate?: string | null;
  draft12?: string | null;
  factCheck?: string | null;
  knowledgeRecord?: string | null;
  cleanPublish?: string | null;
};

export function PipelineSteps({
  article,
  running = false,
}: {
  article: ArticleLite;
  running?: boolean;
}) {
  const activeIndex = resolveTrackerIndex(article);
  const failedIndex = article.status === "FAILED" ? activeIndex : -1;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
            Quy trình AI-TFES
          </p>
          <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
            Thanh này = các bước chạy. Tab bên dưới = nhật ký / đầu ra (không phải bước).
          </p>
        </div>
        <p className="text-[11px] text-[var(--ink-faint)]">10 bước + Cổng L2</p>
      </div>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {TFES_TRACKER_STEPS.map((step, index) => {
          const done = isTrackerStepDone(index, activeIndex, article.status);
          const active =
            article.status !== "FAILED" &&
            index === Math.min(activeIndex, TFES_TRACKER_STEPS.length - 1) &&
            activeIndex < TFES_TRACKER_STEPS.length;
          const failed = failedIndex === index;
          const showActive = (active || (running && active)) && !failed && !done;

          return (
            <li
              key={step.id}
              title={step.label}
              className={`rounded-xl border px-2.5 py-2 transition ${
                failed
                  ? "border-red-200 bg-[var(--danger-soft)]"
                  : done && !showActive
                    ? "border-[rgba(15,118,110,0.25)] bg-[var(--accent-soft)]"
                    : showActive
                      ? "border-[var(--accent)] bg-white shadow-[0_0_0_3px_var(--accent-glow)]"
                      : "border-[var(--line)] bg-[var(--surface)]"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
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
                <span className="truncate text-[11px] font-medium leading-tight text-[var(--ink)]">
                  {step.short}
                </span>
              </div>
              {showActive && running && (
                <span className="mt-1 block text-[9px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                  Đang chạy…
                </span>
              )}
              {failed && (
                <span className="mt-1 block text-[9px] font-semibold uppercase tracking-wide text-[var(--danger)]">
                  Lỗi
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
