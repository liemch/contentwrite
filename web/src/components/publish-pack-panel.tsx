"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { PublishPack } from "@/lib/publish-pack";

type PublishPackPanelProps = {
  articleId: string;
  hasClean: boolean;
  running: boolean;
  onLog: (level: "info" | "success" | "error" | "warn", message: string) => void;
};

export function PublishPackPanel({
  articleId,
  hasClean,
  running,
  onLog,
}: PublishPackPanelProps) {
  const [pack, setPack] = useState<PublishPack | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  async function generate() {
    if (!hasClean) {
      setError("Chưa có bản sạch — chạy pipeline tới Publish Ready trước.");
      return;
    }
    setBusy(true);
    setError("");
    onLog("info", "→ Sinh Gói đăng từ bản sạch...");
    try {
      const res = await fetch(`/api/articles/${articleId}/publish-pack`, {
        method: "POST",
      });
      const data = (await res.json()) as { pack?: PublishPack; error?: string };
      if (!res.ok || !data.pack) {
        throw new Error(data.error || "Không sinh được Gói đăng");
      }
      setPack(data.pack);
      onLog("success", "✓ Đã có Gói đăng (excerpt / LinkedIn / X)");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Lỗi";
      setError(msg);
      onLog("error", `✗ ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function copy(label: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setError("Không copy được — chọn text thủ công");
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--ink-muted)]">
        Gói copy nhanh để đăng LinkedIn / X — sinh từ bản sạch. Ảnh vẫn dùng Image Studio phía trên.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          busy={busy}
          disabled={busy || running || !hasClean}
          onClick={() => void generate()}
        >
          {busy ? "Đang sinh..." : pack ? "Sinh lại" : "Sinh Gói đăng"}
        </Button>
        {!hasClean && (
          <p className="text-xs text-[var(--warm)] self-center">Cần bản sạch trước.</p>
        )}
      </div>

      {error && <p className="text-sm text-[var(--warm)]">{error}</p>}

      {pack && (
        <div className="space-y-4">
          <PackBlock
            title="Excerpt"
            hint="1–2 câu đưa lên card / mô tả ngắn"
            text={pack.excerpt}
            copied={copied === "excerpt"}
            onCopy={() => void copy("excerpt", pack.excerpt)}
          />
          <PackBlock
            title="LinkedIn"
            hint="Caption sẵn — chỉnh nhẹ rồi paste"
            text={pack.linkedin}
            copied={copied === "linkedin"}
            onCopy={() => void copy("linkedin", pack.linkedin)}
          />
          <PackBlock
            title="X / Twitter"
            hint="≤ ~260 ký tự"
            text={pack.xPost}
            copied={copied === "x"}
            onCopy={() => void copy("x", pack.xPost)}
          />
          {pack.tags.length > 0 && (
            <PackBlock
              title="Tags"
              hint="Gắn thư viện / SEO nội bộ"
              text={pack.tags.map((t) => `#${t}`).join(" ")}
              copied={copied === "tags"}
              onCopy={() => void copy("tags", pack.tags.map((t) => `#${t}`).join(" "))}
            />
          )}
        </div>
      )}
    </div>
  );
}

function PackBlock({
  title,
  hint,
  text,
  copied,
  onCopy,
}: {
  title: string;
  hint: string;
  text: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)]/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">{title}</p>
          <p className="text-[11px] text-[var(--ink-faint)]">{hint}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onCopy}>
          {copied ? "Đã copy" : "Copy"}
        </Button>
      </div>
      <pre className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--ink-muted)]">
        {text}
      </pre>
    </div>
  );
}
