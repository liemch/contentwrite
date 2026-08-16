import { resolveTrackerIndex, TFES_TRACKER_STEPS } from "@/lib/tfes/tracker";
import { isAwaitingHumanReview } from "@/lib/tfes/human-review";

/** Chế độ tạo bài — ảnh hưởng độ dài mục tiêu và ETA hiển thị. */
export type CreationMode = "fast" | "standard";

export const CREATION_MODES: Record<
  CreationMode,
  { label: string; wordTarget: number; etaMinutes: number; hint: string }
> = {
  fast: {
    label: "Nhanh",
    wordTarget: 550,
    etaMinutes: 15,
    hint: "~550 từ · khoảng 12–18 phút nếu ít revision",
  },
  standard: {
    label: "Chuẩn",
    wordTarget: 900,
    etaMinutes: 25,
    hint: "~900 từ · khoảng 20–35 phút nếu ít revision",
  },
};

/** 6 giai đoạn editor-facing (gộp 14 micro-step tracker). */
export const EDITOR_JOURNEY_PHASES = [
  {
    id: "research",
    label: "Nghiên cứu nguồn",
    short: "Research",
    etaMinutes: 3,
    trackerMax: 4,
  },
  {
    id: "angle",
    label: "Chốt góc & kế hoạch",
    short: "Góc bài",
    etaMinutes: 2,
    trackerMax: 6,
  },
  {
    id: "draft",
    label: "Viết nháp",
    short: "Viết",
    etaMinutes: 5,
    trackerMax: 7,
  },
  {
    id: "review",
    label: "Review & chỉnh sửa",
    short: "Review",
    etaMinutes: 8,
    trackerMax: 8,
  },
  {
    id: "fact",
    label: "Kiểm tra fact",
    short: "Fact",
    etaMinutes: 4,
    trackerMax: 10,
  },
  {
    id: "publish",
    label: "Hoàn thiện bản đăng",
    short: "Bản đăng",
    etaMinutes: 5,
    trackerMax: 13,
  },
] as const;

export type EditorJourneyPhaseId = (typeof EDITOR_JOURNEY_PHASES)[number]["id"];

type ArticleProgressInput = {
  workflowState?: string | null;
  researchBrief?: string | null;
  insightGate?: string | null;
  draft12?: string | null;
  factCheck?: string | null;
  knowledgeRecord?: string | null;
  cleanPublish?: string | null;
  targetWordCount?: number | null;
};

export type EditorJourneyProgress = {
  phaseIndex: number;
  phaseTotal: number;
  current: (typeof EDITOR_JOURNEY_PHASES)[number];
  completed: boolean;
  awaitingHuman: boolean;
  label: string;
  etaRemainingMinutes: number | null;
  progressPercent: number;
};

function trackerIndexToPhaseIndex(trackerIndex: number): number {
  if (trackerIndex >= TFES_TRACKER_STEPS.length) return EDITOR_JOURNEY_PHASES.length;
  for (let i = 0; i < EDITOR_JOURNEY_PHASES.length; i += 1) {
    if (trackerIndex <= EDITOR_JOURNEY_PHASES[i].trackerMax) return i;
  }
  return EDITOR_JOURNEY_PHASES.length - 1;
}

