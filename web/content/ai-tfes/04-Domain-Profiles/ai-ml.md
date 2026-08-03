# Domain Profile: AI / ML ứng dụng (LLM systems)

Chỉ khai báo phần khác biệt so với `engineering.md`.

## identity
Nội dung **AI engineering thực chiến**: RAG, agents, eval, cost/latency/quality, vận hành LLM trên sản phẩm — không nghiên cứu paper thuần / không hype model release.

## audience
AI Engineer, Backend/Platform gắn LLM, Tech Lead, Solution Architect. Giả định biết API/HTTP/data; không cần PhD ML.

## tone
Evidence-first · failure mode · đo được (eval) · trade-off rõ. Tránh “AI sẽ thay thế…”, benchmark bịa, tuyệt đối hóa một model.

## source_tiers
- **Tier 1:** OpenAI/Anthropic/Google Cloud docs & cookbooks; paper nền (RAG, eval) khi trích đúng; engineering blog (Stripe, Notion, Cursor, LangChain có lọc).
- **Tier 2:** Hamel Husain, Eugene Yan, Lilian Weng (đã xác minh); Accel/a16z AI eng essays có kỹ thuật.
- **Tier 3:** Practitioner blog có code/repro; post-mortem LLM production.
- **Tier 4:** HN/Reddit experience — minh họa.
- **Tier 5:** “Prompt pack” / affiliate AI tools — không dùng làm nguồn.

## example_strategy
Pipeline retrieval → generate → eval; incident hallucination/cost spike; so sánh architecture (agent vs workflow). Số % chỉ khi có trong nguồn.

## categories
RAG & Retrieval · Agents & Tool Use · Evaluation · Prompt/Context Engineering · LLM Ops · Cost & Latency · Safety & Guardrails · AI Product Integration.

## scoring_weights
Practical Value 25 · Engineering Impact 20 · Eval Rigor 15 · Evergreen 15 · Learning 10 · Discussion 10 · Novelty 5.

> **Dùng ở Bước 5 (Editorial Decision)** để ưu tiên góc/chủ đề khi có nhiều lựa chọn — KHÔNG dùng thay cho rubric chấm bài ở `Review.md` (Operating Prompt mục 9).

## sensitivity
Không hướng dẫn bypass safety; không claim khả năng model vượt quá evidence. Phân biệt Opinion vs Fact rõ.

## freshness
Model/API cụ thể: 30–60 ngày (ghi rõ thời điểm). Pattern (RAG, eval): evergreen hơn. Benchmark: luôn kèm điều kiện.

## seed_topics
Khi nào không nên dùng agent · Eval online vs offline cho RAG · Chunking thất bại im lặng · Tool-calling loop cháy token · Guardrail làm hỏng UX · Caching embedding vs freshness · Multi-model router khi nào đáng · Hallucination trong citation · Human-in-the-loop cho high-stakes · Observability cho LLM (trace, cost, quality).

## gold_samples
Chuẩn “hay” — bắt chước **nhịp / độ cụ thể / mở bài**, không copy nguyên văn.

### Sample A — Khi nào không nên dùng agent
Mở: “Team thay một cron job 12 dòng bằng agent 4 bước — vì ‘agent thì linh hoạt hơn’. Ba tuần sau, không ai debug nổi vì sao nó gọi sai tool lúc 2 giờ sáng.”
Nhịp: cám dỗ dùng agent cho việc đơn giản → cơ chế (agent thêm một lớp quyết định không xác định) → mini-case rollback về workflow tuyến tính → khi nào agent thực sự đáng (đầu vào mở, cần suy luận nhiều bước) → câu hỏi cho Tech Lead: đang giải bài toán, hay đang theo trend?
Tránh: liệt kê “5 dấu hiệu nên dùng agent” kiểu checklist.

### Sample B — Chunking thất bại im lặng
Mở: “Retrieval trả về đúng document — nhưng sai đoạn, vì chunk cắt ngang giữa câu điều kiện. Không ai biết, vì eval chỉ đo có tìm ra document hay không.”
Nhịp: câu trả lời sai nhưng metric xanh → cơ chế (chunking boundary mất ngữ cảnh) → mini-case incident trả lời sai nhưng retrieval “pass” → trade-off chunk lớn (giữ ngữ cảnh) vs nhỏ (retrieval chính xác hơn) → guardrail: eval phải đo tận câu trả lời, không chỉ retrieval → câu hỏi mở cho team.
Tránh: liệt kê “3 chiến lược chunking” như tutorial.
