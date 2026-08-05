import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolveDomainId } from "@/lib/tfes/domains";
import { getTfesOverrideCached, readTfesFileFromDisk } from "@/lib/tfes/tfes-docs";
import { resolveAndValidateDomainProfile } from "@/lib/tfes/domain-profile";

const TFES_ROOT = join(process.cwd(), "content", "ai-tfes");

function assertTfesRoot() {
  if (!existsSync(join(TFES_ROOT, "00-README.md"))) {
    throw new Error(
      "Thư mục content/ai-tfes chưa có. Chạy: node scripts/sync-tfes.mjs",
    );
  }
}

/**
 * Đọc file AI-TFES: ưu tiên override DB (Settings), fallback disk content/ai-tfes.
 * Gọi hydrateTfesOverrides() trước khi chạy pipeline / API docs.
 */
export function readTfesFile(relativePath: string): string {
  const override = getTfesOverrideCached(relativePath);
  if (override != null && override.length > 0) return override;

  assertTfesRoot();
  try {
    return readTfesFileFromDisk(relativePath);
  } catch {
    const fullPath = join(TFES_ROOT, relativePath);
    if (!existsSync(fullPath)) {
      throw new Error(`AI-TFES file không tồn tại: ${relativePath}`);
    }
    return readFileSync(fullPath, "utf-8");
  }
}

/**
 * System prompt chuẩn AI-TFES:
 * Operating-Prompt.md (full) + Domain Profile đầy đủ (tông, tier nguồn, sensitivity, seed…).
 */
export function getSystemPrompt(domain: string): string {
  const id = resolveDomainId(domain);
  const operating = readTfesFile("02-Prompts/Operating-Prompt.md");
  const domainProfile = resolveAndValidateDomainProfile(domain, readTfesFile).content;
  const engineeringBar =
    id === "engineering"
      ? `

## CHUẨN VÀNG ENGINEERING (bắt buộc khi viết / polish)
- Anti-generic: CẤM mở “Trong môi trường/Ngày nay/ngày càng phức tạp” và khuôn sprint–fintech.
- Thực tế: ≥1 mini-case vận hành (pipeline/rollback/on-call/…) có chủ ngữ đội/người; tín hiệu lấy từ Research.
- Đúng một chỗ “khi nào KHÔNG”; Recommendations luôn có điều kiện (khi/nếu/trừ khi).
- Bám nhịp gold_samples Engineering — không copy nguyên văn.`
      : "";

  return `${operating}

---

## DOMAIN PROFILE (active — bắt buộc tuân thủ)

${domainProfile}
${engineeringBar}

---

Bạn đang chạy chu trình biên tập web AI-TFES (10 bước Operating Prompt). Mỗi lần gọi chỉ làm ĐÚNG bước được yêu cầu trong user message.
Xuất tiếng Việt (trừ prompt ảnh hero tiếng Anh). Evidence-first; không bịa nguồn/số liệu.

## CẤM (bài sẽ bị coi là FAIL chất lượng)
- Lặp lại tiêu đề / cùng một câu nhiều đoạn
- Mở bài kiểu "Trong thế giới… ngày nay", "là một yếu tố quan trọng"
- Mở bài khuôn nhà máy: "Trong một sprint…", "đội backend của một công ty fintech/startup…" (lặp giữa các bài)
- Ví dụ bịa "Công ty ABC/DEF/XYZ" không có chi tiết kỹ thuật cụ thể
- References bịa (tên tác giả giả, paper không tồn tại) — chỉ dùng link/nguồn từ Research Brief
- Viết meta về "seed_topics / domain profile / Seeding Mode" như thể đó là chủ đề bài
- Đoạn Deep Analysis chỉ liệt kê chung chung không có trade-off có điều kiện
- Gắn (L2)/(L3)/L2 vào Title hoặc Subtitle (cấp insight chỉ nằm ở tab Insight)
- Nhét HERO IMAGE BRIEF vào bản nháp 12 phần (Hero chỉ ở Publish Ready)
- Lạm dụng markdown table — ưu tiên bullet/numbered list; table chỉ khi so sánh ≤3 cột số liệu thật
- Bản đăng kiểu listicle đánh số (1. Hook / 2. Khi nào nên / Decision Framework…) — phải viết liền mạch theo Article.md
- Lặp mục “khi nào không nên” nhiều lần chỉ để đệm chữ

## MỨC HAY (bắt buộc hướng tới)
- Nếu Domain Profile có mục **gold_samples** — coi đó là chuẩn giọng/nhịp/mở bài; viết gần mức đó (không copy nguyên văn)
- Hook: xoay giữa nghịch lý / failure+metric / quan sát nghề có hậu quả (xem gold_samples) — CẤM mọi bài cùng khuôn “sprint + đội + công ty fintech”
- ≥1 mini-case cụ thể (đặt sau mở luận điểm); đúng một chỗ “khi nào KHÔNG”
- Senior đọc xong phải thấy điều kiện ẩn / trade-off — không chỉ checklist best practice`;
}

