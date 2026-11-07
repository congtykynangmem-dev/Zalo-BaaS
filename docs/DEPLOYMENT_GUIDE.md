# Hướng Dẫn Triển Khai Hệ Thống Zalo BaaS (Production Deployment Guide)
**Tên miền chính thức:** `bot.knm.asia` · **Kiến trúc:** Pure Cloudflare Serverless Edge

---

## 1. Yêu Cầu Chuẩn Bị
1. Tài khoản Cloudflare (khuyến nghị gói Workers Paid để có hạn mức cao và tính năng Queues).
2. Tên miền `bot.knm.asia` đã được quản lý DNS trên Cloudflare.
3. Google Gemini API Key (kích hoạt trên Google AI Studio).

---

## 2. Khởi Tạo Tài Nguyên Cloudflare Qua Wrangler CLI

Mở terminal tại thư mục gốc của dự án và chạy các lệnh sau:

### 2.1. Khởi tạo Cơ sở dữ liệu Cloudflare D1
```bash
npx wrangler d1 create zalo-baas-db
```
*Sao chép `database_id` sinh ra và dán vào các file `apps/*/wrangler.toml`.*

Áp dụng các file migration khởi tạo 12 bảng và dữ liệu seed:
```bash
npx wrangler d1 migrations apply zalo-baas-db --remote
```

### 2.2. Khởi tạo Cloudflare KV Namespace (Cache & Memory)
```bash
npx wrangler kv:namespace create KV_CACHE
```
*Sao chép `id` sinh ra và cập nhật vào trường `id` trong mục `[[kv_namespaces]]` của các file `wrangler.toml`.*

### 2.3. Khởi tạo Cloudflare Queues (Hàng đợi tin nhắn)
```bash
# Hàng đợi tin nhắn đến
npx wrangler queues create q_inbound

# Hàng đợi tin nhắn lỗi (Dead Letter Queue)
npx wrangler queues create q_inbound_dlq
```

### 2.4. Khởi tạo Cloudflare Vectorize (Kho Vector RAG)
```bash
# Model text-embedding-004 của Google sử dụng 768 chiều và độ tương đồng Cosine
npx wrangler vectorize create zalo-baas-vectors --dimensions=768 --metric=cosine
```

---

## 3. Cấu Hình Biến Môi Trường Bí Mật (Secrets)

Chạy các lệnh sau để nạp khóa mã hóa và API key vào Cloudflare Workers Secrets:

```bash
# 1. Khóa chủ KEK (AES-256-GCM 32 bytes Base64)
npx wrangler secret put KEK_V1 --name zalo-baas-gateway
npx wrangler secret put KEK_V1 --name zalo-baas-agent
npx wrangler secret put KEK_V1 --name zalo-baas-control-api

# 2. Khóa JWT Secret
npx wrangler secret put JWT_SECRET --name zalo-baas-control-api

# 3. Google Gemini API Key
npx wrangler secret put GEMINI_API_KEY --name zalo-baas-agent
npx wrangler secret put GEMINI_API_KEY --name zalo-baas-control-api
```

---

## 4. Triển Khai (Deploy) Các Dịch Vụ Lên Đám Mây

### 4.1. Deploy Edge Gateway Worker
```bash
cd apps/gateway
npx wrangler deploy
```

### 4.2. Deploy Agent Consumer Worker
```bash
cd ../agent
npx wrangler deploy
```

### 4.3. Deploy Control API Worker
```bash
cd ../control-api
npx wrangler deploy
```

### 4.4. Deploy Portal (Cloudflare Pages)
```bash
cd ../portal
pnpm run build
npx wrangler pages deploy .next --project-name=zalo-baas-portal
```

---

## 5. Cấu Hình Tên Miền & Định Tuyến (Custom Domains)
Trên Cloudflare Dashboard:
1. **Worker Gateway:** Gán Custom Domain `bot.knm.asia` với route `/v1/webhook/*`.
2. **Worker Control API:** Gán Custom Domain `api.bot.knm.asia` hoặc route `/v1/*`.
3. **Cloudflare Pages:** Gán Custom Domain `bot.knm.asia` cho toàn bộ giao diện Web.
4. **SSL/TLS:** Đặt chế độ `Full (Strict)` và bật `Always Use HTTPS`.

