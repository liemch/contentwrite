"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

type GoldSampleButtonProps = {
  articleId: string;
  disabled?: boolean;
  editorialScore?: number | null;
};

export function GoldSampleButton({
  articleId,
  disabled,
  editorialScore,
}: GoldSampleButtonProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function appendGold() {
    setBusy(true);
    setMessage("");
    setError("");
    const res = await fetch(`/api/articles/${articleId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "append-gold-sample" }),
    });
    setBusy(false);
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      gold?: { appended?: boolean; reason?: string };
    };
    if (!res.ok) {
      setError(data.error ?? "Không nuôi được gold sample");
      return;
    }
    if (data.gold?.appended) {
      setMessage("Đã thêm gold sample vào Domain Profile");
    } else {
      setMessage(data.gold?.reason ?? "Không thêm (có thể đã có hoặc chưa đủ điểm)");
    }
  }

  return (
    <div className="rounded-2xl border border-[rgba(11,107,102,0.25)] bg-[var(--accent-soft)]/40 px-4 py-3">
      <p className="text-sm font-semibold text-[var(--ink)]">Nuôi gold sample</p>
      <p className="mt-1 text-xs text-[var(--ink-muted)]">
        Thêm đoạn mở bài hay vào Domain Profile — giúp AI bắt chước nhịp/voice (không copy nguyên
        văn). Tự chạy khi Publish với điểm ≥4; bấm để bổ sung thủ công.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" busy={busy} disabled={disabled || busy} onClick={() => void appendGold()}>
          Nuôi gold sample
        </Button>
        {editorialScore != null && editorialScore > 0 ? (
          <span className="text-xs text-[var(--ink-faint)]">Điểm duyệt: {editorialScore}/5</span>
        ) : null}
        {message ? <span className="text-xs text-[var(--accent)]">{message}</span> : null}
        {error ? <span className="text-xs text-[var(--warm)]">{error}</span> : null}
      </div>
    </div>
  );
}
