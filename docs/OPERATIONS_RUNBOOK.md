# Sổ Tay Vận Hành & Khắc Phục Sự Cố (Operations Runbook)
**Hệ thống:** Zalo Bot-as-a-Service (BaaS) · **Hạ tầng:** Cloudflare Serverless Edge

Tài liệu này cung cấp các quy trình chuẩn (SOP - Standard Operating Procedures) để giám sát, ứng phó sự cố và bảo trì hệ thống Zalo BaaS trong quá trình vận hành sản xuất thực tế.

---

## 1. Giám Sát & Xử Lý Hàng Đợi Lỗi (Dead Letter Queue - DLQ)

### 1.1. Cơ chế hoạt động của DLQ
- Hàng đợi tin nhắn vào `q_inbound` được cấu hình `max_retries = 3`.
- Khi Agent Worker gặp sự cố không thể xử lý sau 3 lần retry (ví dụ: Zalo API timeout liên tục, payload biến dạng không decode được, lỗi hạ tầng ngoài ý muốn), tin nhắn sẽ được Cloudflare Queues tự động chuyển vào `q_inbound_dlq`.

### 1.2. Thiết lập Cảnh báo (Alerting)
1. Đăng nhập Cloudflare Dashboard > **Workers & Pages** > **Queues** > Chọn `q_inbound_dlq`.
2. Chuyển sang tab **Notifications** > **Add notification rule**.
3. Cấu hình:
   - **Event**: Message dropped to DLQ hoặc DLQ message count > 0.
   - **Channel**: PagerDuty, Webhook (gửi về Slack/Telegram/Zalo nhóm kỹ thuật) hoặc Email trực ban.

### 1.3. Quy trình điều tra & tái xử lý tin nhắn DLQ
Khi nhận cảnh báo có tin nhắn trong DLQ:

1. **Kiểm tra nhật ký lỗi (Logs):**
   ```bash
   npx wrangler tail zalo-baas-agent --status error
   ```
2. **Kéo tin nhắn từ DLQ để phân tích payload:**
   Sử dụng script tiêu thụ DLQ khẩn cấp (`packages/scripts/replay-dlq.ts`) hoặc khởi tạo Worker tạm:
   ```bash
   # Xem số lượng message đọng trong DLQ
   npx wrangler queues list
   ```
3. **Phân loại nguyên nhân:**
   - **Do Gemini API bị rate-limit:** Kiểm tra quota của Gemini API key. Chờ hồi phục hoặc bổ sung fallback key.
   - **Do Zalo Bot Token của khách hàng bị vô hiệu hóa / thu hồi:** Kiểm tra bảng `audit_logs` hoặc `bots.status`. Nếu khách tự xóa bot trên Zalo, cập nhật `bots.status = 'SUSPENDED'` để dừng xử lý.
   - **Do định dạng tin nhắn lạ:** Cập nhật parser trong `packages/shared` hoặc `packages/zalo-bot-sdk`, viết test case bổ sung, sau đó deploy bản vá lên `zalo-baas-agent`.

---

## 2. Ứng Phó Sự Cố (Incident Management)

### 2.1. Sự cố Zalo Webhook bị gián đoạn / trả về mã lỗi
**Dấu hiệu:** Người dùng nhắn tin trên Zalo nhưng không thấy bot phản hồi hoặc chỉ thấy icon "đang gửi".
- **Bước 1: Kiểm tra trạng thái Edge Gateway Worker:**
  ```bash
  curl -i https://bot.knm.asia/v1/webhook/bot/health
  # Hoặc kiểm tra wrangler tail
  npx wrangler tail zalo-baas-gateway
  ```
- **Bước 2: Kiểm tra Webhook Info trên Zalo Bot Platform:**
  Gọi API kiểm tra trạng thái webhook của bot bị ảnh hưởng (sử dụng Token giải mã qua Control API):
  ```bash
  curl -X POST https://bot-api.zaloplatforms.com/bot<TOKEN>/getWebhookInfo
  ```
  Quan sát `last_error_date` và `last_error_message`. Nếu `has_custom_certificate` hoặc `pending_update_count` tăng vọt, webhook URL đang bị chặn hoặc server gateway bị quá tải.
- **Bước 3: Tái kích hoạt Webhook (Re-register):**
  Nếu Zalo vô hiệu hóa webhook do retry quá nhiều lần:
  Truy cập Portal `https://bot.knm.asia/dashboard/bots`, chọn bot và nhấn nút **Đồng bộ Webhook** (hệ thống sẽ tự động gọi `setWebhook` kèm secret token mới).

### 2.2. Sự cố Gemini API bị Rate Limit hoặc Outage
**Dấu hiệu:** Agent worker ghi nhận mã lỗi `429 Too Many Requests` hoặc `503 Service Unavailable` từ `generativelanguage.googleapis.com`.
- **Cơ chế tự bảo vệ:** Hệ thống Agent Worker đã tích hợp sẵn cơ chế **Graceful Degradation**:
  1. Khi Gemini API gặp sự cố, hệ thống không làm sập tiến trình mà tự động chuyển đổi tin nhắn sang trạng thái **Human Handover (Chuyển tiếp hỗ trợ viên)**.
  2. Gửi thông điệp lịch sự về phía Zalo: *"Hệ thống trợ lý AI đang được bảo trì trong giây lát. Câu hỏi của bạn đã được chuyển tới nhân viên hỗ trợ!"*.
  3. Tạo phiếu hỗ trợ khẩn cấp vào bảng `handovers` để nhân viên tiếp quản trên Web Portal.
