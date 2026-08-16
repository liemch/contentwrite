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
    <div className="glass-dock pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 sm:px-6">
      <div className="pointer-events-auto mx-auto grid max-w-6xl grid-cols-2 gap-2 py-3 sm:flex sm:flex-wrap sm:items-center">
        <Button size="sm" busy={running} disabled={blocked} onClick={onRunStep} className="w-full sm:w-auto">
          {running ? "Đang chạy..." : "Tiếp tục"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          busy={running}
          disabled={blocked}
          onClick={onRunFull}
          className="w-full sm:w-auto"
        >
          Chạy đến xong
        </Button>
        {!terminal ? (
          <Button
            size="sm"
            variant="ghost"
            busy={running}
            disabled={running}
            onClick={onReset}
            className="w-full sm:w-auto"
          >
            Làm lại
          </Button>
        ) : null}
        {showDelete ? (
          <Button size="sm" variant="danger" disabled={running} onClick={onDelete} className="w-full sm:w-auto">
            Xoá
          </Button>
        ) : null}
        <p className="col-span-2 hidden text-center text-[11px] text-[var(--ink-faint)] sm:col-span-1 sm:ml-auto sm:block sm:text-left">
          Giữ tab mở khi chạy chu trình dài
        </p>
      </div>
    </div>
  );
}
