"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ONBOARDING_STORAGE_KEY,
  type OnboardingStep,
} from "@/lib/onboarding-types";

type OnboardingChecklistProps = {
  steps: OnboardingStep[];
};

export function OnboardingChecklist({ steps }: OnboardingChecklistProps) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "done");
  }, []);

  const doneCount = steps.filter((step) => step.done).length;
  const allDone = doneCount === steps.length;

  if (dismissed || allDone) return null;

  function dismiss() {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "done");
    setDismissed(true);
  }

  return (
    <section className="panel-promo mb-8 px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="section-kicker text-[var(--accent)]">Bắt đầu nhanh</p>
          <h2 className="mt-1 font-[family-name:var(--font-source-serif)] text-lg font-semibold text-[var(--ink)]">
            Checklist 4 bước ({doneCount}/{steps.length})
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            Lần đầu dùng AI-TFES — làm lần lượt để quen quy trình.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-xs font-medium text-[var(--ink-faint)] hover:text-[var(--ink-muted)]"
        >
          Ẩn checklist
        </button>
      </div>
      <ol className="mt-4 space-y-2">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={`flex flex-col gap-3 rounded-xl border px-3 py-3 sm:flex-row sm:items-start sm:gap-3 sm:px-3 sm:py-3 ${
              step.done
                ? "border-[rgba(11,107,102,0.25)] bg-[var(--accent-soft)]/40"
                : "border-[var(--line)] bg-[var(--surface)]"
            }`}
          >
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                step.done
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface-muted)] text-[var(--ink-muted)]"
              }`}
            >
              {step.done ? "✓" : index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--ink)]">{step.label}</p>
              <p className="text-xs text-[var(--ink-muted)]">{step.hint}</p>
            </div>
            {!step.done ? (
              <Link
                href={step.href}
                className="inline-flex w-full shrink-0 justify-center rounded-full bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white sm:w-auto sm:py-1.5"
              >
                Làm ngay
              </Link>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
