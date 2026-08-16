"use client";

import { Button } from "@/components/ui/button";

export function HumanReviewBanner({
  onGoToReview,
}: {
  onGoToReview?: () => void;
}) {
  return (
    <section
      className="mb-6 rounded-2xl border-2 border-[rgba(180,83,9,0.45)] bg-[var(--warn-soft)] px-5 py-4 sm:px-6"
      role="alert"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#92400e]">
            ⏸ Cần anh/chị xác nhận
          </p>
          <h2 className="mt-2 font-[family-name:var(--font-source-serif)] text-lg font-semibold text-[var(--ink)] sm:text-xl">
            AI đã review xong — chưa tự chạy tiếp
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--ink-muted)]">
            Mở tab <strong>Review / Knowledge</strong>, đọc góp ý AI, chọn mức sửa (Fail / Minor /
            OK) rồi bấm <strong>Xác nhận Review</strong>. Sau đó hệ thống mới fact-check và hoàn
            thiện bản đăng.
          </p>
        </div>
        {onGoToReview && (
          <Button size="sm" variant="secondary" onClick={onGoToReview} className="shrink-0">
            Mở Review ngay
          </Button>
        )}
      </div>
    </section>
  );
}
