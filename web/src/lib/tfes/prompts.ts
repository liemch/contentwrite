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

Bạn đang chạy chu trình biên tập web AI-TFES (10 bước Operating Prompt). Mỗi lần gọi chỉ làm ĐÚNG bước được yêu cầu trong user message.
Xuất tiếng Việt (trừ prompt ảnh hero tiếng Anh). Evidence-first; không bịa nguồn/số liệu.

## CẤM (bài sẽ bị coi là FAIL chất lượng)
- Lặp lại tiêu đề / cùng một câu nhiều đoạn
- Mở bài kiểu "Trong thế giới… ngày nay", "là một yếu tố quan trọng"
- Ví dụ bịa "Công ty ABC/DEF/XYZ" không có chi tiết kỹ thuật cụ thể
- References bịa (tên tác giả giả, paper không tồn tại) — chỉ dùng link/nguồn từ Research Brief
- Viết meta về "seed_topics / domain profile / Seeding Mode" như thể đó là chủ đề bài
- Đoạn Deep Analysis chỉ liệt kê chung chung không có trade-off có điều kiện
- Gắn (L2)/(L3)/L2 vào Title hoặc Subtitle (cấp insight chỉ nằm ở tab Insight)
- Nhét HERO IMAGE BRIEF vào bản nháp 12 phần (Hero chỉ ở Publish Ready)
- Lạm dụng markdown table — ưu tiên bullet/numbered list; table chỉ khi so sánh ≤3 cột số liệu thật`;
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

/** Bước 3+4: Verification + Synthesis → Research Brief (sau khi đã có web search) */
export function buildResearchPrompt(
  topic: string,
  searchBlob: string,
  options?: { previousGateFail?: string | null },
): string {
  const researchTemplate = readTfesFile("05-Templates/Research-Brief.md");
  const gateFail = options?.previousGateFail?.trim();

  const retryBlock = gateFail
    ? `
### Góc trước BỊ CỔNG INSIGHT LOẠI (< L2) — bắt buộc đào lại
Lần Research trước chưa đủ sâu. Đọc phản hồi Gate dưới đây rồi:
- Đổi / làm sắc góc (điều kiện ẩn, trade-off bị giấu, reframe) — KHÔNG viết lại cùng một tóm tắt
- Ưu tiên nguồn phản biện / mâu thuẫn giữa nguồn
- Candidate insight phải hướng tới L2/L3

=== PHẢN HỒI GATE LẦN TRƯỚC ===
${gateFail.slice(0, 2500)}
=== HẾT PHẢN HỒI ===
`
    : "";

  return `## Nhiệm vụ bước 3–4: VERIFICATION + SYNTHESIS (AI-TFES Operating Prompt)
Chủ đề bài (đã chốt — KHÔNG đổi sang câu hướng dẫn seed_topics): **${topic}**

Editorial Memory + Research (web-search) đã xong ở tick trước. Bây giờ CHỈ làm:
${retryBlock}
### 3) Verification
- Đối chiếu các nguồn trong WEB SEARCH RESULTS; ghi Tier theo Domain Profile
- Loại / đánh dấu thấp nguồn thiên marketing, không có tác giả, hoặc không kiểm chứng được
- Phát hiện mâu thuẫn giữa nguồn — PHÂN TÍCH, không chọn bừa một phía
- ≥3 nguồn độc lập dùng được; khuyến nghị ghi 5–8 nếu có; ≥1 góc phản biện / limitations

### 4) Synthesis (Knowledge Synthesis — CẤM tóm tắt từng bài)
- So sánh điểm giống / khác → trade-off có điều kiện
- Rút insight mới (điều kiện ẩn, trade-off bị giấu, reframe) — không paraphrase từng nguồn
- Điền đủ mục template: Different Perspectives / Cross-validation, Trade-offs, Insights (≥3 có nguồn), Practical Lessons

Chưa viết Insight Gate / Decision / Planning / bài 12 phần.
Nếu chưa đủ nguồn tin cậy hoặc không có insight mới → ghi rõ trong brief, không bịa.

Chỉ xuất mục **"1) Research Brief"** theo template:

${researchTemplate}

