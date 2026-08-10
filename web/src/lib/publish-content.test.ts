import { describe, expect, it } from "vitest";
import {
  prepareReaderContent,
  sanitizeEditorialBody,
  stripReaderFacingMeta,
  toReaderCleanPublish,
} from "@/lib/publish-content";

describe("reader-facing meta scrubber", () => {
  it("removes Insight L2 / Gate jargon from clean publish body", () => {
    const raw = [
      "# Bài hay (L2)",
      "",
      "*Phụ đề có L2 insight*",
      "",
      "Insight Gate đạt ≥ L2 — được viết.",
      "Luận điểm này là Insight L2/L3 khi điều kiện X.",
      "Insight L2: hệ thống fail khi retry dày.",
      "ĐẠT ≥ L2 — được viết",
      "PROVISIONAL_TOTAL_SCORE: 89",
      "EDITORIAL_DECISION: EDITORIAL_REVIEWED",
      "GOLD_BAR: OPENER — ok",
      "",
      "Người đọc cần biết trade-off thật sự.",
    ].join("\n");

    const clean = toReaderCleanPublish(raw);
    expect(clean).not.toMatch(/Insight\s*L\s*[0-3]/i);
    expect(clean).not.toMatch(/Insight\s*Gate/i);
    expect(clean).not.toMatch(/≥\s*L\s*[0-3]/i);
    expect(clean).not.toMatch(/\bL\s*[0-3]\b/);
    expect(clean).not.toMatch(/PROVISIONAL_TOTAL_SCORE/);
    expect(clean).not.toMatch(/EDITORIAL_DECISION/);
    expect(clean).not.toMatch(/GOLD_BAR/);
    expect(clean).toContain("trade-off thật sự");
    expect(clean.startsWith("# Bài hay")).toBe(true);
  });

  it("prepareReaderContent also strips reader-facing meta", () => {
    const body = prepareReaderContent(
      "Cổng Insight đã L2. (L3 insight) vẫn còn sót trong đoạn.",
    );
    expect(body).not.toMatch(/Cổng\s*Insight/i);
    expect(body).not.toMatch(/L\s*[0-3]\s*insight/i);
    expect(body).not.toMatch(/\(L\s*[0-3]\)/i);
  });

  it("stripReaderFacingMeta neutralizes inline insight-tier phrases", () => {
    const out = stripReaderFacingMeta(
      "Đây là insight L2 khi latency tăng. Không phải L2/L3 checklist.",
    );
    expect(out).not.toMatch(/\bL\s*[0-3]\b/);
    expect(out.toLowerCase()).toContain("insight");
  });

  it("sanitizeEditorialBody keeps draft light-scrub without deleting normal prose", () => {
    const draft = sanitizeEditorialBody(
      "# Title (L2)\n\n## Deep Analysis\n\nInsight L2: giữ ý nhưng bỏ nhãn.",
    );
    expect(draft).toContain("# Title");
    expect(draft).not.toMatch(/\(L2\)/);
    // Draft path is light; full scrub is reader-facing.
    expect(draft).toContain("## Deep Analysis");
  });

  it("drops leftover editorial Article.md headings on clean publish", () => {
    const clean = toReaderCleanPublish(
      "# Title\n\n## Introduction\nGiữ đoạn này.\n\n## Deep Analysis\nGiữ luôn.",
    );
    expect(clean).not.toMatch(/^## Introduction/m);
    expect(clean).not.toMatch(/^## Deep Analysis/m);
    expect(clean).toContain("Giữ đoạn này");
  });
});
