# 🤖 Zalo Bot-as-a-Service (BaaS) Platform

> **Nền tảng Quản lý và Vận hành Trợ lý Zalo AI Đa Khách Hàng (Multi-Tenant) chuẩn Doanh Nghiệp**  
> Triển khai trên **Cloudflare Serverless Edge** kết hợp trí tuệ nhân tạo **Google Gemini 2.5 Flash** & **Cloudflare Vectorize RAG**.  
> **Production Domain:** `bot.knm.asia`

---

## 🌟 Tính Năng Nổi Bật (Key Features)

- **⚡ Tích Hợp Zalo Bot Platform Mới Nhất**: Kết nối trực tiếp qua `bot-api.zaloplatforms.com` tương tự Telegram Bot API, sử dụng Bot Token tĩnh, phản hồi markdown chuẩn hóa, hỗ trợ chat cá nhân và nhóm mà **không yêu cầu giấy phép kinh doanh (GPKD)** hay thủ tục xét duyệt OA phức tạp.
- **⏱️ Onboarding Tự Động Trong 10 Giây**: Khách hàng chỉ cần nhập Bot Token lấy từ mini-app "Zalo Bot Creator". Hệ thống tự động xác thực danh tính bot, cấu hình webhook bảo mật với Secret Token ngẫu nhiên, lưu trữ và sẵn sàng hoạt động ngay lập tức.
- **🧠 Trí Tuệ Nhân Tạo RAG Siêu Tốc (Gemini 2.5 Flash + Vectorize)**:
  - Tự động phân đoạn tài liệu kiến thức (Knowledge Base) và nhúng vector bằng Google `text-embedding-004` (768 chiều).
  - Tìm kiếm tương đồng Cosine Similarity trên Cloudflare Vectorize với bộ lọc cô lập dữ liệu khách hàng tuyệt đối (`bot_id`).
  - Strict Grounding Guardrail: AI chỉ trả lời dựa trên tài liệu được cung cấp, tự động từ chối ảo giác (Hallucination) hoặc trả lời ngoài phạm vi.
- **🔒 Bảo Mật Cấp Ngân Hàng (AES-256-GCM Envelope Encryption)**:
  - Toàn bộ Zalo Bot Token được mã hóa đối xứng AES-256-GCM với Key Encryption Key (KEK) và IV ngẫu nhiên trước khi lưu vào Cloudflare D1.
  - Hỗ trợ cơ chế đảo khóa Master Key định kỳ không gián đoạn (Zero-Downtime Key Rotation).
  - Xác thực Webhook bằng `timingSafeEqualString` chống tấn công Timing Attack.
- **👥 Chuyển Tiếp Tư Vấn Viên Tự Động (Human Handover)**:
  - AI nhận diện thông minh ý định người dùng (yêu cầu gặp người thật, khiếu nại, sự cố) để tạm dừng bot và tạo vé hỗ trợ.
  - Hộp thư trực tiếp (Live Inbox) trên Web Portal cho phép nhân viên chat 2 chiều thời gian thực với khách hàng Zalo.
- **📊 Kiểm Soát Định Mức Thương Mại & Cắt Tải Tự Động (Circuit Breaker)**:
  - Hỗ trợ các gói cước linh hoạt: Starter (1,000 tin), Pro (10,000 tin), Enterprise (50,000 tin).
  - Ngắt tải AI tự động khi đạt 100% quota hàng tháng, chuyển sang thông điệp bảo vệ ngân sách giúp nhà cung cấp kiểm soát tuyệt đối chi phí API.
- **🚀 100% Serverless Edge**: Chi phí vận hành tiệm cận $0 khi rảnh rỗi, khả năng mở rộng hàng chục nghìn tin nhắn đồng thời với độ trễ phản hồi Webhook Gateway < 50ms.

---

## 🏗️ Kiến Trúc Hệ Thống (System Architecture)

