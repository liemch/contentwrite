import { describe, expect, it } from "vitest";
import {
  materializeResearchBrief,
  researchPacketParseFailure,
} from "@/lib/tfes/prompts-v2";

const truncatedPacket = `RESEARCH_PACKET_JSON:
{
  "contractVersion": "research-packet.v2",
  "topic": "kinh nghiệm BA xử lý change request",
  "coverageStatus": "SUFFICIENT",
  "sources": [
    {
      "url": "https://huongtlu.wordpress.com/2022/09/03/ba-ky-nang",
      "tier": 2,
      "accessed": "2024-08-08",
      "title": "BA kỹ năng quản lý sự thay đổi yêu cầu"
    },
    {
      "url": "https://biglead.live/hieu-ung-canh-buom-trong-kinh-doanh",
      "tier": 3,
      "accessed": "2024-08-08",
      "title": "Hiệu ứng cánh bướm trong kinh doanh"
    }
  ],
  "findings": [
    "CR nhỏ vẫn kéo theo chi phí hồi quy khi chạm module dùng chung",
    "Impact analysis sớm rẻ hơn rollback muộn rất nhiều lần"
  ],
  "contradictions": ["Một số đội coi CR nhỏ là chi phí bằng không"],
  "limitations": ["Thiếu số liệu định lượng theo ngành`;

describe("research packet salvage", () => {
  it("flags malformed packet so workflow can repair", () => {
    expect(researchPacketParseFailure(truncatedPacket)).toBeTruthy();
  });

  it("returns null for a valid packet", () => {
    const valid = `RESEARCH_PACKET_JSON:\n${JSON.stringify({
      contractVersion: "research-packet.v2",
      coverageStatus: "SUFFICIENT",
      sources: [{ url: "https://example.com/a", tier: 2, accessed: "2026-08-01", title: "A" }],
      findings: ["finding"],
      contradictions: [],
      limitations: [],
    })}`;
    expect(researchPacketParseFailure(valid)).toBeNull();
  });

  it("never renders a raw JSON blob to the editor", () => {
    const brief = materializeResearchBrief(truncatedPacket);
    expect(brief).not.toContain("RESEARCH_PACKET_JSON:");
    expect(brief).not.toContain('"contractVersion"');
    expect(brief.startsWith("# Research Brief")).toBe(true);
  });

  it("salvages sources and findings from the broken packet", () => {
    const brief = materializeResearchBrief(truncatedPacket);
    expect(brief).toContain("https://huongtlu.wordpress.com/2022/09/03/ba-ky-nang");
    expect(brief).toContain("Tier 2");
    expect(brief).toContain("Hiệu ứng cánh bướm trong kinh doanh");
    expect(brief).toContain("CR nhỏ vẫn kéo theo chi phí hồi quy");
    expect(brief).toContain("lỗi định dạng");
  });

  it("leaves plain markdown briefs untouched", () => {
    const markdown = "# Research Brief\n\n## Sources\n- https://example.com/a";
    expect(materializeResearchBrief(markdown)).toBe(markdown);
  });
});
