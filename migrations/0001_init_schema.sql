-- 0001_init_schema.sql: Initial D1 schema for Zalo BaaS

-- 1. Bảng Định nghĩa gói cước
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,               -- starter | pro | enterprise
  name TEXT NOT NULL,
  price_vnd INTEGER NOT NULL,
  max_bots INTEGER NOT NULL DEFAULT 1,
  monthly_ai_messages INTEGER NOT NULL DEFAULT 1000,
  max_documents INTEGER NOT NULL DEFAULT 5,
  max_doc_mb INTEGER NOT NULL DEFAULT 10,
  features TEXT NOT NULL             -- JSON string of features
);

-- 2. Bảng Khách hàng (Tenant)
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL DEFAULT 'active',   -- active | suspended | cancelled
  contact_email TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tenants_plan ON tenants(plan_id);

-- 3. Bảng Người dùng Portal
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id),   -- NULL nếu là Platform Owner
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,                      -- platform_owner | tenant_admin | tenant_agent
  status TEXT NOT NULL DEFAULT 'active',   -- active | disabled
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

-- 4. Bảng Cấu hình Bot
CREATE TABLE IF NOT EXISTS bots (
  id TEXT PRIMARY KEY,                     -- bot_id ngẫu nhiên dùng trong Webhook URL (22 chars base62)
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  bot_type TEXT NOT NULL DEFAULT 'zalo_bot', -- 'zalo_bot' (Zalo Bot Platform) | 'zalo_oa'
  name TEXT NOT NULL,
  zalo_bot_id TEXT,
  username TEXT,
  status TEXT NOT NULL DEFAULT 'active',   -- active | paused | error
  system_prompt TEXT,
  strict_grounding INTEGER NOT NULL DEFAULT 0, -- 1: strictly cite, refuse if no context
  model_policy TEXT NOT NULL DEFAULT 'auto',   -- auto | flash | pro
  handover_keywords TEXT,                  -- JSON array of keywords
  handover_minutes INTEGER NOT NULL DEFAULT 30,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bots_tenant ON bots(tenant_id);

-- 5. Bảng Chứng thực Bot (Mã hóa AES-256-GCM)
CREATE TABLE IF NOT EXISTS bot_credentials (
  bot_id TEXT PRIMARY KEY REFERENCES bots(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  bot_token_enc BLOB NOT NULL,             -- Token bot-api.zaloplatforms.com mã hóa
  secret_token_enc BLOB NOT NULL,          -- Secret token xác thực X-Bot-Api-Secret-Token
  created_at INTEGER NOT NULL
);

-- 6. Bảng Tài liệu tri thức (RAG)
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'upload', -- upload | gdrive | url
  r2_key TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',     -- pending | processing | ready | failed
  chunk_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_docs_bot ON documents(tenant_id, bot_id);

-- 7. Bảng Đoạn văn bản (Chunks)
CREATE TABLE IF NOT EXISTS chunks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  doc_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ord INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER
);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(doc_id);

-- 8. Bảng Phiên hội thoại
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,                   -- Chat ID nhận từ payload Zalo
  display_name TEXT,
  state TEXT NOT NULL DEFAULT 'ai',        -- ai | human | closed
  human_until INTEGER,
  last_message_at INTEGER NOT NULL,
  UNIQUE(bot_id, chat_id)
);
CREATE INDEX IF NOT EXISTS idx_conv_tenant_bot ON conversations(tenant_id, bot_id);

-- 9. Bảng Tin nhắn
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,                 -- in | out
  sender TEXT NOT NULL,                    -- user | ai | agent | system
  text TEXT NOT NULL,
  zalo_msg_id TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at);

-- 10. Bảng Yêu cầu chuyển nhân viên (Handovers)
CREATE TABLE IF NOT EXISTS handovers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  reason TEXT,                             -- keyword | user_request | ai_low_confidence
  status TEXT NOT NULL DEFAULT 'open',     -- open | taken | resolved | expired
  assigned_user_id TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_handover_tenant ON handovers(tenant_id, status);

-- 11. Bảng Thống kê sử dụng hàng ngày (Quota & Usage)
CREATE TABLE IF NOT EXISTS usage_daily (
  tenant_id TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  day TEXT NOT NULL,                       -- YYYY-MM-DD
  ai_messages INTEGER NOT NULL DEFAULT 0,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  cost_micro_usd INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, bot_id, day)
);

-- 12. Bảng Nhật ký thao tác (Audit logs)
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  user_id TEXT,
  action TEXT NOT NULL,
  target TEXT,
  ip TEXT,
  created_at INTEGER NOT NULL
);