```
[ Người Dùng Zalo ]
        │  (Tin nhắn đến / Hành động tương tác)
        ▼
[ Zalo Bot Platform ] (bot-api.zaloplatforms.com)
        │
        │  POST /v1/webhook/bot/:botId (X-Bot-Api-Secret-Token)
        ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   CLOUDFLARE SERVERLESS EDGE INFRASTRUCTURE            │
├────────────────────────────────────────────────────────────────────────┤
│  ⚡ Edge Gateway Worker (apps/gateway)                                  │
│     ├── Xác thực Secret Token (Timing-safe)                            │
│     ├── Kiểm tra trùng lặp tin nhắn (Cloudflare KV Idempotency)        │
│     └── Đẩy vào hàng đợi tin nhắn: q_inbound (Cloudflare Queues)       │
│                                                                        │
│  🤖 Agent Worker (apps/agent) [Queue Consumer]                         │
│     ├── Gửi typing indicator ("typing") tới Zalo                       │
│     ├── Kiểm tra hạn mức sử dụng tháng (Circuit Breaker)               │
│     ├── Phát hiện yêu cầu hỗ trợ viên (Human Handover)                 │
│     ├── Nạp lịch sử hội thoại gần nhất (KV Memory)                    │
│     ├── Truy vấn kiến thức (Cloudflare Vectorize RAG)                  │
│     ├── Gọi Google Gemini 2.5 Flash (Strict Grounding)                 │
│     ├── Gửi câu trả lời hoàn tất tới Zalo (bot-api.zaloplatforms.com)  │
│     └── Ghi nhận nhật ký hội thoại & sản lượng vào Cloudflare D1       │
│                                                                        │
│  🏢 Control Plane API Worker (apps/control-api)                        │
│     ├── REST API xác thực JWT & PBKDF2                                 │
│     ├── 10s Bot Onboarding & Đồng bộ Webhook                           │
│     ├── Quản lý tài liệu & Tự động nhúng Vectorize                     │
│     ├── Quản lý hội thoại & Chat trực tiếp (Live Agent Inbox)          │
│     └── API Báo cáo & Thống kê sản lượng                              │
│                                                                        │
│  💻 Web Portal (apps/portal - Next.js 14 App Router on Pages)          │
│     ├── Trang quản lý Bot & Onboarding Wizard trực quan               │
│     ├── Kho tri thức (Knowledge Base) & tải tài liệu                  │
│     ├── Hộp thư hỗ trợ trực tiếp (Live Chat Handover Inbox)            │
│     └── Dashboard thống kê doanh thu, số tin AI & tỷ lệ quota         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 📁 Cấu Trúc Mã Nguồn Monorepo (Repository Layout)

```
Zalo-BaaS/
├── apps/
│   ├── gateway/         # Cloudflare Worker nhận Webhook Zalo (< 50ms ACK)
│   ├── agent/           # Cloudflare Worker xử lý RAG & gọi Gemini LLM (Queue Consumer)
│   ├── control-api/     # Hono REST API quản trị hệ thống, auth, bot & tài liệu
│   └── portal/          # Next.js 14 Web UI (Tailwind CSS, Lucide Icons)
├── packages/
│   ├── shared/          # Types, DTOs, Zod schemas và constants dùng chung
│   ├── crypto/          # Thư viện mã hóa AES-256-GCM & so sánh Timing-safe
│   ├── zalo-bot-sdk/    # SDK kết nối Zalo Bot API (SendMessage, SetWebhook...)
│   ├── llm/             # SDK tích hợp Google Gemini 2.5 Flash & Embedding 004
│   └── rag/             # Bộ xử lý Text Chunking & Cosine Similarity Filter
├── migrations/          # 12 bảng SQLite cho Cloudflare D1 & dữ liệu seed các gói cước
├── tests/               # Bộ test kiểm tra cô lập dữ liệu (Multi-tenant) & tải 50 concurrent
├── docs/                # Sổ tay vận hành (Runbook) & Hướng dẫn triển khai (Deployment)
├── package.json         # Cấu hình pnpm monorepo scripts
├── pnpm-workspace.yaml  # Danh mục các package trong monorepo
└── tsconfig.base.json   # Cấu hình TypeScript chuẩn hoá toàn dự án
```

---

## 🚀 Khởi Chạy Cục Bộ (Local Development)

### 1. Yêu cầu môi trường
- **Node.js**: >= v20 (khuyến nghị v22 hoặc v26 LTS)
- **pnpm**: >= v9 hoặc v12 (`npm install -g pnpm`)

### 2. Cài đặt các gói phụ thuộc
```bash
pnpm install
```

### 3. Thiết lập biến môi trường
Sao chép file mẫu `.env.example` và điền các khóa bí mật của bạn:
```bash
cp .env.example .env
```

### 4. Chạy kiểm thử tự động (Unit & Integration Tests)
Chạy toàn bộ 36 bài kiểm thử tự động bao gồm mã hóa, Zalo SDK, Gemini LLM, Edge Gateway, Agent Worker, Control API, bảo mật cô lập tenant và mô phỏng tải:
```bash
pnpm test
```

### 5. Khởi chạy giao diện Web Portal
```bash
cd apps/portal
pnpm run dev
# Truy cập giao diện tại: http://localhost:3000
```

---

## 🌐 Triển Khai Lên Môi Trường Sản Xuất (Production Deployment)

Hệ thống được thiết kế để triển khai 100% lên nền tảng **Cloudflare**:
1. Đọc hướng dẫn chi tiết từng bước tại: **[Hướng Dẫn Triển Khai (DEPLOYMENT_GUIDE.md)](docs/DEPLOYMENT_GUIDE.md)**.
2. Quy trình ứng cứu sự cố và bảo trì tại: **[Sổ Tay Vận Hành (OPERATIONS_RUNBOOK.md)](docs/OPERATIONS_RUNBOOK.md)**.
3. Toàn bộ quy trình triển khai tự động CI/CD được đóng gói sẵn trong: **[.github/workflows/deploy.yml](.github/workflows/deploy.yml)**.

---

## 📜 Giấy Phép & Bản Quyền
Dự án được xây dựng và phát triển phục vụ nền tảng Zalo Bot-as-a-Service cho tên miền `bot.knm.asia`.
Bảo lưu mọi quyền © 2026.

