/**
 * Biến thể khung bài đăng — tránh mọi bài cùng một “công thức công nghiệp”
 * (cảnh mở → tension → cơ chế → case → guardrail → hỏi thảo luận).
 * Chọn ổn định theo articleId để Planning / Write / Publish cùng một shape.
 */

export type ArticleShapeId =
  | "paradox-deepdive"
  | "failure-postmortem"
  | "debate-two-sides"
  | "narrative-case"
  | "question-led"
  | "field-note"
  | "adr"
  | "internal-brief"
  | "thread-qa";

export type ArticleShape = {
  id: ArticleShapeId;
  labelVi: string;
  /** Khi nào shape này hợp */
  fit: string;
  /** Nhịp bản sạch — không dùng làm ## */
  beats: string[];
  /** Gợi ý ## đọc được (ví dụ — đổi theo nội dung) */
  headingHints: string[];
  opening: string;
  ending: string;
  recommendations: string;
  discussion: "required" | "optional" | "skip";
  /** Gợi ý ánh xạ sang Article.md nội bộ (không copy heading biên tập ra bản sạch) */
  draftHint: string;
};

export const ARTICLE_SHAPES: Record<ArticleShapeId, ArticleShape> = {
  "paradox-deepdive": {
    id: "paradox-deepdive",
    labelVi: "Nghịch lý → đào sâu",
    fit: "Insight dạng “X đúng, NHƯNG chỉ khi Y” / trade-off bị giấu",
    beats: [
      "Cảnh hoặc nghịch lý mở",
      "Tension / điều kiện ẩn",
      "Cơ chế 1–2 ý",
      "Mini-case",
      "Guardrail (khi nào KHÔNG — một chỗ)",
      "Hệ quả / câu hỏi mở",
    ],
    headingHints: [
      "Điều mọi người vẫn tin",
      "Chỗ điều kiện bị giấu",
      "Cơ chế thật trên production",
      "Khi nào nên dừng",
    ],
    opening: "Mở bằng nghịch lý hoặc niềm tin phổ biến rồi lật điều kiện.",
    ending: "Kết bằng hệ quả hoặc câu hỏi — không tóm tắt lại bài.",
    recommendations: "Hành động gắn điều kiện; có thể gộp cá nhân/đội nếu hợp, KHÔNG bắt buộc 3 cấp khuôn.",
    discussion: "optional",
    draftHint: "Deep Analysis nhấn trade-off có điều kiện; Examples minh họa đúng điều kiện Y.",
  },
  "failure-postmortem": {
    id: "failure-postmortem",
    labelVi: "Postmortem sự cố",
    fit: "Bài xoay quanh failure mode / incident / lần làm sai có hậu quả",
    beats: [
      "Sự cố hoặc triệu chứng (thời gian / hệ quả)",
      "Timeline ngắn — đã làm gì trước khi hiểu ra",
      "Root cause thật (không đổ lỗi chung chung)",
      "Giả thuyết sai đã tin",
      "Sửa + khi nào cách sửa không áp dụng",
      "Bài học hẹp (1–2 câu)",
    ],
    headingHints: [
      "Đêm đó / lần đó chuyện gì xảy ra",
      "Dấu hiệu bị bỏ qua",
      "Nguyên nhân không phải thứ mọi người nghĩ",
      "Cách chữa — và giới hạn của nó",
    ],
    opening: "Mở bằng sự cố cụ thể (stage, retry, timeout, deploy…) — không mở bằng định nghĩa.",
    ending: "Kết bằng bài học hẹp hoặc câu hỏi “lần sau nhìn dấu hiệu nào trước”.",
    recommendations: "Gắn với vai trò người xử lý sự cố / on-call — không checklist 3 tầng tổ chức trừ khi thật sự cần.",
    discussion: "optional",
    draftHint: "Introduction = cảnh sự cố; Deep Analysis = root cause + giả thuyết sai; Examples = 1 case chính đủ xương.",
  },
  "debate-two-sides": {
    id: "debate-two-sides",
    labelVi: "Hai phe / hai cách",
    fit: "Hai hướng thiết kế hoặc hai trường phái đều có lý — cần chốt có điều kiện",
    beats: [
      "Đặt cuộc tranh luận (phe A vs phe B) bằng tình huống",
      "Phe A: ràng buộc / ưu thế thật",
      "Phe B: ràng buộc / ưu thế thật",
      "Bảng so sánh bằng đoạn văn (không markdown table nếu prefs cấm)",
      "Chốt: chọn A/B/hybrid chỉ khi điều kiện Z",
      "Cảnh báo chọn theo mốt",
    ],
    headingHints: [
      "Hai cách đội vẫn cãi nhau",
      "Phe giữ hệ thống đơn giản",
      "Phe chấp nhận độ phức tạp",
      "Chốt theo ràng buộc nào",
    ],
    opening: "Mở bằng cuộc tranh luận trong standup / RFC / PR review — có tên ràng buộc.",
    ending: "Kết bằng điều kiện chọn — không “tùy context” chung chung.",
    recommendations: "Một khung quyết định ngắn (3–5 câu), không listicle Decision Framework đánh số.",
    discussion: "optional",
    draftHint: "Problem = cuộc tranh luận; Deep Analysis chia hai góc; Recommendations = điều kiện chọn.",
  },
  "narrative-case": {
    id: "narrative-case",
    labelVi: "Case dài xuyên suốt",
    fit: "Một câu chuyện kỹ thuật đủ chi tiết; nguyên tắc nhét giữa/cuối case",
    beats: [
      "Nhân vật / đội + mục tiêu",
      "Áp lực (deadline, SLO, compliance…)",
      "Quyết định sai hoặc nửa đúng",
      "Hậu quả kỹ thuật",
      "Chỗ ngoặt hiểu ra",
      "Nguyên tắc rút ra (ngắn) + khi không áp dụng",
    ],
    headingHints: [
      "Đội đang chạy theo mục tiêu gì",
      "Quyết định nghe hợp lý lúc đó",
      "Hậu quả lộ ra chỗ nào",
      "Điều rút ra — hẹp thôi",
    ],
    opening: "Mở như tường thuật: ai, hệ gì, áp lực gì — không abstract.",
    ending: "Kết bằng nguyên tắc hẹp từ case — tránh “5 takeaway”.",
    recommendations: "Lồng trong đoạn cuối case; không tách mục “Khuyến nghị thực tiễn” dài.",
    discussion: "skip",
    draftHint: "Examples là xương sống; Deep Analysis xen giữa case; Recommendations ngắn gắn case.",
  },
  "question-led": {
    id: "question-led",
    labelVi: "Câu hỏi dẫn dắt",
    fit: "Góc “mọi người hỏi sai” / phá 2–3 giả thuyết phổ biến",
    beats: [
      "Câu hỏi khó / câu hỏi sai phổ biến",
      "Giả thuyết 1 — vì sao hấp dẫn nhưng lệch",
      "Giả thuyết 2 — lỗ hổng",
      "Đáp án có điều kiện (insight L2)",
      "Hệ quả nếu vẫn hỏi sai",
      "Câu hỏi đúng hơn để mang về đội",
    ],
    headingHints: [
      "Câu hỏi đội hay đặt",
      "Câu trả lời nghe xuôi nhưng lệch",
      "Câu hỏi đúng hơn",
      "Điều kiện trước khi áp dụng",
    ],
    opening: "Mở bằng câu hỏi (hoặc câu trả lời sai phổ biến) — độc giả muốn biết đáp án.",
    ending: "Kết bằng câu hỏi đúng hơn cho team — thay vì tóm tắt.",
    recommendations: "Đưa thành “trước khi làm X, trả lời được Y không?” — không 3 cấp cứng.",
    discussion: "required",
    draftHint: "Problem Statement = câu hỏi; Deep Analysis lần lượt phá giả thuyết; Discussion quan trọng.",
  },
  "field-note": {
    id: "field-note",
    labelVi: "Ghi chú hiện trường (hẹp)",
    fit: "Một quyết định hẹp, thực dụng — ít triết lý, nhiều tín hiệu nhận biết",
    beats: [
      "Quyết định hẹp cần chốt tuần này",
      "Tín hiệu nhận biết (khi nào bài này đúng chỗ)",
      "Làm gì trước (2–4 bước gắn tình huống, không listicle marketing)",
      "Anti-pattern thường gặp",
      "Khi nào ghi chú này không đủ / phải dừng",
      "Một câu chốt mang đi được",
    ],
    headingHints: [
      "Việc cần chốt tuần này",
      "Dấu hiệu bạn đang đúng chỗ",
      "Việc làm được ngay — có điều kiện",
      "Bẫy hay gặp",
    ],
    opening: "Mở thẳng vào quyết định hẹp + vì sao đáng 8 phút đọc.",
    ending: "Một câu chốt mang đi được — không hỏi thảo luận dài trừ khi thật sự cần.",
    recommendations: "Trục chính của bài = hành động có điều kiện; viết đoạn, không “1. Hook 2. Framework”.",
    discussion: "skip",
    draftHint: "Recommendations dày hơn Deep Analysis; Examples = anti-pattern + tín hiệu nhận biết.",
  },
  adr: {
    id: "adr",
    labelVi: "ADR — quyết định kiến trúc",
    fit: "Cần ghi nhận quyết định + hệ quả để đội sau không quên",
    beats: [
      "Context / lực đẩy phải quyết",
      "Options đã xét (ngắn)",
      "Decision rõ ràng",
      "Consequences (tốt / xấu / nợ)",
      "Khi nào revisit / đảo quyết định",
      "Liên hệ hệ thống / team affected",
    ],
    headingHints: [
      "Vì sao phải quyết tuần này",
      "Các phương án đã loại",
      "Quyết định",
      "Hệ quả và nợ kỹ thuật",
      "Khi nào mở lại ADR",
    ],
    opening: "Mở bằng áp lực quyết định (constraint), không định nghĩa ADR là gì.",
    ending: "Kết bằng điều kiện revisit — một câu.",
    recommendations: "Gắn owner + tín hiệu revisit; không checklist tổ chức 3 tầng.",
    discussion: "skip",
    draftHint: "Problem = context; Deep Analysis = options; Recommendations = decision + consequences.",
  },
  "internal-brief": {
    id: "internal-brief",
    labelVi: "Brief nội bộ (lead)",
    fit: "Cần 1 trang để lead quyết nhanh",
    beats: [
      "Đề xuất / hỏi quyết định (1–2 câu)",
      "Vì sao bây giờ (áp lực)",
      "Rủi ro / điều kiện (ngắn)",
      "Phương án đề xuất + phương án loại",
      "Những gì cần từ lead (approve / resource / stop)",
      "Một dòng chốt",
    ],
    headingHints: [
      "Cần quyết gì",
      "Áp lực",
      "Rủi ro chính",
      "Đề xuất",
    ],
    opening: "Mở thẳng “Cần quyết: …” — không hook văn.",
    ending: "Một dòng: quyết / hoãn / cần thêm gì.",
    recommendations: "Toàn bài = CTA quyết định; cực ngắn.",
    discussion: "skip",
    draftHint: "Executive tone; Recommendations là xương; Deep Analysis tối giản.",
  },
  "thread-qa": {
    id: "thread-qa",
    labelVi: "Thread / Q&A",
    fit: "Phá 3–5 câu hỏi sai hoặc dẫn dắt theo nhịp hỏi–đáp",
    beats: [
      "Câu hỏi mở / câu hỏi sai phổ biến",
      "Đáp 1 + điều kiện",
      "Câu hỏi tiếp (xoay góc)",
      "Đáp 2 + trade-off",
      "Câu hỏi đúng hơn mang về đội",
      "Chốt hẹp",
    ],
    headingHints: [
      "Người ta hay hỏi",
      "Đáp có điều kiện",
      "Góc bị bỏ quên",
      "Câu hỏi mang về standup",
    ],
    opening: "Mở bằng câu hỏi — độc giả muốn đáp án.",
    ending: "Kết bằng câu hỏi đúng hơn cho team.",
    recommendations: "Lồng trong đáp; không mục khuyến nghị dài.",
    discussion: "required",
    draftHint: "Giống question-led nhưng nhịp ## = hỏi/đáp rõ hơn.",
  },
};