=== WEB SEARCH RESULTS (nguồn thật — bước 2 Research) ===
${searchBlob}`;
}

type PipelineStep =
  | "insight"
  | "insight-a"
  | "insight-decision"
  | "insight-planning"
  | "insight-b"
  | "write"
  | "write-a"
  | "write-b"
  | "finalize-review"
  | "finalize-a"
  | "finalize-b"
  | "finalize";

const FORMAT_RULES_WRITE = `### Định dạng bài (bắt buộc)
- Title & Subtitle: tiếng Việt rõ nghĩa — CẤM gắn (L2), (L3), L2, cấp insight
- CẤM viết HERO IMAGE BRIEF / prompt ảnh trong bước này
- Ưu tiên đoạn văn + bullet list; HẠN CHẾ markdown table (chỉ khi thật sự cần so sánh số liệu ngắn)
- Không viết meta biên tập ("Insight Gate đạt L2…") vào body bài`;

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
  const reviewTpl = templateBlock("Review.md", "05-Templates/Review.md");

  const instructions: Record<PipelineStep, string> = {
    insight: `## Nhiệm vụ Insight (full — legacy)
Gate + Decision + Planning. CHỈ ≥ L2 mới được viết.`,

    "insight-a": `## Nhiệm vụ Insight Gate (chèn giữa Synthesis → Decision — Operating Prompt)
CHỈ đánh giá cổng insight — KHÔNG viết Editorial Decision / Planning / bài / Hero.

Dựa Research Brief (đã Verification + Synthesis) trong CONTEXT:
1. Nêu luận điểm trung tâm (1–2 câu)
2. Xếp hạng L0–L3 + giải thích ngắn
   - L0 hiển nhiên · L1 tổng hợp · L2 điều kiện/ẩn · L3 reframe
3. 3 test: (a) So what (b) Không hiển nhiên (c) Chịu phản biện — Pass/Fail từng test
4. Kết luận một dòng: **ĐẠT ≥ L2 — được viết** HOẶC **CHƯA ĐẠT — đổi góc/chủ đề**

Xuất ngắn (~400–700 từ). Không Title/Subtitle đăng bài. Không 12 phần.`,

    "insight-decision": `## Nhiệm vụ bước 5: EDITORIAL DECISION (ngắn — tránh timeout)
Gate đã ≥ L2. CHỈ chốt Decision — CẤM Planning / Writing / Hero / tóm tắt lại Research.

Xuất bullet ngắn (≤250 từ), đúng các mục:
- **Góc chốt:** …
- **Category:** …
- **Audience:** …
- **Lý do chọn** (thực tiễn + học hỏi + evergreen — KHÔNG "vì đang hot"): …
- **Rủi ro editorial** (nếu có): …

Không viết dài. Không lặp lại Gate tests.`,

    "insight-planning": `## Nhiệm vụ bước 6: PLANNING (gọn)
Decision đã chốt. CHỈ Planning — CẤM viết bài 12 phần / Hero.

Xuất checklist (≤600 từ):
- Objective · Audience · 1 Core Message (insight L2/L3)
- 3–5 Key Insights (mỗi ý + nguồn ngắn từ Research)
- Ví dụ dự kiến (≥2)
- Story Flow (3–6 gạch đầu dòng)
- Khuyến nghị 3 cấp: Cá nhân / Team / Tổ chức (làm gì / khi nào / khi nào KHÔNG)
- Discussion Questions (3)

Không viết lại Decision / Gate.`,

    "insight-b": `## Nhiệm vụ Insight Decision+Planning (legacy gộp)
Cổng ≥ L2. Chốt Decision + Planning. Không viết 12 phần / Hero.`,

    write: `## Nhiệm vụ bước 7: WRITING (AI-TFES)
Insight ≥ L2 + Planning xong. Viết đủ 12 phần theo BAR VIẾT + Article.md.
Tiếng Việt ~1.200–1.800 từ. Có "khi nào KHÔNG".

${FORMAT_RULES_WRITE}

${articleTpl}`,

    "write-a": `## Nhiệm vụ bước 7 WRITING — Phase A (nửa đầu)
Insight ≥ L2. Viết NỬA ĐẦU theo Article.md + BAR VIẾT (mức HAY):
Title, Subtitle, Metadata, Executive Summary, Introduction, Context, Problem Statement, Deep Analysis.