export function resolveEditorJourneyProgress(
  article: ArticleProgressInput,
): EditorJourneyProgress {
  const state = article.workflowState ?? "IDEA";
  const trackerIndex = resolveTrackerIndex(article);
  const completed = ["PUBLISH_READY", "APPROVED", "PUBLISHED", "RETRACTED"].includes(state);
  const awaitingHuman = isAwaitingHumanReview(article);

  if (completed) {
    return {
      phaseIndex: EDITOR_JOURNEY_PHASES.length,
      phaseTotal: EDITOR_JOURNEY_PHASES.length,
      current: EDITOR_JOURNEY_PHASES[EDITOR_JOURNEY_PHASES.length - 1],
      completed: true,
      awaitingHuman: false,
      label: "Sẵn sàng duyệt / đã xong",
      etaRemainingMinutes: 0,
      progressPercent: 100,
    };
  }

  const phaseIndex = trackerIndexToPhaseIndex(trackerIndex);
  const current = EDITOR_JOURNEY_PHASES[phaseIndex];
  const wordFactor =
    article.targetWordCount && article.targetWordCount < 700 ? 0.75 : 1;

  let etaRemaining = 0;
  for (let i = phaseIndex; i < EDITOR_JOURNEY_PHASES.length; i += 1) {
    etaRemaining += Math.round(EDITOR_JOURNEY_PHASES[i].etaMinutes * wordFactor);
  }

  const label = awaitingHuman
    ? "Cần anh/chị xác nhận Review AI trước khi tiếp tục"
    : `Đang ${current.label.toLowerCase()}`;

  const progressPercent = Math.min(
    99,
    Math.round(
      ((phaseIndex + (awaitingHuman ? 0.5 : 0.15)) / EDITOR_JOURNEY_PHASES.length) * 100,
    ),
  );

  return {
    phaseIndex: phaseIndex + 1,
    phaseTotal: EDITOR_JOURNEY_PHASES.length,
    current,
    completed: false,
    awaitingHuman,
    label,
    etaRemainingMinutes: etaRemaining > 0 ? etaRemaining : null,
    progressPercent,
  };
}

/** Đổi thông báo kỹ thuật sang ngôn ngữ editor. */
export function humanizeWorkflowError(
  message: string | null | undefined,
  workflowState?: string | null,
): string {
  if (!message?.trim()) return "";
  const m = message.trim();

  const rules: Array<{ test: RegExp; text: string }> = [
    {
      test: /timed? ?out|timeout|Request timed out|Hobby chỉ cho/i,
      text: "Bước này mất quá lâu — hệ thống sẽ tự thử lại. Giữ tab mở hoặc bấm «Chạy bước tiếp».",
    },
    {
      test: /Gate < L2|Gate chưa đạt|Insight Gate|Cổng Insight|nghiên cứu lại/i,
      text: "Góc bài chưa đủ sâu — hệ thống sẽ nghiên cứu hoặc chọn góc khác. Bấm «Chạy bước tiếp».",
    },
    {
      test: /Insight Lock|format invalid|JSON|malformed|parser/i,
      text: "Lỗi định dạng phản hồi AI — không phải do chủ đề yếu. Bấm «Chạy bước tiếp» để thử lại.",
    },
    {
      test: /BAR VIẾT|quá ngắn|Chạy lại bước Viết|Chạy lại Viết/i,
      text: "Bản nháp còn ngắn hoặc chưa đủ sâu — hệ thống sẽ viết lại. Bấm «Chạy bước tiếp».",
    },
    {
      test: /GOLD_BAR|Pre-9b|Final Verification|Khóa Review/i,
      text: "Bài chưa đạt chuẩn cuối — xem góp ý Review rồi bấm «Chạy bước tiếp» hoặc sửa tay.",
    },
    {
      test: /fact|claim|blocking|Unsupported|ledger/i,
      text: "Có claim cần nguồn hoặc sửa — xem tab Fact-check và bấm «Chạy bước tiếp».",
    },
    {
      test: /revision-remediation-exhausted|exhausted|hết lượt/i,
      text: "Đã hết lượt tự sửa — dùng «Sửa nháp tay» hoặc «Làm lại từ đầu» nếu cần.",
    },
    {
      test: /READER_SIM|Reader Simulation/i,
      text: "Bản đăng chưa qua mô phỏng độc giả — bấm «Chạy bước tiếp» để chỉnh.",
    },
  ];

  for (const rule of rules) {
    if (rule.test.test(m)) return rule.text;
  }

  if (workflowState && /REQUIRED|FAILED|REJECTED/.test(workflowState)) {
    return `${m} — bấm «Chạy bước tiếp» hoặc xem tab liên quan.`;
  }

  return m;
}

export function resolveCreationMode(
  raw: string | null | undefined,
): CreationMode {
  return raw === "fast" ? "fast" : "standard";
}
