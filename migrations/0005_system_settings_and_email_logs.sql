-- migrations/0005_system_settings_and_email_logs.sql: System Settings & Email Notification Logs

-- 1. Bảng lưu trữ cấu hình hệ thống (Thông tin liên hệ website, tài khoản ngân hàng nhận tiền, cấu hình email)
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 2. Bảng lưu trữ lịch sử email thông báo đã gửi
CREATE TABLE IF NOT EXISTS email_logs (
  id TEXT PRIMARY KEY,
  to_email TEXT NOT NULL,
  from_email TEXT NOT NULL DEFAULT 'congtykynangmem@gmail.com',
  subject TEXT NOT NULL,
  content_html TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent', -- 'sent' | 'simulated' | 'failed'
  error TEXT,
  metadata TEXT,                      -- JSON: { tenant_id, invoice_id, plan_id, amount_vnd }
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_logs_to ON email_logs(to_email, created_at);

