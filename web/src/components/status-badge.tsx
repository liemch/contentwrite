export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Nháp",
  RUNNING: "Đang chạy",
  PUBLISH_READY: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  PUBLISHED: "Đã đăng",
  FAILED: "Lỗi",
};

export const STEP_LABELS: Record<string, string> = {
  RESEARCH: "Research",
  INSIGHT: "Insight Gate",
  WRITE: "Viết bài",
  FINALIZE: "Fact-check",
};

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-[var(--surface-muted)] text-[var(--ink-muted)] ring-[var(--line)]",
  RUNNING: "bg-[var(--accent-soft)] text-[var(--accent)] ring-[rgba(15,118,110,0.2)]",
  PUBLISH_READY: "bg-[var(--warn-soft)] text-[var(--warn)] ring-[rgba(180,83,9,0.15)]",
  APPROVED: "bg-[var(--success-soft)] text-[var(--success)] ring-[rgba(4,120,87,0.15)]",
  PUBLISHED: "bg-[#dbeafe] text-[#1d4ed8] ring-[rgba(29,78,216,0.12)]",
  FAILED: "bg-[var(--danger-soft)] text-[var(--danger)] ring-[rgba(185,28,28,0.12)]",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${STATUS_STYLES[status] ?? STATUS_STYLES.DRAFT}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function DomainBadge({ domain }: { domain: string }) {
  return (
    <span className="inline-flex rounded-lg bg-[var(--surface-muted)] px-2 py-0.5 text-xs font-medium text-[var(--ink-muted)]">
      {domain}
    </span>
  );
}
