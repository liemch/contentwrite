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

function domainProfilePath(domain: string): string {
  return `04-Domain-Profiles/${domain === "soft-skills" ? "soft-skills" : "engineering"}.md`;
}

/**
 * System prompt chuẩn AI-TFES:
 * Operating-Prompt-SHORT + Domain Profile đầy đủ (tông, tier nguồn, sensitivity, seed…).
 */
export function getSystemPrompt(domain: string): string {
  const operatingShort = readTfesFile("02-Prompts/Operating-Prompt-SHORT.md");
  const domainProfile = readTfesFile(domainProfilePath(domain));

  return `${operatingShort}

---

## DOMAIN PROFILE (active — bắt buộc tuân thủ)

${domainProfile}

---

Bạn đang chạy pipeline web AI-TFES. Mỗi lần gọi chỉ làm ĐÚNG bước được yêu cầu trong user message.
Xuất tiếng Việt (trừ prompt ảnh hero tiếng Anh). Evidence-first; không bịa nguồn/số liệu.`;
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
    .replace("<tùy chọn>", input.topic ?? "đã chọn — xem mục Chủ đề bài");
}

export function buildResearchPrompt(topic: string, searchBlob: string): string {
  const researchTemplate = readTfesFile("05-Templates/Research-Brief.md");

  return `## Nhiệm vụ bước RESEARCH (AI-TFES)
Chủ đề bài (đã chốt — KHÔNG đổi sang câu hướng dẫn seed_topics): **${topic}**

Thực hiện Research theo Operating Prompt + Domain Profile:
- Tổng hợp ≥3 nguồn độc lập từ web search (ưu tiên tier trong Domain Profile)
- Insight tiềm năng + trade-off + cross-validation
- CHƯA viết bài 12 phần — chỉ xuất mục **"1) Research Brief"**

### Template Research Brief (bám cấu trúc này)

${researchTemplate}

=== WEB SEARCH RESULTS (nguồn thật) ===
${searchBlob}`;
}

type PipelineStep =
  | "insight"
  | "write"
  | "write-a"
  | "write-b"
  | "finalize-a"
  | "finalize-b"
  | "finalize";

function templateBlock(title: string, relativePath: string): string {
  return `### Template: ${title}\n\n${readTfesFile(relativePath)}`;
}

/**
 * User prompt từng bước — nhúng template thư viện AI-TFES.
 */
export function buildPipelinePrompt(step: PipelineStep, context: string): string {
  const articleTpl = templateBlock("Article.md (12 phần)", "05-Templates/Article.md");
  const factTpl = templateBlock("FactCheck.md", "05-Templates/FactCheck.md");
  const publishTpl = templateBlock("Publish.md (checklist)", "05-Templates/Publish.md");

  const instructions: Record<PipelineStep, string> = {
    insight: `## Nhiệm vụ bước INSIGHT GATE (AI-TFES)
Dựa trên Research Brief trong CONTEXT, thực hiện *** INSIGHT GATE *** + Editorial Decision theo Operating Prompt:
- Nêu luận điểm trung tâm + xếp L0–L3
- 3 test: (a) So what (b) Không hiển nhiên (c) Chịu phản biện
- CHỈ đạt ≥ L2 mới được viết. Nếu < L2 → đề xuất đổi góc/chủ đề, KHÔNG viết bài.

Xuất đúng mục **"2) Insight Gate result + Editorial Decision"**.`,

    write: `## Nhiệm vụ bước WRITE (AI-TFES)
Insight đã ≥ L2. Viết mục **"3) Bài viết 12 phần"** theo BAR VIẾT (Operating Prompt) + template Article.md.
Tiếng Việt, khoảng 1.200–1.800 từ. Insight L2/L3 đặt sớm; có "khi nào KHÔNG".

${articleTpl}`,

    "write-a": `## Nhiệm vụ WRITE — Phase A (nửa đầu)
Insight ≥ L2. Viết NỬA ĐẦU theo Article.md + BAR VIẾT:
Title, Subtitle, Metadata, Executive Summary, Introduction, Context, Problem Statement, Deep Analysis.
Dừng sau Deep Analysis. KHÔNG viết Examples / Recommendations / Takeaways / Discussion / References.

${articleTpl}`,

    "write-b": `## Nhiệm vụ WRITE — Phase B (nửa sau)
Tiếp tục NỬA SAU theo Article.md (khớp insight + nửa đầu trong CONTEXT):
Real-world Examples (≥2), Practical Recommendations (Cá nhân/Team/Tổ chức — có khi nào KHÔNG),
Key Takeaways, Discussion Questions, References (link thật từ research nếu có).
KHÔNG viết lại nửa đầu.

${articleTpl}`,

    "finalize-a": `## Nhiệm vụ FINALIZE — Phase A
Chỉ xuất:
- **"4) Fact-Check Ledger"** theo template FactCheck.md
- **"5) Knowledge Record"** (Title, Category, Domain, Keywords, Core Message, Key Insights, References, Evergreen, Editorial Score, Date)

Không viết Bản sạch / HERO.

${factTpl}`,

    "finalize-b": `## Nhiệm vụ FINALIZE — Phase B
Chỉ xuất:
- **"6) === BẢN SẠCH ĐỂ ĐĂNG ==="** — bài hoàn chỉnh để copy-paste (gỡ nhãn Section kỹ thuật; có Title/Subtitle/References; chỗ \`![alt](HERO_IMAGE)\`)
- **HERO IMAGE BRIEF** (concept + prompt English + caption + alt; minh họa, không số liệu giả/người thật/logo)
- Dòng cuối: \`STATUS: Publish Ready — chờ người duyệt\`

Bắt buộc có đúng dòng marker: === BẢN SẠCH ĐỂ ĐĂNG ===
Tuân thủ checklist Publish.md (nội dung đăng, không phải form metadata nội bộ).

${publishTpl}`,

    finalize: `## Nhiệm vụ FINALIZE (full)
Xuất lần lượt mục 4, 5, 6 theo Operating Prompt + templates.

${factTpl}

${publishTpl}`,
  };

  return `${instructions[step]}

=== CONTEXT (research / insight / draft đã có) ===
${context}`;
}
