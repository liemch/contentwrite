"use client";

import { useEffect, useMemo, useState } from "react";

type FactSummary = {
  verdict?: string | null;
  claimCount?: number;
  blockingClaimCount?: number;
  unsupportedClaimCount?: number;
  unverifiableClaimCount?: number;
  claimsWithoutSourceCount?: number;
  malformedOutput?: boolean;
};

type Telemetry = {
  schemaVersion?: string;
  transitionName?: string;
  fact?: FactSummary;
  attempt?: number | null;
  retryCount?: number | null;
  remediationCount?: number | null;
  lifetimeRemediationCount?: number | null;
  cycleRemediationCount?: number | null;
  gateFailCount?: number | null;
  gateFailures?: string[];
  failureReasons?: string[];
  totalScore?: number | null;
  decision?: string | null;
  draftCharacterLength?: number;
  llmMs?: number | null;
  errorClass?: "content" | "parser" | "runtime" | "timeout" | null;
  result?: "pass" | "fail" | "retry" | "exhausted" | "error";
};

type TimelineTransition = {
  id: string;
  action: string;
  success: boolean;
  fromState: string;
  toState: string;
  createdAt: string;
  details?: {
    telemetry?: Telemetry;
    lifetimeRemediationCount?: number | null;
    cycleRemediationCount?: number | null;
    verificationStatus?: string | null;
    blockingClaims?: number | null;
  } | null;
};

/**
 * Fact Check rows written before WP2.7.1 carry no telemetry. Rebuild the minimum
 * display shape from their existing details so older runs still show validation steps.
 */
function legacyFactTelemetry(transition: TimelineTransition): Telemetry | null {
  if (transition.action !== "fact-check") return null;
  const details = transition.details;
  if (!details) return null;
  const verdict = details.verificationStatus ?? null;
  const blocking = details.blockingClaims ?? null;
  if (verdict === null && blocking === null) return null;
  return {
    schemaVersion: "legacy",
    transitionName: "fact-check",
    decision: verdict || "UNPARSED",
    result: transition.success ? "pass" : "fail",
    errorClass: transition.success ? null : "content",
    fact: {
      verdict,
      blockingClaimCount: blocking ?? undefined,
      malformedOutput: !verdict,
    },
  };
}

