# WP2.5/WP2.6 Production Validation Protocol

> Chạy thủ công hoặc admin-triggered trên production/staging có kiểm soát.  
> Không gọi AI từ automated test suite.

## Trước cohort

1. Deploy WP2.7 theo runbook và xác minh commit bằng `/api/health/version`.
2. Đối chiếu SHA với Vercel Deployment.
3. Khóa `cohortVersion`, deployment SHA, ngày bắt đầu, prompt/threshold/retry config.
4. Không chỉnh prompt, threshold hoặc retry limit giữa cohort. Emergency fix kết thúc version
   hiện tại và mở cohort version mới.
5. Tạo manifest private:

```json
{
  "cohortVersion": "wp27-v1",
  "deploymentSha": "<sha>",
  "articleIds": ["<id>"]
}
```

Không đưa source text, prompt, API key hoặc secret vào manifest/report.

## Cohort A — Clean articles

- Ít nhất **5 bài mới**, tạo sau deployment WP2.7.
- Topic thực, tối thiểu hai domain hiện có.
- Chạy workflow bình thường; không cố tình sửa output để tạo pass.
- Thu feedback khi hoàn thành hoặc exhausted.

## Cohort B — Previously exhausted

- Ít nhất **3 bài từng exhausted**.
- Dùng manual draft recovery mới; không reset toàn workflow trừ khi recovery bị chứng minh không
  an toàn.
- Ghi trạng thái/counter trước recovery, người thực hiện, thời gian, kết quả Editorial Review sau
  recovery và terminal outcome.

## Cohort C — Length coverage

Toàn cohort phải có:

- ít nhất một bài ngắn;
- ít nhất một bài trung bình;
- ít nhất một bài dài gần `MAX_TARGET_WORD_COUNT`.

Ghi `targetWordCount`, draft length, section-presence và truncation indicators. Indicator chỉ là
tín hiệu điều tra, không tự kết luận truncation.

## Các bước cho mỗi bài

1. Ghi article ID, cohort, domain, target length và start time.
2. Chạy từng step hoặc full pipeline có chủ đích.
3. Khi dừng, đọc remediation timeline:
   - gate/phase;
   - score và chiều thay đổi;
   - retry/remediation count;
   - content/parser/runtime/timeout;
   - draft length/section flags.
4. Nếu exhausted, sửa `draft12`, lưu manual revision rồi chạy bước tiếp.
5. Khi completed/exhausted, gửi feedback 5 câu.
6. Không xóa transition/artifact hoặc sửa DB bằng tay.

## Xuất số liệu

```bash
cd web
npm run db:report:remediation -- --manifest ../private/wp27-cohort-v1.json --format json
npm run db:report:remediation -- --manifest ../private/wp27-cohort-v1.json --format csv
npm run db:report:remediation -- --manifest ../private/wp27-cohort-v1.json --format md
```

Script chỉ đọc. Review JSON denominator trước khi dùng tỷ lệ.

## Báo cáo bắt buộc

- số bài pass/completed và exhausted;
- gate G1–G8 phổ biến nhất;
- parse-format failure và timeout có/không;
- score improved/flat/declined/unavailable;
- recovery attempts và recovery success;
- editor manual intervention và feedback response;
- mọi deviation khỏi protocol.

Không đặt target pass giả tạo khi chưa có baseline.

## Quyết định WP-E0A

### GO

- WP2.5/WP2.6 hoạt động đúng trên deployment đã xác minh;
- telemetry và denominator đáng tin;
- đủ trajectory thật qua hai domain/ba length bands;
- recovery dùng được;
- editor xác nhận workflow tạo giá trị;
- benchmark còn trả lời quyết định sản phẩm quan trọng.

### HOLD

- sample chưa đủ;
- reliability hoặc recovery chưa ổn;
- telemetry/feedback thiếu hoặc không đáng tin.

### CANCEL hoặc REDESIGN

- AI-TFES không tạo giá trị rõ;
- editor bỏ workflow;
- benchmark dự kiến đo sai outcome người dùng quan tâm;
- chi phí benchmark lớn hơn giá trị quyết định.

