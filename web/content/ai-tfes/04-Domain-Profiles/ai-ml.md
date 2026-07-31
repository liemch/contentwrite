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

## sensitivity
Không hướng dẫn bypass safety; không claim khả năng model vượt quá evidence. Phân biệt Opinion vs Fact rõ.

## freshness
Model/API cụ thể: 30–60 ngày (ghi rõ thời điểm). Pattern (RAG, eval): evergreen hơn. Benchmark: luôn kèm điều kiện.

## seed_topics
Khi nào không nên dùng agent · Eval online vs offline cho RAG · Chunking thất bại im lặng · Tool-calling loop cháy token · Guardrail làm hỏng UX · Caching embedding vs freshness · Multi-model router khi nào đáng · Hallucination trong citation · Human-in-the-loop cho high-stakes · Observability cho LLM (trace, cost, quality).
