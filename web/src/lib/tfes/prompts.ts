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

Bạn đang chạy chu trình biên tập web AI-TFES. Mỗi lần gọi chỉ làm ĐÚNG bước được yêu cầu trong user message.
Xuất tiếng Việt (trừ prompt ảnh hero tiếng Anh). Evidence-first; không bịa nguồn/số liệu.

## CẤM (bài sẽ bị coi là FAIL chất lượng)
- Lặp lại tiêu đề / cùng một câu nhiều đoạn
- Mở bài kiểu "Trong thế giới… ngày nay", "là một yếu tố quan trọng"
- Ví dụ bịa "Công ty ABC/DEF/XYZ" không có chi tiết kỹ thuật cụ thể
- References bịa (tên tác giả giả, paper không tồn tại) — chỉ dùng link/nguồn từ Research Brief
- Viết meta về "seed_topics / domain profile / Seeding Mode" như thể đó là chủ đề bài
- Đoạn Deep Analysis chỉ liệt kê chung chung không có trade-off có điều kiện`;
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

  return `## Nhiệm vụ bước NGHIÊN CỨU + TỔNG HỢP (AI-TFES)
Chủ đề bài (đã chốt — KHÔNG đổi sang câu hướng dẫn seed_topics): **${topic}**

Thực hiện Research + Synthesis theo Operating Prompt + Domain Profile:
- ≥3 nguồn độc lập từ web search; ghi rõ Tier theo Domain Profile; ưu tiên Tier 1–2
- ≥1 góc phản biện / limitations
- Cross-validation: đồng thuận vs mâu thuẫn → trade-off có điều kiện
- SĂN insight L2/L3 (điều kiện ẩn, trade-off bị giấu, reframe) — chưa viết bài 12 phần
- Nếu chưa đủ nguồn tin cậy hoặc không có insight mới → ghi rõ trong brief, không bịa

Chỉ xuất mục **"1) Research Brief"** theo template:

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
Insight ≥ L2. Viết NỬA ĐẦU theo Article.md + BAR VIẾT (mức HAY, không mức đạt):
Title, Subtitle, Metadata, Executive Summary, Introduction, Context, Problem Statement, Deep Analysis.

Yêu cầu độ sâu:
- Hook cụ thể (quan sát/nghịch lý/tình huống) — CẤM mở chung chung
- Deep Analysis ≥ 350–500 từ: nhiều góc, trade-off có điều kiện, liên kết insight L2/L3
- Không lặp câu; mỗi đoạn phải thêm thông tin mới
- Dùng thuật ngữ / cơ chế thật từ Research Brief (không bịa)

Dừng sau Deep Analysis. KHÔNG viết Examples / Recommendations / Takeaways / Discussion / References.

${articleTpl}`,

    "write-b": `## Nhiệm vụ WRITE — Phase B (nửa sau)
Tiếp tục NỬA SAU theo Article.md (khớp insight + nửa đầu trong CONTEXT):
- Real-world Examples (≥2): tình huống có ràng buộc kỹ thuật cụ thể (stack, scale, failure mode) — CẤM "Công ty ABC cải thiện hiệu suất"
- Practical Recommendations Cá nhân/Team/Tổ chức: mỗi mục có làm gì / khi nào / khi nào KHÔNG / rủi ro
- Key Takeaways (3): mỗi ý một câu sắc, không tóm lại tiêu đề
- Discussion Questions (3): mở, không yes/no nông
- References: CHỈ nguồn có trong Research Brief (giữ link). Không bịa paper.

KHÔNG viết lại nửa đầu. Tổng Phase B khoảng 600–900 từ chất lượng.

${articleTpl}`,

    "finalize-a": `## Nhiệm vụ FINALIZE — Phase A
Chỉ xuất:
- **"4) Fact-Check Ledger"** theo template FactCheck.md
- **"5) Knowledge Record"** (Title, Category, Domain, Keywords, Core Message, Key Insights, References, Evergreen, Editorial Score, Date)

Không viết Bản sạch / HERO.

${factTpl}`,

    "finalize-b": `## Nhiệm vụ RÀ SOÁT — Phase B (Bản sạch)
Chỉ xuất:
- **"6) === BẢN SẠCH ĐỂ ĐĂNG ==="** — bài hoàn chỉnh copy-paste (gỡ nhãn Section; Title/Subtitle/References; \`![alt](HERO_IMAGE)\`)
- **HERO IMAGE BRIEF** (concept + prompt English + caption + alt; minh họa, không số liệu giả/người thật/logo)
- Dòng cuối: \`STATUS: Publish Ready — chờ người duyệt\`

Bắt buộc marker: === BẢN SẠCH ĐỂ ĐĂNG ===
Bản sạch phải đủ dài (~1.200 từ), giữ insight L2/L3, “khi nào KHÔNG”, references URL từ Research — không rút thành tóm tắt nông.
Tuân thủ Publish.md + Quality Gates Review.md (G1–G8).

${publishTpl}

### Template: Review.md (Quality Gates)

${readTfesFile("05-Templates/Review.md")}`,

    finalize: `## Nhiệm vụ FINALIZE (full)
Xuất lần lượt mục 4, 5, 6 theo Operating Prompt + templates.

${factTpl}

${publishTpl}`,
  };

  return `${instructions[step]}

=== CONTEXT (research / insight / draft đã có) ===
${context}`;
}
