"use client";

import { Button } from "@/components/ui/button";

type StickyPipelineActionsProps = {
  running: boolean;
  workflowState: string;
  isReviewMode: boolean;
  awaitingHuman: boolean;
  onRunStep: () => void;
  onRunFull: () => void;
  onReset: () => void;
  onDelete: () => void;
  showDelete: boolean;
};

export function StickyPipelineActions({
  running,
  workflowState,
  isReviewMode,
  awaitingHuman,
  onRunStep,
  onRunFull,
  onReset,
  onDelete,
  showDelete,
}: StickyPipelineActionsProps) {
  const terminal = ["PUBLISH_READY", "APPROVED", "PUBLISHED", "CORRECTION_REQUIRED", "RETRACTED"].includes(
    workflowState,
  );
  const blocked = running || terminal || isReviewMode || awaitingHuman;

  return (
    <div className="pipeline-actions-bar mb-5">
      <div className="mobile-scroll-x items-center gap-2">
        <Button size="sm" busy={running} disabled={blocked} onClick={onRunStep}>
          {running ? "Đang chạy..." : "Tiếp tục"}
        </Button>
        <Button size="sm" variant="secondary" busy={running} disabled={blocked} onClick={onRunFull}>
          Chạy đến xong
        </Button>
        {!terminal ? (
          <Button size="sm" variant="ghost" busy={running} disabled={running} onClick={onReset}>
            Làm lại
          </Button>
        ) : null}
        {showDelete ? (
          <Button size="sm" variant="danger" disabled={running} onClick={onDelete}>
            Xoá
          </Button>
        ) : null}
        <p className="hidden text-[11px] text-[var(--ink-faint)] sm:ml-auto sm:block">
          Giữ tab mở khi chạy chu trình dài
        </p>
      </div>
    </div>
  );
}
