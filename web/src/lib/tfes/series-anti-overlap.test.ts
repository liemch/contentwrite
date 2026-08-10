import { describe, expect, it } from "vitest";
import {
  extractClaimedAngle,
  findSeriesAngleCollision,
  seriesAngleOverlapScore,
  type SeriesSiblingClaim,
} from "@/lib/tfes/editorial-memory";
import { buildInsightLockContextV2, buildDraftGenerationContextV2 } from "@/lib/tfes/prompts-v2";

const sibling = (partial: Partial<SeriesSiblingClaim> & Pick<SeriesSiblingClaim, "articleId" | "topic">): SeriesSiblingClaim => ({
  seriesOrder: 1,
  title: partial.topic,
  core: partial.core ?? partial.topic,
  status: "PUBLISHED",
  ...partial,
});

describe("extractClaimedAngle", () => {
  it("ưu tiên coreMessage từ Knowledge Record", () => {
    expect(
      extractClaimedAngle({
        topic: "Quản lý thời gian",
        coreMessage: "Pomodoro thất bại khi họp chồng chéo vì context-switch đắt hơn block 25 phút.",
      }),
    ).toMatch(/Pomodoro thất bại/);
  });

  it("đọc thesis từ insightGate JSON", () => {
    expect(
      extractClaimedAngle({
        topic: "Timebox",
        insightGate: 'INSIGHT_PLAN_LOCK_JSON:\n{"thesis":"Timebox chỉ thắng khi deadline thật, không phải ảo giác busy."}',
      }),
    ).toMatch(/Timebox chỉ thắng/);
  });

  it("fallback về topic khi chưa có thesis", () => {
    expect(extractClaimedAngle({ topic: "Eisenhower matrix cho IC" })).toBe(
      "Eisenhower matrix cho IC",
    );
  });
});

describe("seriesAngleOverlapScore / findSeriesAngleCollision", () => {
  const siblings = [
    sibling({
      articleId: "a1",
      seriesOrder: 1,
      topic: "Pomodoro khi họp chồng chéo",
      core: "Pomodoro thất bại khi lịch họp cắt khối 25 phút liên tục",
    }),
    sibling({
      articleId: "a2",
      seriesOrder: 2,
      topic: "Timebox vs todo list",
      core: "Timebox thắng todo list khi công việc có deadline cứng",
    }),
  ];

  it("bắt trùng thesis gần sibling", () => {
    const score = seriesAngleOverlapScore(
      "Pomodoro thất bại khi lịch họp cắt khối 25 phút và không giữ được deep work",
      siblings[0],
    );
    expect(score).toBeGreaterThan(0.4);
  });

  it("góc khác trong cùng chủ đề series không bị coi là collision", () => {
    const collision = findSeriesAngleCollision(
      "Deep work buổi sáng chỉ bền khi tắt notification trước khi mở calendar",
      siblings,
      0.42,
    );
    expect(collision).toBeNull();
  });

  it("findSeriesAngleCollision trả sibling trùng nhất", () => {
    const collision = findSeriesAngleCollision(
      "Pomodoro thất bại khi lịch họp cắt khối 25 phút liên tục trong ngày",
      siblings,
      0.35,
    );
    expect(collision?.sibling.articleId).toBe("a1");
  });
});

describe("prompt context nhúng SERIES_CONTRACT", () => {
  const block = `## SERIES_ANTI_OVERLAP
Series: Quản lý thời gian
- #1 Pomodoro — đã chiếm: Pomodoro thất bại khi họp cắt block`;

  it("insight lock nhận SERIES_CONTRACT", () => {
    const ctx = buildInsightLockContextV2({
      topic: "Timebox cho IC",
      researchBrief: "evidence…",
      seriesAntiOverlap: block,
    });
    expect(ctx).toContain("SERIES_CONTRACT");
    expect(ctx).toContain("Pomodoro thất bại");
  });

  it("draft nhận SERIES_CONTRACT", () => {
    const ctx = buildDraftGenerationContextV2({
      topic: "Timebox cho IC",
      researchBrief: "evidence…",
      insightGate: "thesis…",
      seriesAntiOverlap: block,
      phase: "a",
    });
    expect(ctx).toContain("SERIES_CONTRACT");
  });
});
