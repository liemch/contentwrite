"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  isBadAiVerdict,
  parseFactClaims,
  unresolvedBadClaims,
  type FactClaim,
} from "@/lib/tfes/fact-ledger";
import {
  parseDeskJson,
  type FactClaimState,
  type FactHumanDisposition,
} from "@/lib/tfes/desk-state";

type FactLedgerPanelProps = {
  articleId: string;
  factCheck: string | null;
  deskJson?: string | null;
  workflowState: string;
  running: boolean;
  onArticleUpdate: (article: Record<string, unknown>) => void;
  onLog: (level: "info" | "success" | "error" | "warn", message: string) => void;
};

export function FactLedgerPanel({
  articleId,
  factCheck,
  deskJson,
  workflowState,
  running,
  onArticleUpdate,
  onLog,
}: FactLedgerPanelProps) {
  const claims = useMemo(() => parseFactClaims(factCheck), [factCheck]);
  const [dispos, setDispos] = useState<Record<string, FactHumanDisposition>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const desk = parseDeskJson(deskJson);
    const next: Record<string, FactHumanDisposition> = {};
    const noteNext: Record<string, string> = {};
    for (const c of claims) {
      const saved = desk.factClaims?.find((f) => f.id === c.id);
      next[c.id] = saved?.humanDisposition ?? (isBadAiVerdict(c.aiVerdict) ? "pending" : "accept");
      if (saved?.note) noteNext[c.id] = saved.note;
    }
    setDispos(next);
    setNotes(noteNext);
  }, [claims, deskJson]);

  const unresolved = useMemo(() => {
    const human: FactClaimState[] = claims.map((c) => ({
      id: c.id,
      humanDisposition: dispos[c.id] ?? "pending",
    }));
    return unresolvedBadClaims(claims, human);
  }, [claims, dispos]);

  const canEdit = !["PUBLISHED", "RETRACTED"].includes(workflowState);

  async function save() {
    setBusy(true);
    onLog("info", "→ Lưu chốt Fact-check...");
    try {
      const payload = claims.map((c) => ({
        id: c.id,
        humanDisposition: dispos[c.id] ?? "pending",
        note: notes[c.id]?.trim() || undefined,
      }));
      const res = await fetch(`/api/articles/${articleId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save-fact-verdicts", factClaims: payload }),
      });
      const data = (await res.json()) as { article?: Record<string, unknown>; error?: string };
      if (!res.ok || !data.article) throw new Error(data.error || "Không lưu được");
      onArticleUpdate(data.article);
      onLog("success", "✓ Đã chốt Fact-check người");
    } catch (err) {
      onLog("error", `✗ ${err instanceof Error ? err.message : "Lỗi"}`);
    } finally {
      setBusy(false);
    }
  }

  if (!factCheck?.trim()) {
    return (
      <p className="text-sm text-[var(--ink-faint)]">
        Chưa có Fact-Check Ledger — chạy bước 9 trước.
      </p>
    );
  }

  if (claims.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--ink-muted)]">
          Không parse được bảng claim — xem ledger gốc bên dưới. Khi AI xuất đúng bảng
          Claim|Verdict, panel này sẽ hiện card tương tác.
        </p>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--line)] bg-[var(--surface-muted)]/40 p-3 text-xs text-[var(--ink-muted)]">
          {factCheck}
        </pre>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--ink-muted)]">
        Mỗi claim một card. Claim AI đánh{" "}
        <span className="font-semibold text-[var(--warm)]">Unsupported / Contradicted</span> phải
        chốt trước khi Approve.
      </p>

      {unresolved.length > 0 && (
        <p className="rounded-xl border border-[rgba(180,83,9,0.35)] bg-[var(--warn-soft)] px-3 py-2 text-xs text-[var(--warm)]">
          Còn {unresolved.length} claim chưa chốt — chặn Cổng duyệt.
        </p>
      )}

      <div className="space-y-3">
        {claims.map((c) => (
          <ClaimCard
            key={c.id}
            claim={c}
            disposition={dispos[c.id] ?? "pending"}
            note={notes[c.id] ?? ""}
            disabled={!canEdit || busy || running}
            onDisposition={(d) => setDispos((prev) => ({ ...prev, [c.id]: d }))}
            onNote={(n) => setNotes((prev) => ({ ...prev, [c.id]: n }))}
          />
        ))}
      </div>

      {canEdit && (
        <Button size="sm" busy={busy} disabled={busy || running} onClick={() => void save()}>
          Lưu chốt Fact-check
        </Button>
      )}
    </div>
  );
}

function ClaimCard({
  claim,
  disposition,
  note,
  disabled,
  onDisposition,
  onNote,
}: {
  claim: FactClaim;
  disposition: FactHumanDisposition;
  note: string;
  disabled: boolean;
  onDisposition: (d: FactHumanDisposition) => void;
  onNote: (n: string) => void;
}) {
  const bad = isBadAiVerdict(claim.aiVerdict);
  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        bad
          ? "border-[rgba(180,83,9,0.35)] bg-[var(--warn-soft)]/40"
          : "border-[var(--line)] bg-white/70"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-[var(--ink-faint)]">#{claim.index}</span>
        {claim.kind && (
          <span className="rounded-md bg-[var(--surface-muted)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--ink-muted)]">
            {claim.kind}
          </span>
        )}
        <span
          className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${
            bad ? "bg-[var(--warn-soft)] text-[var(--warm)]" : "bg-[var(--accent-soft)] text-[var(--accent)]"
          }`}
        >
          AI: {claim.aiVerdict || "—"}
        </span>
      </div>
      <p className="mt-2 text-sm font-medium text-[var(--ink)]">{claim.claim}</p>
      {claim.source && (
        <p className="mt-1 break-all text-xs text-[var(--ink-faint)]">Nguồn: {claim.source}</p>
      )}

      {bad && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(
            [
              ["fixed", "Đã sửa trên bản sạch", "Wording/claim đã chỉnh"],
              ["accept", "Chấp nhận (Opinion/OK)", "Giữ nguyên có chủ đích"],
            ] as const
          ).map(([id, label, hint]) => (
            <button
              key={id}
              type="button"
              disabled={disabled}
              onClick={() => onDisposition(id)}
              className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                disposition === id
                  ? "border-[var(--ink)] bg-[var(--ink)] text-white"
                  : "border-[var(--line)] bg-white/80 text-[var(--ink)]"
              }`}
            >
              <span className="font-semibold">{label}</span>
              <span
                className={`mt-0.5 block text-[11px] ${
                  disposition === id ? "text-white/75" : "text-[var(--ink-faint)]"
                }`}
              >
                {hint}
              </span>
            </button>
          ))}
        </div>
      )}

      {bad && (
        <input
          type="text"
          value={note}
          disabled={disabled}
          onChange={(e) => onNote(e.target.value)}
          placeholder="Ghi chú ngắn (tuỳ chọn)"
          className="mt-2 w-full rounded-lg border border-[var(--line)] bg-white/80 px-3 py-2 text-xs text-[var(--ink)]"
        />
      )}
    </div>
  );
}
