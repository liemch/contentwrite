/**
 * Soft-check: bài sạch có còn “nghe” đúng khung đã chọn không.
 * Không bắt đúng wording beat — chỉ tín hiệu cấu trúc theo family/shape.
 */

import type { ArticleShape } from "@/lib/tfes/article-shapes";
import { resolvePublishFormat } from "@/lib/tfes/publish-formats";
import { countProseWords } from "@/lib/tfes/word-count";

export type ShapeFidelityIssue = {
  code: string;
  message: string;
};

function headingCount(clean: string): number {
  return (clean.match(/^#{2,3}\s+\S+/gm) ?? []).length;
}

function hitCount(clean: string, re: RegExp): number {
  return (clean.match(re) ?? []).length;
}

/**
 * Trả về danh sách lệch khung. Rỗng = đạt soft bar.
 * Gọi sau assertCleanPublishQuality; fail → repair với SHAPE_FIDELITY.
 */
export function collectShapeFidelityIssues(
  clean: string,
  shape: ArticleShape,
  publishFormat?: string | null,
): ShapeFidelityIssue[] {
  const issues: ShapeFidelityIssue[] = [];
  const format = resolvePublishFormat(publishFormat);
  const body = clean.trim();
  if (!body) return issues;
  const words = countProseWords(body);
  const heads = headingCount(body);

  const push = (code: string, message: string) => {
    issues.push({ code, message });
  };

  switch (shape.id) {
    case "adr": {
      const hits = hitCount(
        body,
        /quyết định|decision|hệ quả|consequence|ngữ cảnh|context|revisit|mở lại|phương án/gi,
      );
      if (hits < 2) {
        push(
          "SHAPE_ADR",
          "Khung ADR: cần tín hiệu Context/Decision/Consequences/Revisit (thiếu từ khóa cấu trúc).",
        );
      }
      break;
    }
    case "internal-brief": {
      if (!/cần quyết|đề xuất|rủi ro|approve|phê duyệt|CTA|quyết gì/i.test(body)) {
        push(
          "SHAPE_BRIEF",
          "Khung Brief: mở/thân cần đề xuất hoặc “cần quyết…” + rủi ro/CTA rõ.",
        );
      }
      if (words > Math.round(format.wordHint * 1.8)) {
        push("SHAPE_BRIEF_LONG", "Khung Brief: bản sạch dài hơn brief 1 trang — rút gọn CTA.");
      }
      break;
    }
    case "failure-postmortem": {
      if (!/sự cố|incident|root cause|nguyên nhân|timeline|bài học|failure/i.test(body)) {
        push(
          "SHAPE_POSTMORTEM",
          "Khung Postmortem: thiếu tín hiệu sự cố / root cause / bài học hẹp.",
        );
      }
      break;
    }
    case "thread-qa":
    case "question-led": {
      if (heads < 2 && (body.match(/\?/g) ?? []).length < 2) {
        push(
          "SHAPE_QA",
          "Khung hỏi–đáp: cần ≥2 heading hỏi/đáp hoặc ≥2 câu hỏi trong thân.",
        );
      }
      break;
    }
    case "debate-two-sides": {
      if (!/phe|versus|\bvs\b|hai cách|hai hướng|điều kiện chọn|hybrid/i.test(body)) {
        push(
          "SHAPE_DEBATE",
          "Khung hai phe: cần tín hiệu so sánh A/B và điều kiện chọn.",
        );
      }
      break;
    }
    case "facebook-post": {
      if (heads > 3) {
        push("SHAPE_FB_HEADINGS", "Khung Facebook: quá nhiều ## — giữ ≤3 heading, thân ngắn.");
      }
      if (/HERO_IMAGE/i.test(body)) {
        push("SHAPE_FB_HERO", "Khung Facebook: bỏ HERO_IMAGE — format social không dùng hero.");
      }
      break;
    }
    case "linkedin-post": {
      if (heads > 4) {
        push("SHAPE_LI_HEADINGS", "Khung LinkedIn: quá nhiều ## — giữ mid-form gọn.");
      }
      break;
    }
    case "newsletter": {
      if (heads < 2) {
        push("SHAPE_NEWSLETTER", "Khung Newsletter: cần ≥2 mục ## + CTA cuối.");
      }
      if (!/đọc|thử|reply|thảo luận|CTA|làm gì tiếp|trong số này/i.test(body)) {
        push("SHAPE_NEWSLETTER_CTA", "Khung Newsletter: thiếu CTA / “làm gì tiếp”.");
      }
      break;
    }
    case "before-after": {
      if (!/trước|sau|đổi|chuyển|trước khi|sau khi/i.test(body)) {
        push("SHAPE_BEFORE_AFTER", "Khung Trước→Sau: cần tín hiệu trạng thái trước/sau rõ.");
      }
      break;
    }
    case "myth-bust": {
      if (!/sai|không đúng|thực ra|niềm tin|nghe xuôi|không phải/i.test(body)) {
        push("SHAPE_MYTH", "Khung phá niềm tin: cần lật niềm tin phổ biến + điều kiện còn đúng.");
      }
      break;
    }
    case "constraint-first": {
      if (!/ràng buộc|constraint|SLO|budget|ngưỡng|compliance|revisit|mở lại/i.test(body)) {
        push(
          "SHAPE_CONSTRAINT",
          "Khung ràng buộc trước: cần nêu ràng buộc cứng + khi nào mở lại quyết định.",
        );
      }
      break;
    }
    case "timeline-reframe": {
      if (!/timeline|mốc|lúc đó|sau đó|reframe|thực ra|ban đầu/i.test(body)) {
        push(
          "SHAPE_TIMELINE",
          "Khung timeline→reframe: cần mốc thời gian + câu chuyện đúng hơn.",
        );
      }
      break;
    }
    case "playbook-conditional": {
      if (!/khi nào|không nên|dấu hiệu|anti-?pattern|playbook|bước/i.test(body)) {
        push(
          "SHAPE_PLAYBOOK",
          "Khung playbook có điều kiện: cần tình huống kích hoạt + khi nào dừng.",
        );
      }
      break;
    }
    case "cost-of-inaction": {
      if (!/trì|chờ|không làm|im lặng|chi phí|ngưỡng|sở hữu|treo/i.test(body)) {
        push(
          "SHAPE_INACTION",
          "Khung giá của việc không làm: cần chi phí trì hoãn + ngưỡng phải chốt.",
        );
      }
      break;
    }
    case "field-note": {
      if (!/tuần này|quyết|tín hiệu|anti-?pattern|không đủ|chốt/i.test(body)) {
        push(
          "SHAPE_FIELD_NOTE",
          "Khung field note: cần quyết định hẹp + tín hiệu/anti-pattern.",
        );
      }
      break;
    }
    default:
      break;
  }

  // Discussion contract
  if (shape.discussion === "required" && !/\?/.test(body)) {
    push(
      "SHAPE_DISCUSSION",
      `Khung ${shape.labelVi}: bắt buộc có câu hỏi thảo luận (thiếu dấu ?).`,
    );
  }

  return issues;
}

export function assertShapeFidelity(
  clean: string,
  shape: ArticleShape,
  publishFormat?: string | null,
): void {
  const issues = collectShapeFidelityIssues(clean, shape, publishFormat);
  if (issues.length === 0) return;
  throw new Error(
    `SHAPE_FIDELITY (${shape.id}): ${issues.map((item) => item.message).join(" · ")}`,
  );
}
