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
 * Operating-Prompt.md (full) + Domain Profile đầy đủ (tông, tier nguồn, sensitivity, seed…).
 */
export function getSystemPrompt(domain: string): string {
  const operating = readTfesFile("02-Prompts/Operating-Prompt.md");
  const domainProfile = readTfesFile(domainProfilePath(domain));

  return `${operating}

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
- Lạm dụng markdown table — ưu tiên bullet/numbered list; table chỉ khi so sánh ≤3 cột số liệu thật
- Bản đăng kiểu listicle đánh số (1. Hook / 2. Khi nào nên / Decision Framework…) — phải viết liền mạch theo Article.md
- Lặp mục “khi nào không nên” nhiều lần chỉ để đệm chữ`;
}

/**
 * System prompt MỎNG cho bước ngắn (Gate / Decision / Planning / Review / Fact).
 * Không nhồi Operating-Prompt full → tránh gpt-oss reasoning quá lâu / timeout 240s.
 */
export function getSystemPromptLite(domain: string): string {
  const domainProfile = readTfesFile(domainProfilePath(domain));
  // Chỉ lấy phần đầu hồ sơ (audience, tông, tier) — đủ cho Decision
  const clipped = domainProfile.slice(0, 1_200).trim();

  return `Bạn là biên tập viên AI-TFES. Chỉ làm ĐÚNG nhiệm vụ trong user message — không làm thêm bước khác.
Tiếng Việt. Evidence-first; không bịa nguồn/số liệu. Trả lời ngắn, đúng format yêu cầu.

Domain: **${domain === "soft-skills" ? "soft-skills" : "engineering"}**
${clipped}

CẤM: viết dài lan man; lặp lại toàn bộ Research; gắn (L2) vào Title; HERO IMAGE BRIEF; Planning khi đang Decision (và ngược lại).`;
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
  | "finalize-polish"
  | "finalize";

const FORMAT_RULES_WRITE = `### Định dạng bài (bắt buộc)
- Title & Subtitle: tiếng Việt rõ nghĩa — CẤM gắn (L2), (L3), L2, cấp insight
- CẤM viết HERO IMAGE BRIEF / prompt ảnh trong bước này
- Ưu tiên đoạn văn + bullet list; HẠN CHẾ markdown table (chỉ khi thật sự cần so sánh số liệu ngắn)
- Không viết meta biên tập ("Insight Gate đạt L2…", "(L2 insight)") vào body bài`;

/** Một sợi chuyện xuyên suốt — chống bản xuất bản rời / listicle */
const NARRATIVE_FLOW_RULES = `### Nhịp đọc (bắt buộc — bản đăng phải cuốn)
- MỘT luận điểm trung tâm xuyên suốt từ mở bài → kết; mỗi ## phải ĐẨY luận điểm đi một bước, không tóm tắt lại từ đầu
- CẤM outline blog marketing: "1. Hook", "2. Executive Summary", "3. Khi nào nên", "Decision Framework", đánh số 1–11 kiểu checklist
- CẤM lặp cùng một ý "khi nào không nên" ở ≥2 mục riêng — gộp một lần trong Recommendations (hoặc một đoạn Deep Analysis), rồi đi tiếp
- Hook mở đầu phải nối mượt vào Introduction/Context (không dựng xong rồi nhảy sang bullet tóm tắt)
- Đoạn chuyển: cuối mỗi phần có câu cầu nối sang phần sau ("điểm mù…", "vì vậy…", "trade-off thật…")
- Giọng engineering: cụ thể (cơ chế, ràng buộc, failure mode) — không giọng slide consulting / % bịa
- Nhịp câu: xen câu ngắn chốt sau vài câu dài; tránh mọi đoạn đều 3 câu khuôn mẫu`;

function templateBlock(title: string, relativePath: string): string {
  return `### Template: ${title}\n\n${readTfesFile(relativePath)}`;
}

/**
 * User prompt từng bước — nhúng template thư viện AI-TFES.
 * @param writingPrefsBlock — block WRITING PREFS (số từ / tránh format) từ article + Settings
 */
export function buildPipelinePrompt(
  step: PipelineStep,
  context: string,
  writingPrefsBlock?: string,
): string {
  const articleTpl = templateBlock("Article.md (12 phần)", "05-Templates/Article.md");
  const factTpl = templateBlock("FactCheck.md", "05-Templates/FactCheck.md");
  const publishTpl = templateBlock("Publish.md (checklist)", "05-Templates/Publish.md");
  const reviewTpl = templateBlock("Review.md", "05-Templates/Review.md");
  const prefs = writingPrefsBlock?.trim()
    ? `\n${writingPrefsBlock.trim()}\n`
    : "";

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
Insight ≥ L2 + Planning xong. Viết đủ 12 phần theo BAR VIẾT + Article.md (bản làm việc nội bộ).
Có "khi nào KHÔNG". Độ dài theo WRITING PREFS.

${prefs}
${FORMAT_RULES_WRITE}

${NARRATIVE_FLOW_RULES}

${articleTpl}`,

    "write-a": `## Nhiệm vụ bước 7 WRITING — Phase A (nửa đầu)
Insight ≥ L2. Viết NỬA ĐẦU theo Article.md + BAR VIẾT (mức HAY) — bản làm việc nội bộ:
Title, Subtitle, Metadata, Executive Summary, Introduction, Context, Problem Statement, Deep Analysis.

Yêu cầu độ sâu:
- Hook cụ thể — CẤM mở chung chung; sau hook viết tiếp mạch (không đóng lại bằng bullet tóm tắt)
- Đặt insight L2/L3 sớm (1–2 câu rõ điều kiện) rồi mới Context / Problem
- Deep Analysis ≥ 350–500 từ: nhiều góc, trade-off có điều kiện (không gắn nhãn L2 vào title)
- Không lặp câu; thuật ngữ / cơ chế thật từ Research Brief
- Heading đúng tên Article.md (## Introduction, ## Context…) — CẤM "1. Hook", "2. Executive Summary"

Dừng sau Deep Analysis. KHÔNG Examples / Recommendations / Takeaways / Discussion / References / HERO.

${prefs}
${FORMAT_RULES_WRITE}

${NARRATIVE_FLOW_RULES}

${articleTpl}`,

    "write-b": `## Nhiệm vụ bước 7 WRITING — Phase B (nửa sau)
Tiếp tục NỬA SAU theo Article.md + Planning trong CONTEXT — nối tiếp nửa đầu (đọc part A trong CONTEXT):
- Real-world Examples (≥2): ràng buộc kỹ thuật cụ thể — CẤM "Công ty ABC"; mỗi case minh họa luận điểm đã nêu, không case minh họa sơ đồ
- Practical Recommendations Cá nhân/Team/Tổ chức: làm gì / khi nào / khi nào KHÔNG / rủi ro — chỉ MỘT khối “khi nào KHÔNG” (không tách mục riêng trùng)
- Key Takeaways (3) · Discussion Questions (3) · References (chỉ Research Brief, URL thật)
- Câu chuyển từ Deep Analysis → Examples → Recommendations phải liền mạch

KHÔNG viết lại nửa đầu. KHÔNG HERO IMAGE BRIEF.

${prefs}
${FORMAT_RULES_WRITE}

${NARRATIVE_FLOW_RULES}

${articleTpl}`,

    "finalize-review": `## Nhiệm vụ bước 8: REVIEW (AI-TFES Operating Prompt §6)
Tự review bản nháp 12 phần theo tiêu chí — CHƯA Fact-Check Ledger / Bản sạch / Hero.

Phải đạt hết (ghi Pass/Fail từng mục):
- Cấu trúc đầy đủ (12 phần Article.md)
- Không lỗi logic
- Đủ bằng chứng
- ≥3 insight + ≥1 trade-off + ≥1 góc phản biện + ≥1 bài học
- Giá trị thực tiễn (biết nên / không nên làm gì)
- Có câu hỏi thảo luận
- Không quảng bá · Không sao chép
- Tránh tuyệt đối hóa ("luôn luôn / chắc chắn / tốt nhất…") trừ khi có bằng chứng
- **Nhịp đọc:** Fail nếu listicle đánh số (Hook/Khi nào nên/Framework…), mục “không nên” lặp, hoặc các phần không nối với nhau

Xuất theo template Review.md. Kết luận: Publish / Minor Revision / Major Revision / Rewrite.
Nếu Rewrite hoặc thiếu G1–G8 nghiêm trọng → nêu rõ phần cần sửa (vẫn xuất đủ checklist).

${reviewTpl}`,

    "finalize-a": `## Nhiệm vụ bước 9: FACT CHECK (AI-TFES)
Chỉ xuất **"4) Fact-Check Ledger"** theo FactCheck.md:
- Mỗi khẳng định Fact/Practice → nguồn đã đọc (URL từ Research) → verdict
- Số liệu & trích dẫn khớp nguồn
- Gắn nhãn Opinion / Prediction rõ ràng
- Số % / survey không có trong Research Brief → FAIL hoặc ghi Opinion

Không viết Bản sạch / HERO / Knowledge Record (Knowledge Record ở bước Publish Ready).

${factTpl}`,

    "finalize-b": `## Nhiệm vụ bước 10: PUBLISH READY — BẢN ĐỌC LIỀN (đăng tin)
Viết LẠI từ nháp 12 phần thành bài hoàn chỉnh cho mọi người đọc. Không copy skeleton Article.md / listicle.

Xuất theo thứ tự:
1. **"5) Knowledge Record"** — Title, Category, Domain, Keywords, Core Message, Key Insights, References, Evergreen, Editorial Score, Date (metadata nội bộ — KHÔNG nằm trong bản sạch)
2. **"6) === BẢN SẠCH ĐỂ ĐĂNG ==="** rồi bài đăng bên dưới:
${prefs}
### BẢN SẠCH = BÀI ĐỌC LIỀN
- CẤM heading biên tập: Introduction, Context, Problem Statement, Deep Analysis, Real-world Examples, Practical Recommendations, Executive Summary, Key Takeaways, Metadata
- Cấu trúc: \`# Title\` → Subtitle → \`![mô tả ngắn](HERO_IMAGE)\` → đoạn mở (hook + luận điểm sớm) → thân bài liền mạch → kết ngắn → (tuỳ) câu hỏi thảo luận → References
- \`##\` chỉ dùng tiêu đề ĐỌC ĐƯỢC (vd. “Ba rủi ro cần nhìn thẳng”) — không dùng tên section Article.md
- Một luận điểm xuyên suốt; không meta “Insight L2”; không Knowledge Record trong body
- Title/Subtitle tiếng Việt, KHÔNG (L2); CẤM dòng "alt" trần
- References chỉ URL từ Research; độ dài theo WRITING PREFS
3. Khối riêng **HERO IMAGE BRIEF** (sau bản sạch):
   - Concept · **Prompt (English):** "...." (tiếng Anh sạch) · Caption + Alt
4. Dòng cuối: \`STATUS: Publish Ready — chờ người duyệt\`

Bắt buộc marker: === BẢN SẠCH ĐỂ ĐĂNG ===

${NARRATIVE_FLOW_RULES}

${publishTpl}`,

    "finalize-polish": `## Nhiệm vụ bước 10b: POLISH BẢN SẠCH (đăng tin)
Biên tập LẠI bản sạch đã có thành bản sẵn sàng đăng — KHÔNG viết lại luận điểm, KHÔNG bịa số liệu / nguồn mới.

Chỉ xuất bài markdown hoàn chỉnh (bắt đầu bằng \`# Title\`). Không Knowledge Record, không HERO IMAGE BRIEF, không STATUS.

Sửa bắt buộc:
- Gỡ sót: dòng "alt" trần, placeholder HERO_IMAGE lẻ, heading biên tập (Introduction/Context/Deep Analysis…), meta Insight L2
- Nối mạch: câu cầu giữa các ##; gộp chỗ lặp "khi nào không nên"; bỏ listicle đánh số Hook/Framework
- References: chỉ giữ URL có trong CONTEXT; bỏ link rỗng / bịa
- Giữ \`![mô tả](HERO_IMAGE)\` ngay sau Subtitle (nếu đã có)
- Độ dài / tránh format theo WRITING PREFS (nếu có)

${prefs}
${NARRATIVE_FLOW_RULES}`,

    finalize: `## Nhiệm vụ FINALIZE (full legacy)
Review + Fact-Check + Publish Ready theo Operating Prompt.

${factTpl}

${publishTpl}`,
  };

  return `${instructions[step]}

=== CONTEXT (research / insight / draft đã có) ===
${context}`;
}