const SHAPE_ORDER: ArticleShapeId[] = [
  "paradox-deepdive",
  "failure-postmortem",
  "debate-two-sides",
  "narrative-case",
  "question-led",
  "field-note",
];

/** Hash ổn định → index shape (chỉ các shape blog xoay vòng). */
export function pickArticleShapeId(seed: string): ArticleShapeId {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = Math.abs(h) % SHAPE_ORDER.length;
  return SHAPE_ORDER[idx]!;
}

export function getArticleShape(seed: string): ArticleShape {
  return ARTICLE_SHAPES[pickArticleShapeId(seed)];
}

export function getArticleShapeById(id: ArticleShapeId): ArticleShape {
  return ARTICLE_SHAPES[id] ?? ARTICLE_SHAPES["paradox-deepdive"];
}

/** Block nhúng prompt từ một shape đã chọn */
export function formatShapePromptBlock(shape: ArticleShape, formatExtra = ""): string {
  const beats = shape.beats.map((b, i) => `${i + 1}. ${b}`).join("\n");
  const heads = shape.headingHints.map((h) => `· ${h}`).join("\n");
  const discussionLine =
    shape.discussion === "required"
      ? "- Cuối bài: có mục câu hỏi thảo luận (2–3 câu) — shape này cần"
      : shape.discussion === "optional"
        ? "- Câu hỏi thảo luận: TUỲ — chỉ thêm nếu thật sự kích thảo luận; không bắt buộc mọi bài"
        : "- CẤM mục “Câu hỏi thảo luận” khuôn mẫu — shape này kết bằng chốt/hệ quả";

  return `${formatExtra}### ARTICLE_SHAPE (bắt buộc — bài này ≠ bài khác)
- **Shape id:** \`${shape.id}\`
- **Tên:** ${shape.labelVi}
- **Hợp khi:** ${shape.fit}

**Nhịp bản đăng** (đẩy luận điểm theo thứ tự; KHÔNG đặt tên nhịp làm \`##\`):
${beats}

**Gợi ý tiêu đề thân (đổi wording cho đúng bài):**
${heads}

**Mở:** ${shape.opening}
**Kết:** ${shape.ending}
**Khuyến nghị / So what:** ${shape.recommendations}
${discussionLine}

**Nháp 12 phần (nội bộ):** ${shape.draftHint}

CẤM copy lại đúng khung 6 nhịp “Cảnh → Tension → Cơ chế → Mini-case → Guardrail → Mở” nếu shape khác \`paradox-deepdive\`.
CẤM mọi bài đều “Khuyến nghị Cá nhân / Team / Tổ chức” + 3 câu hỏi thảo luận — chỉ làm khi shape yêu cầu hoặc thật sự hợp.`;
}

/** Block nhúng prompt Planning / Write / Publish (blog xoay shape theo seed) */
export function formatArticleShapePrompt(seed: string): string {
  return formatShapePromptBlock(getArticleShape(seed));
}