Yêu cầu độ sâu:
- Hook cụ thể — CẤM mở chung chung
- Deep Analysis ≥ 350–500 từ: nhiều góc, trade-off có điều kiện (không gắn nhãn L2 vào title)
- Không lặp câu; thuật ngữ / cơ chế thật từ Research Brief

Dừng sau Deep Analysis. KHÔNG Examples / Recommendations / Takeaways / Discussion / References / HERO.

${FORMAT_RULES_WRITE}

${articleTpl}`,

    "write-b": `## Nhiệm vụ bước 7 WRITING — Phase B (nửa sau)
Tiếp tục NỬA SAU theo Article.md + Planning trong CONTEXT:
- Real-world Examples (≥2): ràng buộc kỹ thuật cụ thể — CẤM "Công ty ABC"
- Practical Recommendations Cá nhân/Team/Tổ chức: làm gì / khi nào / khi nào KHÔNG / rủi ro
- Key Takeaways (3) · Discussion Questions (3) · References (chỉ Research Brief)

KHÔNG viết lại nửa đầu. KHÔNG HERO IMAGE BRIEF. ~600–900 từ.

${FORMAT_RULES_WRITE}

${articleTpl}`,

    "finalize-review": `## Nhiệm vụ bước 8: REVIEW (AI-TFES Operating Prompt §6)
Tự review bản nháp 12 phần theo tiêu chí — CHƯA Fact-Check Ledger / Bản sạch / Hero.

Phải đạt hết (ghi Pass/Fail từng mục):
- Cấu trúc đầy đủ (12 phần)
- Không lỗi logic
- Đủ bằng chứng
- ≥3 insight + ≥1 trade-off + ≥1 góc phản biện + ≥1 bài học
- Giá trị thực tiễn (biết nên / không nên làm gì)
- Có câu hỏi thảo luận
- Không quảng bá · Không sao chép
- Tránh tuyệt đối hóa ("luôn luôn / chắc chắn / tốt nhất…") trừ khi có bằng chứng

Xuất theo template Review.md. Kết luận: Publish / Minor Revision / Major Revision / Rewrite.
Nếu Rewrite hoặc thiếu G1–G8 nghiêm trọng → nêu rõ phần cần sửa (vẫn xuất đủ checklist).

${reviewTpl}`,

    "finalize-a": `## Nhiệm vụ bước 9: FACT CHECK (AI-TFES)
Chỉ xuất **"4) Fact-Check Ledger"** theo FactCheck.md:
- Mỗi khẳng định Fact/Practice → nguồn đã đọc (URL từ Research) → verdict
- Số liệu & trích dẫn khớp nguồn
- Gắn nhãn Opinion / Prediction rõ ràng

Không viết Bản sạch / HERO / Knowledge Record (Knowledge Record ở bước Publish Ready).

${factTpl}`,

    "finalize-b": `## Nhiệm vụ bước 10: PUBLISH READY (AI-TFES)
Xuất theo thứ tự:
1. **"5) Knowledge Record"** — Title, Category, Domain, Keywords, Core Message, Key Insights, References, Evergreen, Editorial Score, Date
2. **"6) === BẢN SẠCH ĐỂ ĐĂNG ==="** — bài hoàn chỉnh (gỡ nhãn Section; Title/Subtitle KHÔNG (L2); References; \`![alt](HERO_IMAGE)\`)
   - Hạn chế table; ưu tiên list
3. Khối riêng **HERO IMAGE BRIEF**:
   - Concept · **Prompt (English):** "...." (tiếng Anh sạch) · Caption + Alt
4. Dòng cuối: \`STATUS: Publish Ready — chờ người duyệt\`

Bắt buộc marker: === BẢN SẠCH ĐỂ ĐĂNG ===
Bản sạch ~1.200 từ, giữ insight sâu, “khi nào KHÔNG”, references URL.
Tuân thủ Publish.md.

${publishTpl}`,

    finalize: `## Nhiệm vụ FINALIZE (full legacy)
Review + Fact-Check + Publish Ready theo Operating Prompt.

${factTpl}

${publishTpl}`,
  };

  return `${instructions[step]}

=== CONTEXT (research / insight / draft đã có) ===
${context}`;
}
