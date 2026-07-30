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

export function buildPipelinePrompt(step: "insight" | "write" | "finalize", context: string): string {
  const instructions: Record<typeof step, string> = {
    insight:
      'Dựa trên Research Brief, thực hiện INSIGHT GATE + Editorial Decision. Xuất mục "2) Insight Gate result + Editorial Decision". Nếu < L2, dừng và đề xuất đổi góc/chủ đề — KHÔNG viết bài.',
    write:
      'Insight đã ≥ L2. Viết mục "3) Bài viết 12 phần" theo template Article.md và Bar Viết. Tiếng Việt, 1.200–1.800 từ.',
    finalize:
      'Hoàn thiện mục "4) Fact-Check Ledger", "5) Knowledge Record", "6) === BẢN SẠCH ĐỂ ĐĂNG ===" (+ HERO IMAGE BRIEF), và dòng "STATUS: Publish Ready — chờ người duyệt".',
  };

  return `${instructions[step]}

=== CONTEXT ===
${context}`;
}