/**
 * System prompt MỎNG cho bước ngắn (Gate / Decision / Planning / Review / Fact).
 * Không nhồi Operating-Prompt full → tránh gpt-oss reasoning quá lâu / timeout 240s.
 */
export function getSystemPromptLite(domain: string): string {
  const id = resolveDomainId(domain);
  const domainProfile = resolveAndValidateDomainProfile(id, readTfesFile).content;
  // Chỉ lấy phần đầu hồ sơ (audience, tông, tier) — đủ cho Decision
  const clipped = domainProfile.slice(0, 3_000).trim();

  return `Bạn là biên tập viên AI-TFES. Chỉ làm ĐÚNG nhiệm vụ trong user message — không làm thêm bước khác.
Tiếng Việt. Evidence-first; không bịa nguồn/số liệu. Trả lời ngắn, đúng format yêu cầu.

Domain: **${id}**
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
    .replace("`<engineering | soft-skills>`", resolveDomainId(input.domain))
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
  | "finalize-fact-remediate"
  | "finalize-revision-remediate"
  | "finalize-verify"
  | "finalize-b"
  | "finalize-polish"
  | "finalize-human-polish"
  | "finalize-expand"
  | "finalize-repair"
  | "finalize-hero"
  | "finalize-reader-sim"
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
- Nhịp câu: xen câu ngắn chốt sau vài câu dài; tránh mọi đoạn đều 3 câu khuôn mẫu
- CẤM giọng handbook: "Cần áp dụng các biện pháp sau" + bullet dài; viết thành đoạn có tình huống
- ≥1 tình huống cụ thể (pipeline/stage/incident hoặc failure mode có thời gian/hậu quả) — không chỉ nguyên tắc trừu tượng
- Số % / ngưỡng / năm chỉ giữ nếu có trong Research/Fact CONTEXT; không có → viết định tính ("thường", "khi retry dày", "khi overhead governance lấn") thay vì bịa 50%/15%/2025`;

/** Giọng tin tức / blog kỹ thuật — bản sạch phải đọc như bài đăng, không whitepaper */
const BLOG_NEWS_VOICE = `### Giọng BLOG / TIN TỨC kỹ thuật (bắt buộc trên bản sạch)
Viết như bài trên blog kỹ thuật hoặc mục tech news nội bộ — người đọc lướt điện thoại, không như tài liệu nội bộ / slide / paper.

Làm:
- Mở bằng **nghịch lý / failure+metric / quan sát nghề có hậu quả** (1–3 câu) rồi mới nêu luận điểm — xoay kiểu mở giữa các bài (xem gold_samples)
- Câu chủ động, gần khẩu ngữ nghề (“đội phải…”, “lúc đó…”, “vấn đề thật là…”) nhưng vẫn chính xác kỹ thuật
- Mỗi ## ≈ một “màn” trong bài báo: có xung đột nhỏ → giải thích → hệ quả
- Kết bằng hệ quả hoặc câu hỏi mở — như phóng viên chốt bài, không tóm tắt 4 gạch

Tránh / CẤM trên bản sạch:
- Giọng giáo trình: “Trong môi trường X ngày càng phức tạp, Y được nhắc đến như…”
- Khuôn nhà máy lặp bài: “Trong một sprint…”, “đội backend của một công ty fintech/startup…”
- “Khám phá các điều kiện…”, “Nhận diện rủi ro cần cân nhắc” kiểu phụ đề brochure
- “Cần áp dụng các biện pháp sau”, “Khuyến nghị thực tiễn” + bullet dài
- Đoạn toàn định nghĩa / liệt kê nguyên tắc không có người hoặc tình huống
- Thuật ngữ dày đặc không có câu dịch ý cho người đọc nhanh`;

/** Story arc — chi tiết nhịp lấy từ ARTICLE_SHAPE (mỗi bài một biến thể) */
const STORY_ARC_CLEAN = `### Story arc bản đăng
Tuân thủ block **ARTICLE_SHAPE** trong prompt (nhịp + mở/kết + discussion).
KHÔNG ép mọi bài cùng khuôn “Cảnh → Tension → Cơ chế → Mini-case → Guardrail → hỏi thảo luận”.
Vẫn bắt buộc: một luận điểm xuyên suốt · ≥1 tình huống cụ thể · điều kiện/phản biện · giọng blog kỹ thuật.`;

/** Quy tắc polish “đáng đọc” — bổ sung NARRATIVE */
const READER_POLISH_RULES = `### Polish đáng đọc (bắt buộc)
- Bỏ mọi dòng nhãn \`Subtitle\` / \`Subtitle:\` / \`Title:\` — phụ đề chỉ còn 1 dòng *in nghiêng* dưới # Title (phụ đề nghe như câu lead báo, không brochure)
- Viết lại đoạn mở nếu còn giọng giáo trình / “ngày càng phức tạp… được nhắc đến như…” / khuôn “Trong một sprint… đội … công ty fintech”
- Biến mục "Khuyến nghị thực tiễn" kiểu checklist thành 1–2 đoạn hành động gắn điều kiện, có chủ ngữ (đội / lead / bạn) — trừ khi ARTICLE_SHAPE là field-note (được phép hành động hẹp rõ ràng, vẫn không listicle Hook/Framework)
- Nếu ≥4 con số % cụ thể mà CONTEXT Research không có → bớt số, giữ luận điểm điều kiện
- Thêm/giữ tình huống cụ thể theo shape (postmortem / case / mini-case…) — không ép mọi bài cùng một kiểu case
- Sửa ký tự lỗi encoding nếu còn
- Đọc lại to: nếu nghe như tài liệu nội bộ hơn blog → viết lại đoạn đó ngắn và sống hơn
- Nếu bài giống “khuôn nhà máy” (mọi ## đều cùng nhịp với bài generic) → viết lại heading + mở cho khớp ARTICLE_SHAPE`;

function templateBlock(title: string, relativePath: string): string {
  return `### Template: ${title}\n\n${readTfesFile(relativePath)}`;
}

/**
 * User prompt từng bước — nhúng template thư viện AI-TFES.
 * @param writingPrefsBlock — block WRITING PREFS (số từ / tránh format) từ article + Settings
 * @param articleShapeBlock — block ARTICLE_SHAPE (biến thể khung bài) theo articleId
 */
export function buildPipelinePrompt(
  step: PipelineStep,
  context: string,
  writingPrefsBlock?: string,
  articleShapeBlock?: string,
): string {
  const articleTpl = templateBlock("Article.md (12 phần)", "05-Templates/Article.md");
  const factTpl = templateBlock("FactCheck.md", "05-Templates/FactCheck.md");
  const publishTpl = templateBlock("Publish.md (checklist)", "05-Templates/Publish.md");
  const reviewTpl = templateBlock("Review.md", "05-Templates/Review.md");
  const prefs = writingPrefsBlock?.trim()
    ? `\n${writingPrefsBlock.trim()}\n`
    : "";
  const shape = articleShapeBlock?.trim()
    ? `\n${articleShapeBlock.trim()}\n`
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
- **Shape gợi ý** (nếu hợp): 1 dòng khớp ARTICLE_SHAPE hoặc “giữ shape đã gán”

Không viết dài. Không lặp lại Gate tests.`,

    "insight-planning": `## Nhiệm vụ bước 6: PLANNING (gọn)
Decision đã chốt. CHỈ Planning — CẤM viết bài 12 phần / Hero.

${shape}

Xuất checklist (≤600 từ):
- Objective · Audience · 1 Core Message (insight L2/L3)
- **ARTICLE_SHAPE id** (copy đúng id đã gán) + 1 câu vì sao hợp bài này
- 3–5 Key Insights (mỗi ý + nguồn ngắn từ Research)
- Ví dụ / tình huống dự kiến (≥1, khớp shape — postmortem = sự cố; debate = 2 phe…)
- Story Flow: 3–6 gạch **theo nhịp ARTICLE_SHAPE** (không mặc định Cảnh→Tension→… nếu shape khác)
- So what / khuyến nghị: theo shape — CẤM khuôn cứng Cá nhân/Team/Tổ chức trừ khi thật sự cần
- Discussion: chỉ khi shape = required/optional và bạn chọn dùng

Không viết lại Decision / Gate.`,

    "insight-b": `## Nhiệm vụ Insight Decision+Planning (legacy gộp)
Cổng ≥ L2. Chốt Decision + Planning. Không viết 12 phần / Hero.
${shape}`,

    write: `## Nhiệm vụ bước 7: WRITING (AI-TFES)
Insight ≥ L2 + Planning xong. Viết đủ 12 phần theo BAR VIẾT + Article.md (bản làm việc nội bộ).
Có "khi nào KHÔNG". Độ dài theo WRITING PREFS. Nháp chuẩn bị bản sạch theo ARTICLE_SHAPE.

${prefs}
${shape}
${FORMAT_RULES_WRITE}

${NARRATIVE_FLOW_RULES}

${BLOG_NEWS_VOICE}

${articleTpl}`,

    "write-a": `## Nhiệm vụ bước 7 WRITING — Phase A (nửa đầu)
Insight ≥ L2. Viết NỬA ĐẦU theo Article.md + BAR VIẾT (mức HAY) — bản làm việc nội bộ:
Title, Subtitle, Metadata, Executive Summary, Introduction, Context, Problem Statement, Deep Analysis.

Yêu cầu độ sâu:
- Hook / mở khớp ARTICLE_SHAPE (postmortem = sự cố; question-led = câu hỏi; narrative-case = nghịch lý/áp lực cụ thể…) — CẤM mở chung chung và CẤM khuôn “sprint + đội + công ty fintech”
- Đặt insight L2/L3 sớm (1–2 câu rõ điều kiện) rồi mới Context / Problem
- Deep Analysis ≥ 350–500 từ: trade-off có điều kiện; trọng tâm theo draftHint của shape
- Không lặp câu; thuật ngữ / cơ chế thật từ Research Brief
- Heading đúng tên Article.md (## Introduction, ## Context…) — CẤM "1. Hook", "2. Executive Summary"
- Giọng nửa đầu cũng phải sống (cảnh + người/đội) — đừng viết như abstract paper

Dừng sau Deep Analysis. KHÔNG Examples / Recommendations / Takeaways / Discussion / References / HERO.

${prefs}
${shape}
${FORMAT_RULES_WRITE}

${NARRATIVE_FLOW_RULES}

${BLOG_NEWS_VOICE}

${articleTpl}`,

    "write-b": `## Nhiệm vụ bước 7 WRITING — Phase B (nửa sau)
Tiếp tục NỬA SAU theo Article.md + Planning trong CONTEXT — nối tiếp nửa đầu (đọc part A trong CONTEXT):
- Real-world Examples: khớp ARTICLE_SHAPE (≥1 case đủ xương; debate có thể 2 góc; CẤM "Công ty ABC")
- Practical Recommendations: theo shape — CẤM mặc định 3 khối Cá nhân/Team/Tổ chức; vẫn phải có “khi nào KHÔNG” (một chỗ)
- Key Takeaways (2–3) · Discussion chỉ nếu shape required/optional · References (chỉ Research Brief, URL thật)
- Câu chuyển Deep Analysis → Examples → Recommendations liền mạch theo nhịp shape

KHÔNG viết lại nửa đầu. KHÔNG HERO IMAGE BRIEF.

${prefs}
${shape}
${FORMAT_RULES_WRITE}

${NARRATIVE_FLOW_RULES}

${BLOG_NEWS_VOICE}

${articleTpl}`,

    "finalize-review": `## Nhiệm vụ bước 8: EDITORIAL REVIEW (AI-TFES v1.6)
Tự review bản nháp theo pha EDITORIAL_REVIEW — CHƯA Fact-Check Ledger / Bản sạch / Hero. Evidence bắt buộc ghi PROVISIONAL.

Phải đạt hết (ghi Pass/Fail từng mục):
- Cấu trúc đầy đủ (12 phần Article.md)
- Không lỗi logic
- Đủ bằng chứng
- Một insight trung tâm ≥L2 + ≥1 trade-off + ≥1 góc phản biện + ≥1 bài học
- Giá trị thực tiễn (biết nên / không nên làm gì)
- Có câu hỏi thảo luận — chỉ Fail nếu shape bắt buộc discussion mà thiếu
- Không quảng bá · Không sao chép
- Tránh tuyệt đối hóa ("luôn luôn / chắc chắn / tốt nhất…") trừ khi có bằng chứng
- **Nhịp đọc:** Fail nếu listicle đánh số (Hook/Khi nào nên/Framework…), mục “không nên” lặp, hoặc các phần không nối với nhau
- **Đa dạng format:** Pass nếu nháp chuẩn bị được bản sạch theo ARTICLE_SHAPE

## Chấm điểm provisional (bắt buộc — runtime đọc máy)
- Insight Depth tối thiểu phản ánh Gate L2: thường ≥20/30 (bar cuối 9b là ≥22).
- Chỉ dùng EDITORIAL_REVIEWED khi tổng provisional ≥${85} và insight ≥${20} và G1–G8 PASSED và 0 gate Fail trên checklist.
- Còn Fail G* hoặc điểm dưới ngưỡng → MINOR/MAJOR/REWRITE — không tự khai EDITORIAL_REVIEWED.

Xuất theo template Review.md với review_phase: EDITORIAL_REVIEW.
Kết thúc bằng đúng 4 dòng máy đọc (plain text, mỗi trường một dòng):
PROVISIONAL_TOTAL_SCORE: <0-100>
PROVISIONAL_INSIGHT_SCORE: <0-30>
GATES_G1_G8: <PASSED|FAILED>
EDITORIAL_DECISION: <EDITORIAL_REVIEWED|MINOR_REVISION_REQUIRED|MAJOR_REVISION_REQUIRED|REWRITE_REQUIRED>

Nếu Rewrite hoặc thiếu G1–G8 nghiêm trọng → nêu rõ phần cần sửa (vẫn xuất đủ checklist + 4 dòng máy).

${shape}
${reviewTpl}`,

    "finalize-a": `## Nhiệm vụ bước 9: FACT CHECK (AI-TFES)
Chỉ xuất **"4) Fact-Check Ledger"** theo FactCheck.md:
- Mỗi khẳng định Fact/Practice → nguồn đã đọc (URL từ Research) → verdict
- Số liệu & trích dẫn khớp nguồn
- Gắn nhãn Opinion / Prediction rõ ràng
- Số % / survey không có trong Research Brief → FAIL hoặc ghi Opinion
- Nếu CONTEXT có **Editorial Review** — ưu tiên kiểm tra đúng các Fail / Minor–Major Revision đã nêu (số liệu, tuyệt đối hóa, thiếu bằng chứng)
- **Không** ghi VERIFICATION_STATUS: PASSED nếu còn Unsupported / Contradicted / Failed / Unverifiable (không phải Opinion/Prediction)
- Sau ledger, bắt buộc thêm đúng một dòng máy đọc, không bold: \`VERIFICATION_STATUS: PASSED\` (hoặc một enum MINOR_ISSUE / MAJOR_ISSUE / FAILED). Không chép nguyên danh sách enum.

Không viết Bản sạch / HERO / Knowledge Record (Knowledge Record ở bước Publish Ready).

${factTpl}`,

    "finalize-fact-remediate": `## Nhiệm vụ phục hồi FACT_CHECK_FAILED (AI-TFES v1.6)
Sửa **đúng bản nháp Article.md** trong CONTEXT theo Fact-Check Ledger. Đây là revision mới của
ARTICLE_DRAFT, chưa phải bản sạch và chưa phải một lần Fact Check mới.

Quy tắc bắt buộc:
- Supported: giữ nguyên nếu wording đã khớp evidence.
- Partially Supported: thêm điều kiện/ngữ cảnh hoặc hạ mức khẳng định đúng theo cột Xử lý.
- Unsupported: bỏ claim hoặc viết lại thành nhận định có giới hạn; không giữ số liệu không có nguồn.
- Contradicted: sửa/bỏ theo evidence; tuyệt đối không lờ verdict.
- Unverifiable: gắn rõ Opinion/Prediction nếu hợp lý, nếu không thì bỏ.
- Thực hiện mọi action bắt buộc trong ledger; giữ insight trung tâm, cấu trúc 12 phần và các phần
  không liên quan ổn định. Không thêm nguồn/số liệu mới ngoài Research Brief.

Chỉ xuất **toàn bộ bản nháp Markdown đã sửa**, bắt đầu bằng \`# Title\`. Không giải thích thay đổi,
không output Fact-Check Ledger, Knowledge Record, HERO IMAGE BRIEF, bản sạch hoặc STATUS.

${articleTpl}`,

    "finalize-revision-remediate": `## Nhiệm vụ REVISION REMEDIATION (AI-TFES v1.6)
Sửa toàn bộ bản nháp Article.md theo **Required Revisions**, Quality Gates và Fact-Check Ledger
trong CONTEXT. Mức MINOR/MAJOR/REWRITE quyết định độ sâu sửa, nhưng không được bỏ qua lỗi.

- MINOR: sửa chính xác wording, flow, điều kiện và claim cục bộ.
- MAJOR: sửa các phần liên quan, logic/evidence và recommendations; giữ insight nếu vẫn ≥L2.
- REWRITE: viết lại cấu trúc/lập luận từ Planning + Research Brief, không cứu câu chữ cũ bằng đổi từ.
- Unsupported/Contradicted/Unverifiable: xử lý theo FactCheck.md; không thêm số/nguồn mới.
- Giữ đủ nháp Article.md, insight ≥L2, phản biện và “khi nào không”.

Chỉ xuất toàn bộ bản nháp Markdown revision mới, bắt đầu bằng \`# Title\`. Không giải thích,
không output Review, Fact Check, Knowledge Record, bản sạch, Hero hoặc STATUS.

${articleTpl}`,

    "finalize-verify": `## Nhiệm vụ bước 9b: FINAL VERIFICATION GATE (AI-TFES v1.6)
Đọc đúng Editorial Review, Fact-Check Ledger và bản nháp trong CONTEXT. Khóa điểm Evidence; không suy đoán claim đã được sửa nếu CONTEXT không chứng minh.

Điều kiện duy nhất để đạt (FINAL_REVIEWED):
- Tổng ≥90/100; Insight Depth ≥22/30
- G1–G8 đều PASSED
- Verification Status của Fact Check đúng bằng PASSED
- Không còn Unsupported/Contradicted/Unverifiable blocking claim
- Không còn required action mở

## Chấm điểm — bắt buộc trung thực
- Điền rubric thật (Insight/Evidence/Craft/…) rồi cộng TOTAL. CẤM xuất FINAL_TOTAL_SCORE: 0 và FINAL_INSIGHT_SCORE: 0 trừ khi CONTEXT không có bản nháp.
- Nếu Fact Check trong CONTEXT là PASSED và bài đã có draft: Insight Depth tối thiểu phản ánh Gate L2 đã qua — bar ≥22/30; không được ghi 0 hoặc đậu ở 18–21.
- Khi Fact Check PASSED + G1–G8 đạt + 0 open action + insight ≥22: **ưu tiên FINAL_REVIEWED với tổng ≥90**. Chỉ dùng MINOR (85–89) khi còn lỗi nội dung rõ (logic/bằng chứng/nhịp đọc) — không hạ điểm vì lỗi chữ/câu chữ nhỏ / “có thể polish thêm”.
- Runtime có thể chấp nhận near-miss 87–89 khi đủ gate; vẫn ưu tiên chấm ≥90 khi bài đạt bar. CẤM cố ý đậu 85–86 “an toàn”.
- FINAL_DECISION phải khớp band điểm (không dùng chữ PUBLISH_READY):
  - FINAL_REVIEWED — tổng ≥90 và insight ≥22 và G1–G8 PASSED
  - MINOR_REVISION_REQUIRED — tổng 85–89 (chỉ khi còn lỗi nội dung rõ cần sửa)
  - MAJOR_REVISION_REQUIRED — tổng 75–84
  - REWRITE_REQUIRED — tổng <75 hoặc insight <22
- Nếu kết luận narrative là MAJOR thì TOTAL phải nằm 75–84, không ghi 0.

Xuất Review.md pha FINAL_VERIFICATION và BẮT BUỘC kết thúc bằng đúng 5 dòng máy đọc, **mỗi trường một dòng riêng**:
FINAL_TOTAL_SCORE: <0-100>
FINAL_INSIGHT_SCORE: <0-30>
GATES_G1_G8: <PASSED|FAILED>
OPEN_REQUIRED_ACTIONS: <số nguyên>
FINAL_DECISION: <FINAL_REVIEWED|MINOR_REVISION_REQUIRED|MAJOR_REVISION_REQUIRED|REWRITE_REQUIRED>

Năm dòng trên phải là plain text: không bullet, không bold, không backtick, không đặt trong code fence, không gộp một dòng.

${reviewTpl}`,

    "finalize-b": `## Nhiệm vụ bước 10: PUBLISH READY — BẢN ĐỌC LIỀN (đăng tin)
Viết LẠI từ nháp 12 phần thành bài hoàn chỉnh cho mọi người đọc. Không copy skeleton Article.md / listicle.
**Pipeline bổ trợ:** nếu CONTEXT có Editorial Review và/hoặc Fact-Check Ledger — bản sạch PHẢI xử lý các điểm Fail / Minor–Major (logic, bằng chứng, nhịp đọc, tuyệt đối hóa, số liệu FAIL). Không bỏ qua checklist rồi copy nháp.

Xuất theo thứ tự:
1. **"5) Knowledge Record"** — Title, Category, Domain, Keywords, Core Message, Key Insights, References, Evergreen, Editorial Score, Date (metadata nội bộ — KHÔNG nằm trong bản sạch)
2. **"6) === BẢN SẠCH ĐỂ ĐĂNG ==="** rồi bài đăng bên dưới:
${prefs}
${shape}
### BẢN SẠCH = BÀI ĐỌC LIỀN (theo ARTICLE_SHAPE — mỗi bài một khung)
- CẤM heading biên tập: Introduction, Context, Problem Statement, Deep Analysis, Real-world Examples, Practical Recommendations, Executive Summary, Key Takeaways, Metadata
- Cấu trúc tối thiểu: \`# Title\` → một dòng *phụ đề in nghiêng* (KHÔNG viết chữ Subtitle) → \`![mô tả ngắn](HERO_IMAGE)\` → thân theo nhịp shape → kết theo shape → References
- \`##\` chỉ tiêu đề ĐỌC ĐƯỢC — đa dạng wording; đừng lặp cụm “Ba rủi ro…” / “Khi nào nên dừng” ở mọi bài
- Một luận điểm xuyên suốt; không meta “Insight L2”; không Knowledge Record trong body
- Title tiếng Việt, KHÔNG (L2); CẤM dòng "Subtitle" / "alt" trần
- Số % chỉ khi có trong Research/Fact; References chỉ URL từ Research; độ dài theo WRITING PREFS
- Discussion / khuyến nghị 3 cấp: chỉ khi shape yêu cầu — tránh “công thức nhà máy”
3. Khối riêng **HERO IMAGE BRIEF** (sau bản sạch) — tạm thời, sẽ được viết lại từ bản polish:
   - Concept · **Prompt (English):** "...." · Caption + Alt
   - Prompt phải mirror **luận điểm / metaphor của bài** (không generic “servers / circuit board / glowing code” nếu bài không nói hạ tầng đó)
4. Dòng cuối: \`STATUS: Publish Ready — chờ người duyệt\`

Bắt buộc marker: === BẢN SẠCH ĐỂ ĐĂNG ===
CẤM dòng gạch ngang markdown \`---\` / \`***\` giữa các đoạn trong bản sạch (dùng ## hoặc đoạn nối).
Bản sạch = bài blog/tin tức kỹ thuật — Story arc theo ARTICLE_SHAPE + giọng blog bên dưới.

${NARRATIVE_FLOW_RULES}

${STORY_ARC_CLEAN}

${BLOG_NEWS_VOICE}

${publishTpl}`,

    "finalize-polish": `## Nhiệm vụ bước 10b: POLISH BẢN SẠCH (đăng tin)
Biên tập LẠI bản sạch đã có thành bản sẵn sàng đăng — KHÔNG viết lại luận điểm, KHÔNG bịa số liệu / nguồn mới.
Ưu tiên: đọc như blog/tin tức kỹ thuật, không khô như tài liệu nội bộ; **giữ / siết theo ARTICLE_SHAPE** (đừng kéo về khuôn generic).
**Pipeline bổ trợ:** áp dụng nốt góp ý còn sót từ Editorial Review + Fact-Check (+ Reader Sim nếu có) trong CONTEXT.

Chỉ xuất bài markdown hoàn chỉnh (bắt đầu bằng \`# Title\`). Không Knowledge Record, không HERO IMAGE BRIEF, không STATUS.

Sửa bắt buộc:
- Gỡ sót: dòng "alt" trần, placeholder HERO_IMAGE lẻ, heading biên tập (Introduction/Context/Deep Analysis…), meta Insight L2
- **Xóa nhãn** \`Subtitle\` / \`Subtitle:\` / \`Title:\` — chỉ giữ nội dung phụ đề (in nghiêng) và \`# Title\`
- **Xóa mọi dòng chỉ có \`---\` / \`***\` / \`___\`** giữa nội dung (không dùng thematic break)
- Nối mạch: câu cầu giữa các ##; gộp chỗ lặp "khi nào không nên"; bỏ listicle đánh số Hook/Framework
- References: chỉ giữ URL có trong CONTEXT; bỏ link rỗng / bịa
- Giữ \`![mô tả](HERO_IMAGE)\` ngay sau phụ đề in nghiêng (nếu đã có)
- Độ dài / tránh format theo WRITING PREFS (nếu có)
- Số liệu Fact FAIL / Opinion trong Ledger — chỉnh wording cho khớp (không bịa nguồn mới)
- Nếu CONTEXT có phản hồi Reader Simulation — ưu tiên sửa đúng các điểm đó (hook / lặp / ví dụ / insight)
- Nếu CONTEXT còn Fail từ Review — sửa đúng chỗ đó trên bản đăng
- Heading / mở / kết: nếu đang “giống mọi bài khác” → chỉnh cho khớp shape

${prefs}
${shape}
${NARRATIVE_FLOW_RULES}

${BLOG_NEWS_VOICE}

${STORY_ARC_CLEAN}

${READER_POLISH_RULES}`,

    "finalize-human-polish": `## Nhiệm vụ: POLISH THEO CHỈNH SỬA CỦA NGƯỜI (Human Edit Loop)
Bản markdown dưới đây đã được BIÊN TẬP VIÊN sửa tay. Đây là nguồn sự thật.

Ưu tiên tuyệt đối:
1. Giữ nguyên mọi thay đổi ý / câu / cấu trúc người đã viết
2. Chỉ làm mượt: chính tả, câu cụt, nối mạch nhẹ, bỏ sót nhãn biên tập (Subtitle, ---, Introduction…)
3. Nếu CONTEXT có **Ghi chú biên tập** — áp dụng đúng các điểm đó
4. CẤM viết lại luận điểm, CẤM đổi hook người đã chốt, CẤM bịa số liệu/nguồn
5. CẤM kéo về khuôn “sprint + đội + công ty fintech”

Chỉ xuất bài markdown hoàn chỉnh (bắt đầu bằng \`# Title\`). Không Knowledge / HERO / STATUS.

${prefs}
${shape}
${BLOG_NEWS_VOICE}
${READER_POLISH_RULES}`,

    "finalize-expand": `## Nhiệm vụ: MỞ RỘNG BẢN SẠCH CHO ĐỦ SỐ TỪ
Bài trong CONTEXT đang THIẾU độ dài so với WRITING PREFS.
Đếm từ = tách khoảng trắng (tiếng Việt), KHÔNG đếm ký tự.

Xuất lại TOÀN BỘ bài markdown hoàn chỉnh (\`# Title\` → phụ đề nghiêng → HERO → thân → kết → References nếu có).
- GIỮ luận điểm, title, **ARTICLE_SHAPE**; KHÔNG bịa số liệu / URL mới
- Viết THÊM vào thân theo nhịp shape (case / tranh luận / tín hiệu hiện trường…) — để đạt gần target từ trong PREFS
- CẤM rút gọn; CẤM synopsis; CẤM Knowledge Record / HERO IMAGE BRIEF / STATUS
- Giọng blog/tin tức kỹ thuật; không handbook

${prefs}
${shape}
${NARRATIVE_FLOW_RULES}
${BLOG_NEWS_VOICE}
${STORY_ARC_CLEAN}`,

    "finalize-repair": `## Nhiệm vụ: SỬA BẢN SẠCH THEO LỖI QUALITY GATE
Bài trong CONTEXT đã gần xong nhưng MÁY CHẤM FAIL. Sửa ĐÚNG lỗi được nêu — xuất lại TOÀN BỘ bài markdown.

- GIỮ luận điểm, title, mạch, ARTICLE_SHAPE; KHÔNG bịa số liệu / URL mới
- Làm đúng các mục “ƯU TIÊN” trong CONTEXT (nếu có) trước khi chỉnh chỗ khác
- Đoạn mở khô → viết lại 1–3 câu đầu (cảnh / nghịch lý); CẤM “Trong môi trường/bối cảnh/những năm”, “Không thể phủ nhận”, “Ngày nay,”
- Handbook/brochure → giọng blog/tin tức có chủ ngữ người/đội
- Heading biên tập / listicle → heading tin tức, viết liền mạch
- Table / Mermaid / --- / Subtitle / alt / encoding → xóa hoặc đổi đúng chỉ thị
- Quá nhiều % → ≤5 số; thiếu mini-case / phản biện → bổ sung
- Quá ngắn → viết thêm thân; quá dài → rút gọn lặp
- CẤM Knowledge Record / HERO IMAGE BRIEF / STATUS
- Độ dài theo WRITING PREFS — không rút synopsis

${prefs}
${shape}
${NARRATIVE_FLOW_RULES}
${BLOG_NEWS_VOICE}
${STORY_ARC_CLEAN}`,

    "finalize-hero": `## Nhiệm vụ: HERO IMAGE BRIEF từ bản sạch đã chốt
Đọc Title + đoạn mở + luận điểm + ## trong CONTEXT. Xuất ĐÚNG khối:

\`\`\`text
HERO IMAGE BRIEF
Concept: <1 câu tiếng Việt — metaphor ĐÚNG bài này, không generic>
Prompt (English): "<concrete visual metaphor of THIS thesis; cinematic soft light; editorial magazine; no text/numbers/charts/logos/real people/watermark>"
Caption: <1 câu tiếng Việt>
Alt: <mô tả ngắn tiếng Việt cho a11y — nêu đúng ý bài>
\`\`\`

Bắt buộc:
- Prompt English mirror luận điểm thật (vd. tốc độ vs kiến trúc → unfinished scaffolding vs stopwatch / fork in the road — KHÔNG CPU/server/circuit board nếu bài không về hạ tầng)
- Đọc cả ARTICLE MAP đến ENDING / TAKEAWAY; Hero phải thể hiện mâu thuẫn hoặc kết luận trung tâm, không chỉ danh từ trong Title
- Scene phải có chủ thể cụ thể + hành động/tương quan + bối cảnh + bố cục; mỗi vật thể phải giải thích được bằng một ý trong bài
- CẤM sáo: "abstract futuristic technology background", "circuit boards", "glowing code on screen", "neon cyber city"
- Alt phải mô tả metaphor của BÀI, không "minh họa công nghệ" chung
- Không viết lại bài; chỉ xuất HERO IMAGE BRIEF`,

    "finalize-reader-sim": `## Nhiệm vụ bước 10c: READER SIMULATION (đáng đọc)
Mô phỏng 3 độc giả đọc bản sạch trong CONTEXT. Domain roles đã chỉ định bên dưới — KHÔNG đổi vai.

Với MỖI vai (≤4 dòng/vai):
- **Giữ / Bỏ / Lướt:** một trong ba
- **Khựng ở đâu:** đoạn/ý cụ thể (hoặc "không")
- **Còn hỏi gì:** 1 câu hoặc "ổn"

Rồi chấm nhanh (Pass/Fail từng mục):
- Hook kéo trong ~15 giây? (nghịch lý / failure cụ thể — không giáo trình, không “sprint + đội fintech”)
- Đọc như blog/tin tức kỹ thuật hay như tài liệu nội bộ khô?
- Có ≥1 ví dụ/mini-case đủ cụ thể để hình dung?
- Có chỗ lặp / reset luận điểm?
- Senior/Lead có thấy insight không hiển nhiên?
- Bài có bị “khuôn công nghiệp” (giống mọi bài khác) không — nếu có, ghi 1 gạch chỉnh mở/heading theo shape

Cuối cùng đúng một dòng:
\`KẾT LUẬN: ĐẠT\` — chỉ khi ≥2/3 vai Không bỏ bài VÀ không Fail nặng hook/khô/lặp
hoặc
\`KẾT LUẬN: CHƯA ĐẠT\` + 3 gạch đầu dòng sửa ngắn (cụ thể, làm được ở polish — ưu tiên sống hóa đoạn mở / bỏ handbook)

Xuất ngắn (≤450 từ). Không viết lại bài. Không Knowledge Record / Hero.`,

    finalize: `## Nhiệm vụ FINALIZE (full legacy)
Review + Fact-Check + Publish Ready theo Operating Prompt.
${shape}

${factTpl}

${publishTpl}`,
  };

  return `${instructions[step]}

=== CONTEXT (research / insight / draft đã có) ===
${context}`;
}