- **Biện pháp khôi phục:**
  - Nâng cấp Tier hạn mức trên Google Cloud AI Studio (từ Free Tier lên Pay-as-you-go).
  - Thay thế `GEMINI_API_KEY` mới tức thì qua Wrangler:
    ```bash
    npx wrangler secret put GEMINI_API_KEY --name zalo-baas-agent
    ```

---

## 3. Quy Trình Đảo Khóa Mã Hóa Chủ (Zero-Downtime Key Rotation: KEK_V1 -> KEK_V2)

Hệ thống bảo vệ toàn bộ Zalo Bot Token của khách hàng bằng thuật toán **AES-256-GCM** với khóa chủ Envelope Encryption. Để tuân thủ tiêu chuẩn an toàn bảo mật định kỳ 90 ngày hoặc khi nghi ngờ rò rỉ khóa:

### 3.1. Các nguyên tắc đảo khóa
- Bảng `bot_credentials` lưu trữ `kek_version` (`v1`, `v2`, ...).
- Hàm giải mã tự động chọn KEK tương ứng với phiên bản của bản ghi.
- Quá trình chuyển đổi diễn ra trực tiếp (hot-rotation) mà không cần downtime.

### 3.2. Trình tự thực hiện
1. **Tạo khóa KEK_V2 mới:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
2. **Nạp `KEK_V2` vào secrets của toàn bộ Workers:**
   ```bash
   npx wrangler secret put KEK_V2 --name zalo-baas-gateway
   npx wrangler secret put KEK_V2 --name zalo-baas-agent
   npx wrangler secret put KEK_V2 --name zalo-baas-control-api
   ```
3. **Cập nhật Worker Agent & Control API:**
   Cấu hình cho phép đọc cả `KEK_V1` (để giải mã bản ghi cũ) và `KEK_V2` (để mã hóa bản ghi mới).
4. **Chạy script Batch Re-encryption (Tái mã hóa dữ liệu cũ):**
   Đọc toàn bộ các bản ghi `bot_credentials` có `kek_version = 'v1'`:
   - Giải mã bằng `KEK_V1`.
   - Mã hóa lại bằng `KEK_V2`.
   - Cập nhật trường `encrypted_token`, `iv`, `tag`, `kek_version = 'v2'`.
5. **Hủy khóa `KEK_V1`:**
   Sau khi 100% bản ghi đã chuyển sang `v2`, xóa biến môi trường `KEK_V1` khỏi Wrangler Secrets.

---

## 4. Sao Lưu & Phục Hồi Dữ Liệu D1 (Backup & Disaster Recovery)

### 4.1. Quy trình sao lưu tự động định kỳ (Daily Backup)
Cloudflare D1 cung cấp tính năng sao lưu point-in-time snapshot tự động. Ngoài ra, để lưu trữ độc lập sang Cloudflare R2 / kho lưu trữ ngoài:

1. **Xuất bản sao lưu D1 ra file SQL:**
   ```bash
   npx wrangler d1 export zalo-baas-db --remote --output="./backups/backup-$(date +%Y%m%d_%H%M%S).sql"
   ```
2. **Đẩy bản sao lưu vào Cloudflare R2 Bucket:**
   ```bash
   npx wrangler r2 object put zalo-baas-backups/daily/backup-$(date +%Y%m%d).sql --file="./backups/backup-$(date +%Y%m%d).sql"
   ```
*(Có thể cấu hình script này chạy tự động hàng ngày qua Cloudflare Workers Cron Triggers).*

### 4.2. Quy trình phục hồi dữ liệu (Restore)
Trong tình huống thảm họa cần khôi phục lại trạng thái cơ sở dữ liệu:
1. Tạo một cơ sở dữ liệu D1 dự phòng mới hoặc làm sạch cơ sở dữ liệu hiện tại:
   ```bash
   npx wrangler d1 execute zalo-baas-db --remote --file="./backups/backup-latest.sql"
   ```
2. Kiểm tra lại tính toàn vẹn của dữ liệu bằng lệnh:
   ```bash
   npx wrangler d1 execute zalo-baas-db --remote --command="SELECT count(*) FROM bots; SELECT count(*) FROM users;"
   ```

---

## 5. Danh Mục Kiểm Tra An Toàn Định Kỳ (Weekly Maintenance Checklist)

| STT | Hạng mục kiểm tra | Công cụ / Lệnh | Tiêu chuẩn đạt |
|---|---|---|---|
| 1 | Số lượng message trong DLQ | `wrangler queues list` | `q_inbound_dlq = 0` |
| 2 | Tỷ lệ lỗi Gateway Worker | Cloudflare Analytics | 5xx error rate < 0.05% |
| 3 | Thời gian phản hồi trung bình (Gateway) | Cloudflare Analytics | P95 Latency < 100ms |
| 4 | Dung lượng Vector Index | Cloudflare Vectorize | Dưới 80% định mức gói |
| 5 | Tỷ lệ tin nhắn vượt Quota | Control API Analytics | Các tenant vượt quota được thông báo nâng gói |
| 6 | Trạng thái đồng bộ Webhook | Control API Dashboard | 100% bot active có webhook phản hồi 200 OK |

