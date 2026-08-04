# AI-TFES Workflow State Machine v1.6

> Hợp đồng trạng thái chuẩn. Backend là nguồn sự thật; LLM chỉ đề xuất output/status hợp lệ.

## Happy path

`IDEA → MEMORY_CHECKED → RESEARCHED → SYNTHESIZED → INSIGHT_APPROVED → DECIDED → PLANNED → DRAFTED → EDITORIAL_REVIEWED → FACT_CHECKED → FINAL_REVIEWED → POLISHED → READER_SIMULATED → PUBLISH_READY → APPROVED → PUBLISHED`

## Failure / loop states

`RESEARCH_REQUIRED · INSIGHT_REJECTED · MINOR_REVISION_REQUIRED · MAJOR_REVISION_REQUIRED · REWRITE_REQUIRED · FACT_CHECK_FAILED · READER_SIMULATION_FAILED · CORRECTION_REQUIRED · CORRECTED · RETRACTED`

## Transition contract
| From | Action | Required input | Success → | Failure → |
|---|---|---|---|---|
| IDEA | Memory check | recent Knowledge Records | MEMORY_CHECKED | MEMORY_CHECKED |
| MEMORY_CHECKED | Research | resolved domain profile | RESEARCHED | RESEARCH_REQUIRED |
| RESEARCHED | Synthesis | source set + lineages | SYNTHESIZED | RESEARCH_REQUIRED |
| SYNTHESIZED | Insight Gate | Research Brief | INSIGHT_APPROVED | INSIGHT_REJECTED |
| INSIGHT_APPROVED | Decision | scoring weights | DECIDED | RESEARCH_REQUIRED |
| DECIDED | Planning | approved insight | PLANNED | MAJOR_REVISION_REQUIRED |
| PLANNED | Writing | plan + Research Brief | DRAFTED | REWRITE_REQUIRED |
| DRAFTED | Editorial Review | Article revision | EDITORIAL_REVIEWED | MINOR/MAJOR/REWRITE |
| EDITORIAL_REVIEWED | Fact Check | exact Article revision | FACT_CHECKED | FACT_CHECK_FAILED |
| FACT_CHECKED | Final Verification | FactCheck + corrected Article | FINAL_REVIEWED | MINOR/MAJOR/REWRITE |
| FINAL_REVIEWED | Polish | locked review | POLISHED | MINOR_REVISION_REQUIRED |
| POLISHED | Reader Simulation | clean article | READER_SIMULATED | READER_SIMULATION_FAILED |
| READER_SIMULATED | Package | all gates passed | PUBLISH_READY | MINOR_REVISION_REQUIRED |
| PUBLISH_READY | Human approval | approver identity/timestamp | APPROVED | PUBLISH_READY |
| APPROVED | Publish | publishing service result | PUBLISHED | APPROVED |
| PUBLISHED | Correction audit | report/new evidence | CORRECTED/RETRACTED | CORRECTION_REQUIRED |

## Invariants
1. FactCheck phải trỏ đúng `article_draft_revision`; sửa claim sau fact-check làm ledger cũ hết hiệu lực.
2. `PUBLISH_READY` chỉ khi Final Review đạt, FactCheck `PASSED`, không còn action mở.
3. LLM không được tự chuyển `PUBLISH_READY → APPROVED/PUBLISHED`.
4. Mỗi transition tạo artifact revision mới; không ghi đè audit history.
5. Correction thay đổi meaning phải chạy lại FactCheck và Final Verification.
