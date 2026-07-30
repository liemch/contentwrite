import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const TFES_ROOT = join(process.cwd(), "content", "ai-tfes");

function assertTfesRoot() {
  if (!existsSync(join(TFES_ROOT, "00-README.md"))) {
    throw new Error(
      "Thư mục content/ai-tfes chưa có. Chạy: node scripts/sync-tfes.mjs",
    );
  }
}

export function readTfesFile(relativePath: string): string {
  assertTfesRoot();
  const fullPath = join(TFES_ROOT, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`AI-TFES file không tồn tại: ${relativePath}`);
  }
  return readFileSync(fullPath, "utf-8");
}

export function getSystemPrompt(domain: string): string {
  const operatingShort = readTfesFile("02-Prompts/Operating-Prompt-SHORT.md");
  const domainProfile = readTfesFile(
    `04-Domain-Profiles/${domain === "soft-skills" ? "soft-skills" : "engineering"}.md`,
  );

  return `${operatingShort}\n\n---\n\n## DOMAIN PROFILE (active)\n\n${domainProfile}`;
}

/**
 * Prompt siêu ngắn theo bước — Hobby 60s không đủ cho full Operating Prompt + GLM-5.2.
 */
export function getCompactStepPrompt(
  domain: string,
  step: "research" | "insight" | "write" | "finalize",
): string {
  const domainLabel = domain === "soft-skills" ? "soft-skills" : "engineering";
  const common = `Editorial Office (${domainLabel}). Tiếng Việt. Evidence-first, không bịa, không clickbait.`;

  switch (step) {
    case "research":
      return `${common}
Nhiệm vụ: Research Brief. ≥3 nguồn từ search, insight tiềm năng, trade-off. CHƯA viết bài.
Xuất đúng mục "1) Research Brief".`;
    case "insight":
      return `${common}
Nhiệm vụ: Insight Gate. Xếp L0–L3. Chỉ ≥L2 mới viết. 3 test: So what / Không hiển nhiên / Chịu phản biện.
Xuất "2) Insight Gate result + Editorial Decision". Nếu <L2 → đề xuất đổi góc, KHÔNG viết bài.`;
    case "write":
      return `${common}
Nhiệm vụ: viết bài 12 phần theo Article template. Insight L2/L3 đặt sớm. Hook cụ thể, có "khi nào KHÔNG".
Không viết Fact-Check / Knowledge / Bản sạch.`;
    case "finalize":
      return `${common}
Nhiệm vụ finalize: Fact-Check Ledger, Knowledge Record, === BẢN SẠCH ĐỂ ĐĂNG === (+ HERO IMAGE BRIEF), STATUS: Publish Ready.`;
  }
}

export function buildDailyTaskPrompt(input: {
  domain: string;
  topic?: string;
  editorialMemory?: string;
}): string {
  const template = readTfesFile("02-Prompts/Daily-Task.md");
  const memory =
    input.editorialMemory?.trim() ||
    "kho đang trống — chạy Seeding Mode";

  return template
    .replace("`<engineering | soft-skills>`", input.domain)
    .replace(
      "<dán vào đây, hoặc ghi \"kho đang trống — chạy Seeding Mode\">",
      memory,
    )
    .replace("<nếu có>", "không có")
    .replace("<tùy chọn>", input.topic ?? "tự chọn theo domain profile");
}

export function buildResearchPrompt(topic: string, searchBlob: string): string {
  return `Chủ đề bài: ${topic}

Dưới đây là kết quả web search (nguồn thật). Hãy thực hiện BƯỚC Research của AI-TFES:
- Tổng hợp ≥3 nguồn độc lập
- Ghi insight tiềm năng và trade-off
- CHƯA viết bài — chỉ xuất mục "1) Research Brief" theo Operating Prompt

=== WEB SEARCH RESULTS ===
${searchBlob}`;
}

export function buildPipelinePrompt(
  step: "insight" | "write" | "write-a" | "write-b" | "finalize-a" | "finalize-b" | "finalize",
  context: string,
): string {
  const instructions: Record<typeof step, string> = {
    insight:
      'Dựa trên Research Brief, thực hiện INSIGHT GATE + Editorial Decision. Xuất mục "2) Insight Gate result + Editorial Decision". Nếu < L2, dừng và đề xuất đổi góc/chủ đề — KHÔNG viết bài.',
    write:
      'Insight đã ≥ L2. Viết mục "3) Bài viết 12 phần" theo template Article.md và Bar Viết. Tiếng Việt, 1.200–1.800 từ.',
    "write-a":
      'Insight ≥ L2. Viết NỬA ĐẦU bài 12 phần (Title, Subtitle, Metadata, Executive Summary, Introduction, Context, Problem Statement, Deep Analysis). Tiếng Việt, súc tích. Dừng sau Deep Analysis. KHÔNG viết phần sau.',
    "write-b":
      'Tiếp tục NỬA SAU bài 12 phần (Real-world Examples, Practical Recommendations Cá nhân/Team/Tổ chức, Key Takeaways, Discussion Questions, References). Khớp insight & nửa đầu đã có. KHÔNG viết lại nửa đầu.',
    "finalize-a":
      'Chỉ xuất "4) Fact-Check Ledger" và "5) Knowledge Record" từ draft. Không viết Bản sạch.',
    "finalize-b":
      'Chỉ xuất "6) === BẢN SẠCH ĐỂ ĐĂNG ===" (+ HERO IMAGE BRIEF) và dòng "STATUS: Publish Ready — chờ người duyệt". Gỡ nhãn kỹ thuật.',
    finalize:
      'Hoàn thiện mục "4) Fact-Check Ledger", "5) Knowledge Record", "6) === BẢN SẠCH ĐỂ ĐĂNG ===" (+ HERO IMAGE BRIEF), và dòng "STATUS: Publish Ready — chờ người duyệt".',
  };

  return `${instructions[step]}

=== CONTEXT ===
${context}`;
}