/** Why this Fact Check attempt failed, using only parsed ledger counts. */
function factFailureLabel(fact: FactSummary): string | null {
  if (fact.malformedOutput) return "ledger không đọc được (parser)";
  const parts: string[] = [];
  if (fact.blockingClaimCount) parts.push(`${fact.blockingClaimCount} blocking`);
  if (fact.unsupportedClaimCount) {
    parts.push(`${fact.unsupportedClaimCount} unsupported`);
  }
  if (fact.unverifiableClaimCount) {
    parts.push(`${fact.unverifiableClaimCount} unverifiable`);
  }
  if (fact.claimsWithoutSourceCount) {
    parts.push(`${fact.claimsWithoutSourceCount} thiếu nguồn`);
  }
  if (fact.claimCount != null) parts.push(`${fact.claimCount} claim`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function remediationBudgetLabel(
  telemetry: Telemetry,
  details: TimelineTransition["details"],
): string | null {
  const cycle =
    telemetry.cycleRemediationCount ??
    details?.cycleRemediationCount ??
    telemetry.remediationCount ??
    null;
  const lifetime =
    telemetry.lifetimeRemediationCount ?? details?.lifetimeRemediationCount ?? null;
  if (cycle == null && lifetime == null) return null;
  if (lifetime == null) return `cycle ${cycle}`;
  if (cycle == null) return `lifetime ${lifetime}`;
  return `cycle ${cycle} · lifetime ${lifetime}`;
}

function resultLabel(telemetry: Telemetry): string {
  const kind = telemetry.errorClass;
  const suffix =
    kind === "parser"
      ? "parser"
      : kind === "timeout"
        ? "timeout"
        : kind === "runtime"
          ? "runtime"
          : kind === "content"
            ? "nội dung"
            : "";
  return [telemetry.result ?? "—", suffix].filter(Boolean).join(" · ");
}

export function RemediationTimeline({
  articleId,
  workflowVersion,
}: {
  articleId: string;
  workflowVersion: number;
}) {
  const [transitions, setTransitions] = useState<TimelineTransition[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(`/api/articles/${articleId}/workflow`)
      .then(async (response) => {
        const data = (await response.json()) as {
          transitions?: TimelineTransition[];
          error?: string;
        };
        if (!response.ok) throw new Error(data.error || "Không tải được timeline");
        if (active) setTransitions(data.transitions ?? []);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Không tải được timeline");
      });
    return () => {
      active = false;
    };
  }, [articleId, workflowVersion]);

  const rows = useMemo(() => {
    const scored = transitions
      .map((transition) => ({
        transition,
        telemetry: transition.details?.telemetry ?? legacyFactTelemetry(transition),
      }))
      .filter(
        (row): row is { transition: TimelineTransition; telemetry: Telemetry } =>
          Boolean(row.telemetry?.schemaVersion),
      );

    return scored.map((row, index) => {
      const score = row.telemetry.totalScore ?? null;
      const previousScore = scored
        .slice(0, index)
        .reduceRight<number | null>(
          (found, earlier) => found ?? earlier.telemetry.totalScore ?? null,
          null,
        );
      return {
        ...row,
        scoreDelta:
          score !== null && previousScore !== null ? score - previousScore : null,
      };
    });
  }, [transitions]);

  if (error) {
    return <p className="text-xs text-[var(--danger)]">Timeline: {error}</p>;
  }
  if (rows.length === 0) return null;

  return (
    <section className="mb-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <div>
        <p className="text-sm font-semibold text-[var(--ink)]">Remediation timeline</p>
        <p className="mt-0.5 text-xs text-[var(--ink-faint)]">
          Cycle budget là giới hạn retry hiện tại; lifetime count chỉ để audit và không bị reset.
        </p>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-[var(--line)] text-[var(--ink-muted)]">
            <tr>
              <th className="px-2 py-2">Attempt</th>
              <th className="px-2 py-2">Step</th>
              <th className="px-2 py-2 text-right">Score</th>
              <th className="px-2 py-2 text-right">Gate fail</th>
              <th className="px-2 py-2">Decision</th>
              <th className="px-2 py-2 text-right">Draft length</th>
              <th className="px-2 py-2 text-right">LLM time</th>
              <th className="px-2 py-2">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ transition, telemetry, scoreDelta }, index) => {
              const score = telemetry.totalScore ?? null;
              const gates = telemetry.gateFailures?.join(", ") || "—";
              const budgetLabel = remediationBudgetLabel(telemetry, transition.details);
              const factLabel = telemetry.fact ? factFailureLabel(telemetry.fact) : null;
              return (
                <tr key={transition.id} className="border-b border-[var(--line)]/70 align-top">
                  <td className="px-2 py-2">
                    {telemetry.attempt ?? telemetry.retryCount ?? index + 1}
                  </td>
                  <td className="px-2 py-2 font-medium">
                    {telemetry.transitionName ?? transition.action}
                    {budgetLabel && (
                      <span className="block text-[10px] text-[var(--ink-faint)]">
                        {budgetLabel}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {score ?? "—"}
                    {scoreDelta !== null && (
                      <span
                        className={`ml-1 ${scoreDelta > 0 ? "text-[var(--success)]" : scoreDelta < 0 ? "text-[var(--danger)]" : "text-[var(--ink-faint)]"}`}
                      >
                        {scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right" title={factLabel ?? gates}>
                    {telemetry.gateFailCount ?? telemetry.fact?.blockingClaimCount ?? "—"}
                    {gates !== "—" && <span className="block text-[10px]">{gates}</span>}
                    {factLabel && (
                      <span className="block text-left text-[10px] text-[var(--ink-faint)]">
                        {factLabel}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2">{telemetry.decision ?? transition.toState}</td>
                  <td className="px-2 py-2 text-right">
                    {telemetry.draftCharacterLength?.toLocaleString("vi-VN") ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {telemetry.llmMs != null
                      ? `${(telemetry.llmMs / 1000).toFixed(1)}s`
                      : "—"}
                  </td>
                  <td className="px-2 py-2">
                    {resultLabel(telemetry)}
                    {telemetry.failureReasons?.[0] && (
                      <span className="mt-1 block max-w-64 text-[10px] text-[var(--ink-faint)]">
                        {telemetry.failureReasons[0]}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
