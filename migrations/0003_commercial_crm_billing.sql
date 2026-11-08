-- 0003_commercial_crm_billing.sql: Support CRM, Commercial Billing, Invoices & Platform Admin

-- 1. Bổ sung trường cho bảng conversations phục vụ CRM & Chăm sóc khách hàng
ALTER TABLE conversations ADD COLUMN phone TEXT;
ALTER TABLE conversations ADD COLUMN tags TEXT DEFAULT '[]';      -- JSON array of tags: ["VIP", "Tiềm năng", "Cần tư vấn"]
ALTER TABLE conversations ADD COLUMN notes TEXT;                   -- Ghi chú chăm sóc khách hàng
ALTER TABLE conversations ADD COLUMN total_messages INTEGER DEFAULT 1;

-- 2. Bảng Hóa đơn & Giao dịch thanh toán gói cước (VietQR / Chuyển khoản)
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  amount_vnd INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',    -- pending | paid | cancelled
  payment_method TEXT NOT NULL DEFAULT 'vietqr',
  transfer_content TEXT NOT NULL,
  qr_url TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id, status);
