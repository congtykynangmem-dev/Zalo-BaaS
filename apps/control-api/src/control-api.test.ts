// apps/control-api/src/control-api.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from './index.js';
import { generateMasterKeyBase64 } from '@zalo-baas/crypto';
import type { Env } from './types.js';

describe('Control API Worker (apps/control-api)', () => {
  let mockKV: Map<string, string>;
  let mockUsers: Map<string, Record<string, unknown>>;
  let mockTenants: Map<string, Record<string, unknown>>;
  let mockBots: Map<string, Record<string, unknown>>;
  let mockDocs: Map<string, Record<string, unknown>>;
  let mockConvs: Map<string, Record<string, unknown>>;
  let mockMessages: Record<string, unknown>[];
  let mockTenantSettings: Map<string, Record<string, unknown>>;
  let mockVectors: unknown[];
  let env: Env;
  const masterKey = generateMasterKeyBase64();

  beforeEach(() => {
    vi.restoreAllMocks();
    mockKV = new Map();
    mockUsers = new Map();
    mockTenants = new Map();
    mockBots = new Map();
    mockDocs = new Map();
    mockConvs = new Map();
    mockTenantSettings = new Map();
    mockMessages = [];
    mockVectors = [];

    // Mock D1 Database
    const mockStatement = (sql: string) => {
      const normSql = sql.replace(/\s+/g, ' ');
      let boundParams: unknown[] = [];
      const createExec = () => ({
        first: vi.fn(async () => {
          if (normSql.includes('SELECT id FROM users WHERE email = ?')) {
            const email = boundParams[0] as string;
            return mockUsers.get(email) ?? null;
          }
          if (normSql.includes('FROM users u LEFT JOIN tenants t')) {
            const email = boundParams[0] as string;
            return mockUsers.get(email) ?? null;
          }
          if (normSql.includes('SELECT id, name, plan_id, status FROM tenants')) {
            const tenantId = boundParams[0] as string;
            return mockTenants.get(tenantId) ?? null;
          }
          if (normSql.includes('SELECT id FROM bots WHERE id = ?')) {
            const botId = boundParams[0] as string;
            return mockBots.get(botId) ?? null;
          }
          if (normSql.includes('SELECT id, name FROM bots WHERE id = ?')) {
            const botId = boundParams[0] as string;
            return mockBots.get(botId) ?? null;
          }
          if (normSql.includes('SELECT t.plan_id, p.name as plan_name')) {
            return {
              plan_id: 'starter',
              plan_name: 'Starter',
              monthly_ai_messages: 1000,
              max_documents: 5,
            };
          }
          if (normSql.includes('SUM(ai_messages) as total_ai_messages')) {
            return {
              total_ai_messages: 250,
              total_tokens_in: 50000,
              total_tokens_out: 15000,
            };
          }
          if (normSql.includes('COUNT(*) as total_convs')) {
            return { total_convs: 15 };
          }
          if (normSql.includes('COUNT(*) as total_handovers')) {
            return { total_handovers: 3 };
          }
          if (normSql.includes('SELECT id, bot_id, chat_id FROM conversations')) {
            const convId = boundParams[0] as string;
            return mockConvs.get(convId) ?? null;
          }
          if (normSql.includes('SELECT bot_token_enc FROM bot_credentials')) {
            return { bot_token_enc: new Uint8Array([1, 2, 3]) };
          }
          if (normSql.includes('SELECT gemini_api_key FROM tenant_settings')) {
            const tenantId = boundParams[0] as string;
            return mockTenantSettings.get(tenantId) ?? null;
          }
          if (normSql.includes('FROM plans WHERE id = ?')) {
            const planId = boundParams[0] as string;
            if (planId === 'trial') {
              return {
                id: 'trial',
                name: 'Dùng thử 7 ngày',
                price_vnd: 0,
                max_bots: 1,
                monthly_ai_messages: 1000,
                max_documents: 3,
                max_doc_mb: 5,
                features: '{"trial_days":7}',
              };
            }
            return {
              id: boundParams[0] || 'pro',
              name: 'Pro',
              price_vnd: 299000,
              max_bots: 3,
              monthly_ai_messages: 15000,
              max_documents: 30,
              max_doc_mb: 50,
              features: '{"smart_rag":true}',
            };
          }
          if (normSql.includes('FROM invoices WHERE id = ?')) {
            return {
              id: boundParams[0] || 'inv_test',
              invoice_id: boundParams[0] || 'inv_test',
              tenant_id: 'tenant_1',
              plan_id: 'pro',
              amount_vnd: 599000,
              status: 'pending',
            };
          }
          if (normSql.includes('SELECT COUNT(*) as count FROM tenants')) {
            return { count: 5 };
          }
          if (normSql.includes('SELECT COUNT(*) as count FROM users')) {
            return { count: 12 };
          }
          if (normSql.includes("SELECT COUNT(*) as count FROM bots WHERE status = 'active'")) {
            return { count: 8 };
          }
          if (normSql.includes('SELECT COUNT(*) as count FROM documents')) {
            return { count: 24 };
          }
          if (normSql.includes('SELECT SUM(ai_messages) as total FROM usage_daily')) {
            return { total: 15400 };
          }
          if (normSql.includes('SUM(p.price_vnd) as monthly_revenue')) {
            return { monthly_revenue: 2990000 };
          }
          if (normSql.includes('SELECT c.id, c.tenant_id, c.bot_id, c.chat_id, c.display_name, c.phone, c.tags, c.notes')) {
            return {
              id: 'conv_1',
              tenant_id: 'tenant_1',
              bot_id: 'bot_1',
              chat_id: 'chat_user_1',
              display_name: 'Nguyen Van A',
              phone: '0986000797',
              tags: '["VIP", "Khách quen"]',
              notes: 'Thích gà cay giòn',
              total_messages: 12,
              last_message_at: Date.now(),
              state: 'bot',
              bot_name: 'Five Star Bot',
            };
          }
          if (normSql.includes('FROM documents WHERE id = ?')) {
            return {
              id: boundParams[0] || 'doc_1',
              title: 'Bảng giá thực đơn',
              bot_id: null,
              status: 'ready',
              chunk_count: 2,
              size_bytes: 1024,
            };
          }
          return null;
        }),
        all: vi.fn(async () => {
          if (normSql.includes('FROM bots WHERE tenant_id = ?')) {
            return { results: Array.from(mockBots.values()) };
          }
          if (normSql.includes('FROM documents WHERE bot_id = ?')) {
            return { results: Array.from(mockDocs.values()) };
          }
          if (normSql.includes('FROM conversations WHERE bot_id = ?')) {
            return { results: Array.from(mockConvs.values()) };
          }
          if (normSql.includes('FROM usage_daily WHERE tenant_id = ?')) {
            return {
              results: [
                { day: '2026-11-07', ai_messages: 50, tokens_in: 10000, tokens_out: 3000 },
              ],
            };
          }
          if (normSql.includes('FROM plans ORDER BY price_vnd ASC')) {
            return {
              results: [
                { id: 'starter', name: 'Starter', price_vnd: 199000, max_bots: 1, monthly_ai_messages: 1000, max_documents: 5, max_doc_mb: 10, features: '{}' },
                { id: 'pro', name: 'Pro', price_vnd: 599000, max_bots: 3, monthly_ai_messages: 10000, max_documents: 20, max_doc_mb: 25, features: '{}' },
              ],
            };
          }
          if (normSql.includes('FROM conversations c') && normSql.includes('WHERE c.tenant_id = ?')) {
            return {
              results: [
                {
                  id: 'conv_1',
                  tenant_id: 'tenant_1',
                  bot_id: 'bot_1',
                  chat_id: 'chat_user_1',
                  display_name: 'Nguyen Van A',
                  phone: '0986000797',
                  tags: '["VIP"]',
                  notes: 'Khách quen',
                  total_messages: 5,
                  last_message_at: Date.now(),
                  state: 'bot',
                  bot_name: 'Bot Gà Rán',
                },
              ],
            };
          }
          if (normSql.includes('FROM tenants t') && normSql.includes('JOIN plans p')) {
            return {
              results: [
                {
                  id: 'tenant_1',
                  name: 'Five Star Trần Phú',
                  plan_id: 'pro',
                  plan_name: 'Pro',
                  price_vnd: 599000,
                  status: 'active',
                  contact_email: 'fivestar@gmail.com',
                  created_at: Date.now(),
                  bot_count: 2,
                  doc_count: 4,
                  ai_messages_count: 320,
                },
              ],
            };
          }
          if (normSql.includes('FROM chunks WHERE doc_id = ?')) {
            return {
              results: [
                { ord: 0, content: 'Đoạn 1: Bảng giá Five Star 41 Trần Phú' },
                { ord: 1, content: 'Đoạn 2: Gà rán nóng giòn 8.000đ' },
              ],
            };
          }
          return { results: [] };
        }),
        run: vi.fn(async () => {
          if (normSql.includes('INSERT INTO tenants')) {
            const [id, name, email] = boundParams;
            mockTenants.set(id as string, { id, name, email, plan_id: 'starter' });
          }
          if (normSql.includes('INSERT INTO users')) {
            const [id, tenant_id, email, password_hash] = boundParams;
            mockUsers.set(email as string, {
              id,
              tenant_id,
              email,
              password_hash,
              role: 'tenant_admin',
              status: 'active',
              tenant_name: 'Test Tenant',
              plan_id: 'starter',
            });
          }
          if (normSql.includes('INSERT INTO bots')) {
            const [id, tenant_id, name] = boundParams;
            mockBots.set(id as string, { id, tenant_id, name, status: 'active' });
          }
          if (normSql.includes('INSERT INTO documents')) {
            const [id, tenant_id, bot_id, title] = boundParams;
            mockDocs.set(id as string, { id, tenant_id, bot_id, title, status: 'ready' });
          }
          if (normSql.includes('INSERT INTO tenant_settings')) {
            const [tenant_id, gemini_api_key] = boundParams;
            mockTenantSettings.set(tenant_id as string, { tenant_id, gemini_api_key });
          }
          return { success: true };
        }),
      });

      const exec = createExec();
      return {
        ...exec,
        bind: (...params: unknown[]) => {
          boundParams = params;
          return exec;
        },
      };
    };

    env = {
      ENVIRONMENT: 'test',
      JWT_SECRET: 'test_jwt_secret_key_123456789',
      KEK_V1: masterKey,
      GEMINI_API_KEY: 'test_gemini_key',
      WEBHOOK_BASE_URL: 'https://bot.knm.asia/v1/webhook/bot',
      DB: {
        prepare: vi.fn((sql: string) => mockStatement(sql)),
      } as unknown as D1Database,
      KV_CACHE: {
        get: vi.fn(async (key: string) => mockKV.get(key) ?? null),
        put: vi.fn(async (key: string, val: string) => {
          mockKV.set(key, val);
        }),
        delete: vi.fn(async (key: string) => {
          mockKV.delete(key);
        }),
      } as unknown as KVNamespace,
      VECTORS: {
        upsert: vi.fn(async (vecs: unknown[]) => {
          mockVectors.push(...vecs);
        }),
        deleteByIds: vi.fn(async () => {}),
      } as unknown as VectorizeIndex,
    };
  });

  it('hashes and verifies password', async () => {
    const { hashPassword, verifyPassword } = await import('./auth.js');
    const pwd = 'Password123!';
    const hashed = await hashPassword(pwd);
    expect(await verifyPassword(pwd, hashed)).toBe(true);
    expect(await verifyPassword('wrong', hashed)).toBe(false);
  });

  it('handles user registration and login successfully', async () => {
    // 1. Register
    const regRes = await app.request(
      '/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@knm.asia',
          password: 'Password123!',
          tenant_name: 'Công ty KNM',
        }),
      },
      env
    );

    expect(regRes.status).toBe(200);
    const regBody = (await regRes.json()) as { token: string; user: { email: string } };
    expect(regBody.token).toBeDefined();
    expect(regBody.user.email).toBe('admin@knm.asia');

    // 2. Login
    const loginRes = await app.request(
      '/v1/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@knm.asia',
          password: 'Password123!',
        }),
      },
      env
    );

    expect(loginRes.status).toBe(200);
    const loginBody = (await loginRes.json()) as { token: string };
    expect(loginBody.token).toBeDefined();

    // 3. Get /me with valid token
    const meRes = await app.request(
      '/v1/auth/me',
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${loginBody.token}` },
      },
      env
    );
    expect(meRes.status).toBe(200);
    const meBody = (await meRes.json()) as { user: { email: string } };
    expect(meBody.user.email).toBe('admin@knm.asia');
  });

  it('rejects unauthenticated requests to protected endpoints', async () => {
    const res = await app.request('/v1/bots', { method: 'GET' }, env);
    expect(res.status).toBe(401);
  });

  it('connects a new Zalo Bot in 10 seconds and configures webhook', async () => {
    // Register to get auth token
    const regRes = await app.request(
      '/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'botowner@knm.asia',
          password: 'Password123!',
          tenant_name: 'Shop Cây Cảnh',
        }),
      },
      env
    );
    const { token } = (await regRes.json()) as { token: string };

    // Mock Zalo Bot Platform API calls (getMe, setWebhook)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = url.toString();
      if (urlStr.includes('/getMe')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            result: { id: 'bot_zalo_1', name: 'Bot Cay Canh', is_bot: true },
          }),
        } as Response;
      }
      if (urlStr.includes('/setWebhook')) {
        return {
          ok: true,
          json: async () => ({ ok: true, result: true }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    const connectRes = await app.request(
      '/v1/bots/connect',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          bot_token: 'valid_bot_token_123',
          system_prompt: 'Tư vấn nhiệt tình',
        }),
      },
      env
    );

    expect(connectRes.status).toBe(200);
    const connectBody = (await connectRes.json()) as {
      ok: boolean;
      bot: { id: string; name: string; webhook_url: string };
    };
    expect(connectBody.ok).toBe(true);
    expect(connectBody.bot.name).toBe('Bot Cay Canh');
    expect(connectBody.bot.webhook_url).toContain('/v1/webhook/bot/');

    // Check bot cached in KV
    expect(mockKV.has(`bot:${connectBody.bot.id}`)).toBe(true);
  });

  it('ingests knowledge document, chunks, embeds, and indexes to Vectorize', async () => {
    // Register
    const regRes = await app.request(
      '/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'docadmin@knm.asia',
          password: 'Password123!',
          tenant_name: 'Shop Hoa',
        }),
      },
      env
    );
    const { token } = (await regRes.json()) as { token: string };

    // Seed bot
    mockBots.set('bot_test', { id: 'bot_test', name: 'Bot Hoa' });

    // Mock Gemini embedContent
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = url.toString();
      if (urlStr.includes('text-embedding-004')) {
        return {
          ok: true,
          json: async () => ({ embedding: { values: [0.1, 0.2, 0.3] } }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    const docRes = await app.request(
      '/v1/bots/bot_test/documents',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: 'Chính sách giao hoa',
          content: 'Giao hoa hỏa tốc trong 2 giờ tại nội thành Hà Nội và TP.HCM.',
        }),
      },
      env
    );

    expect(docRes.status).toBe(200);
    const docBody = (await docRes.json()) as {
      ok: boolean;
      document: { title: string; status: string; chunk_count: number };
    };
    expect(docBody.ok).toBe(true);
    expect(docBody.document.status).toBe('ready');
    expect(docBody.document.chunk_count).toBeGreaterThan(0);
    expect(mockVectors.length).toBeGreaterThan(0);
  });

  it('retrieves bot stats and quota metrics accurately', async () => {
    // Register to get token
    const regRes = await app.request(
      '/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'statsadmin@knm.asia',
          password: 'Password123!',
          tenant_name: 'Shop Thống Kê',
        }),
      },
      env
    );
    const { token } = (await regRes.json()) as { token: string };

    mockBots.set('bot_stats_1', { id: 'bot_stats_1', name: 'Bot Thống Kê' });

    const statsRes = await app.request(
      '/v1/analytics/bots/bot_stats_1/stats',
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
      env
    );

    expect(statsRes.status).toBe(200);
    const statsBody = (await statsRes.json()) as {
      bot: { id: string; name: string };
      plan: { name: string; monthly_limit: number };
      usage: {
        ai_messages: number;
        quota_percent: number;
        is_quota_warning: boolean;
      };
      counts: { total_conversations: number; total_handovers: number };
      daily_breakdown: Array<{ day: string; ai_messages: number }>;
    };

    expect(statsBody.bot.name).toBe('Bot Thống Kê');
    expect(statsBody.plan.monthly_limit).toBe(1000);
    expect(statsBody.usage.ai_messages).toBe(250);
    expect(statsBody.usage.quota_percent).toBe(25);
    expect(statsBody.usage.is_quota_warning).toBe(false);
    expect(statsBody.counts.total_handovers).toBe(3);
    expect(statsBody.daily_breakdown.length).toBe(1);
  });

  it('manages tenant Gemini AI configuration via /v1/settings/ai', async () => {
    // 1. Register tenant
    const regRes = await app.request(
      '/v1/auth/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'ai_tenant@example.com',
          password: 'Password123!',
          tenant_name: 'AI Test Tenant',
        }),
      },
      env
    );
    const regData = (await regRes.json()) as { token: string };
    const token = regData.token;
    expect(token).toBeDefined();

    // 2. Query initial AI settings (uses system_env from mock env)
    const initRes = await app.request(
      '/v1/settings/ai',
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
      env
    );
    expect(initRes.status).toBe(200);
    const initData = (await initRes.json()) as { configured: boolean; masked_key: string; source: string };
    expect(initData.configured).toBe(true);
    expect(initData.source).toBe('system_env');

    // 3. Save new Gemini API Key
    const saveRes = await app.request(
      '/v1/settings/ai',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          gemini_api_key: 'AIzaSySecretCustomKey12345',
        }),
      },
      env
    );
    expect(saveRes.status).toBe(200);
    const saveData = (await saveRes.json()) as { ok: boolean; masked_key: string };
    expect(saveData.ok).toBe(true);
    expect(saveData.masked_key).toContain('...');

    // 4. Verify updated AI status (now tenant_custom)
    const checkRes = await app.request(
      '/v1/settings/ai',
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
      env
    );
    const checkData = (await checkRes.json()) as { configured: boolean; masked_key: string; source: string };
    expect(checkData.configured).toBe(true);
    expect(checkData.source).toBe('tenant_custom');
  });

  it('filters specific items (sausage) and provides full menu when requested', async () => {
    const { formatSmartKnowledgeReply } = await import('./routes/webhook.js');

    const sampleTable = `
| Tên món | Giá bán | Đơn vị | Ghi chú / Đặc điểm |
|:---|:---|:---|:---|
| Cá viên | 8.000đ | Xiên | Món quốc dân giá rẻ nhất quán |
| Bò viên | 9.000đ | Xiên | Dai giòn sần sật |
| Gà giòn truyền thống | 32.000đ | Miếng | Giòn rụm đậm đà |
| Gà giòn cay | 32.000đ | Miếng | Cay tê hấp dẫn |
| Gà giòn giòn | 35.000đ | Miếng | Siêu giòn đặc biệt |
| Cánh gà chiên nước mắm | 34.000đ | Phần | Thơm lừng nước mắm |
| Xúc xích Phô mai | 9.000đ | Xiên | Nhân phô mai tan chảy |
| Phô mai que | 10.000đ | Que | Kéo sợi béo ngậy |
| Xúc xích Torpedo truyền thống | 12.000đ | Que | Đậm vị thịt |
| Xúc xích Sumo | 13.000đ | Xiên | Cây to chắc thịt |
| Khoai tây lắc phô mai | 16.000đ | Phần | Thơm lừng vị phô mai |
| Hotdog Phô mai tẩm khoai tây | 16.000đ | Que | Vỏ khoai tây giòn |
`;

    // 1. Customer asks about sausages specifically
    const sausageReply = formatSmartKnowledgeReply(
      'Xúc xích bao nhiêu cây?',
      sampleTable,
      'Five Star - 41 Trần Phú',
      'Mr Bửu'
    );

    // Should include sausage items
    expect(sausageReply).toContain('Xúc xích Phô mai');
    expect(sausageReply).toContain('9.000đ');
    expect(sausageReply).toContain('Xúc xích Torpedo');
    expect(sausageReply).toContain('Xúc xích Sumo');

    // Should NOT include unrelated items or fabricate unconfigured upsells
    expect(sausageReply).not.toContain('Cá viên');
    expect(sausageReply).not.toContain('Bò viên');
    expect(sausageReply).not.toContain('Khoai tây lắc');
    expect(sausageReply).not.toContain('Xốt phô mai');

    // 1.1 Customer asks "giá gà của cửa hàng?" (Fuzzy keyword match across all chicken products)
    const chickenGeneralReply = formatSmartKnowledgeReply(
      'giá gà của cửa hàng?',
      sampleTable,
      'Five Star - 41 Trần Phú',
      'Mr Bửu'
    );
    expect(chickenGeneralReply).toContain('Gà giòn truyền thống');
    expect(chickenGeneralReply).toContain('Gà giòn cay');
    expect(chickenGeneralReply).toContain('Gà giòn giòn');
    expect(chickenGeneralReply).toContain('Cánh gà chiên nước mắm');
    expect(chickenGeneralReply).not.toContain('Cá viên');
    expect(chickenGeneralReply).not.toContain('Xúc xích');

    // 1.2 Customer asks "giá gà giòn?" (Fuzzy match "gà giòn giòn", "gà giòn truyền thống", "gà giòn cay")
    const crispyChickenReply = formatSmartKnowledgeReply(
      'giá gà giòn?',
      sampleTable,
      'Five Star - 41 Trần Phú',
      'Mr Bửu'
    );
    expect(crispyChickenReply).toContain('Gà giòn giòn');
    expect(crispyChickenReply).toContain('Gà giòn truyền thống');
    expect(crispyChickenReply).toContain('Gà giòn cay');
    expect(crispyChickenReply).not.toContain('Cá viên');
    expect(crispyChickenReply).not.toContain('Bò viên');

    // 1.3 Customer asks "gà giòn giòn"
    const superCrispyReply = formatSmartKnowledgeReply(
      'gà giòn giòn',
      sampleTable,
      'Five Star - 41 Trần Phú',
      'Mr Bửu'
    );
    expect(superCrispyReply).toContain('Gà giòn giòn');
    expect(superCrispyReply).toContain('35.000đ');

    // 2. Customer asks for full menu
    const menuReply = formatSmartKnowledgeReply(
      'Cho mình xem menu quán',
      sampleTable,
      'Five Star - 41 Trần Phú',
      'Mr Bửu'
    );

    expect(menuReply).toContain('Thực đơn đầy đủ');
    expect(menuReply).toContain('Cá viên');
    expect(menuReply).toContain('Xúc xích Phô mai');
    expect(menuReply).not.toContain('0986.000.797');

    // 3. Customer only asks about opening hours (Must NOT leak brand positioning or full menu)
    const rawDocumentWithInternalNotes = `
KHO TRI THỨC & QUY TẮC VẬN HÀNH: GÀ RÁN FIVE STAR - 41 TRẦN PHÚ
1. THÔNG TIN CỬA HÀNG & LIÊN HỆ
- Tên thương hiệu: Gà rán Five Star - 41 Trần Phú.
- Địa chỉ: Số 41 Trần Phú, Phường Phước Hậu, tỉnh Vĩnh Long.
- Bản đồ chỉ đường (Google Maps): https://maps.app.goo.gl/4PXdHdTtxRucwdvR6
- Giờ mở cửa: 08:00 – 21:00 hằng ngày (Mở cửa xuyên suốt cả tuần).
- Hotline / Zalo Quản lý: 0986.000.797.
- Kênh đặt hàng trực tuyến: ShopeeFood, GrabFood.

2. ĐỊNH VỊ THƯƠNG HIỆU & PHONG CÁCH GIAO TIẾP
- Giọng điệu của Bot: Vui vẻ, gần gũi.
- Khi xử lý khiếu nại: Chuyển ngay sang thái độ nghiêm túc.

3. THỰC ĐƠN & BẢNG GIÁ NIÊM YẾT
| Tên món | Giá bán |
| Gà rán giòn | 32.000đ |
`;

    const hoursReply = formatSmartKnowledgeReply(
      'giờ mở cửa của cửa hàng?',
      rawDocumentWithInternalNotes,
      'Five Star - 41 Trần Phú',
      'Mr Bửu'
    );

    expect(hoursReply).toContain('08:00 – 21:00');
    expect(hoursReply).not.toContain('ĐỊNH VỊ THƯƠNG HIỆU');
    expect(hoursReply).not.toContain('Giọng điệu của Bot');
    expect(hoursReply).not.toContain('Khi xử lý khiếu nại');
    expect(hoursReply).not.toContain('THỰC ĐƠN & BẢNG GIÁ');

    // 4. Customer asks about address
    const addressReply = formatSmartKnowledgeReply(
      'quán ở đâu vậy em?',
      rawDocumentWithInternalNotes,
      'Five Star - 41 Trần Phú',
      'Mr Bửu'
    );

    expect(addressReply).toContain('41 Trần Phú');
    expect(addressReply).not.toContain('ĐỊNH VỊ THƯƠNG HIỆU');
    expect(addressReply).not.toContain('THỰC ĐƠN & BẢNG GIÁ');
  });

  it('supports commercial billing: plans, vietqr invoice creation & payment confirmation', async () => {
    const { signJwt } = await import('./auth.js');
    const jwtToken = await signJwt(
      {
        id: 'user_1',
        email: 'admin@knm.asia',
        role: 'tenant_admin',
        tenant_id: 'tenant_1',
      },
      env.JWT_SECRET
    );

    // 1. Get plans
    const plansRes = await app.request(
      '/v1/billing/plans',
      {
        headers: { Authorization: `Bearer ${jwtToken}` },
      },
      env
    );
    expect(plansRes.status).toBe(200);
    const plansData = (await plansRes.json()) as { ok: boolean; plans: { id: string }[] };
    expect(plansData.ok).toBe(true);
    expect(plansData.plans.length).toBeGreaterThanOrEqual(2);

    // 2. Create VietQR Payment Invoice
    const createRes = await app.request(
      '/v1/billing/create-payment',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan_id: 'pro' }),
      },
      env
    );
    expect(createRes.status).toBe(200);
    const invoiceData = (await createRes.json()) as {
      ok: boolean;
      invoice: {
        invoice_id: string;
        amount_vnd: number;
        vietqr_url: string;
        transfer_content: string;
      };
    };
    expect(invoiceData.ok).toBe(true);
    expect(invoiceData.invoice.vietqr_url).toContain('vietqr.io');
    expect(invoiceData.invoice.transfer_content).toContain('ZALOBAAS');

    // 3. Confirm payment
    const confirmRes = await app.request(
      '/v1/billing/confirm-payment',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ invoice_id: invoiceData.invoice.invoice_id }),
      },
      env
    );
    expect(confirmRes.status).toBe(200);
    const confirmData = (await confirmRes.json()) as { ok: boolean; plan_id: string };
    expect(confirmData.ok).toBe(true);
    expect(confirmData.plan_id).toBe('pro');
  });

  it('supports CRM customer listing and profile update', async () => {
    const { signJwt } = await import('./auth.js');
    const jwtToken = await signJwt(
      {
        id: 'user_1',
        email: 'admin@knm.asia',
        role: 'tenant_admin',
        tenant_id: 'tenant_1',
      },
      env.JWT_SECRET
    );

    // 1. List customers
    const listRes = await app.request(
      '/v1/customers',
      {
        headers: { Authorization: `Bearer ${jwtToken}` },
      },
      env
    );
    expect(listRes.status).toBe(200);
    const listData = (await listRes.json()) as { ok: boolean; customers: { id: string }[] };
    expect(listData.ok).toBe(true);
    expect(listData.customers.length).toBeGreaterThanOrEqual(1);

    // 2. Update customer tags and notes
    const updateRes = await app.request(
      '/v1/customers/conv_1',
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: '0986000797',
          tags: ['VIP', 'Khách ruột'],
          notes: 'Ăn gà cay lúc 11h trưa',
        }),
      },
      env
    );
    expect(updateRes.status).toBe(200);
    const updateData = (await updateRes.json()) as { ok: boolean; customer: { phone: string } };
    expect(updateData.ok).toBe(true);
    expect(updateData.customer.phone).toBe('0986000797');
  });

  it('supports knowledge full content retrieval and document update', async () => {
    const { signJwt } = await import('./auth.js');
    const jwtToken = await signJwt(
      {
        id: 'user_1',
        email: 'admin@knm.asia',
        role: 'tenant_admin',
        tenant_id: 'tenant_1',
      },
      env.JWT_SECRET
    );

    // 1. Get reconstructed content from chunks
    const contentRes = await app.request(
      '/v1/documents/doc_1/content',
      {
        headers: { Authorization: `Bearer ${jwtToken}` },
      },
      env
    );
    expect(contentRes.status).toBe(200);
    const contentData = (await contentRes.json()) as { ok: boolean; content: string };
    expect(contentData.ok).toBe(true);
    expect(contentData.content).toContain('Five Star 41 Trần Phú');

    // 2. Update document title and scope
    const patchRes = await app.request(
      '/v1/documents/doc_1',
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Bảng giá mới 2026',
          scope: 'all',
        }),
      },
      env
    );
    expect(patchRes.status).toBe(200);
    const patchData = (await patchRes.json()) as { ok: boolean };
    expect(patchData.ok).toBe(true);
  });

  it('supports tenant-wide analytics overview and instant free trial activation', async () => {
    const { signJwt } = await import('./auth.js');
    const jwtToken = await signJwt(
      {
        id: 'user_1',
        email: 'admin@knm.asia',
        role: 'tenant_admin',
        tenant_id: 'tenant_1',
      },
      env.JWT_SECRET
    );

    // 1. Get tenant analytics overview
    const overviewRes = await app.request(
      '/v1/analytics/overview',
      {
        headers: { Authorization: `Bearer ${jwtToken}` },
      },
      env
    );
    expect(overviewRes.status).toBe(200);
    const overviewData = (await overviewRes.json()) as {
      ok: boolean;
      usage: { ai_messages: number; quota_percent: number };
      plan: { name: string; monthly_limit: number };
    };
    expect(overviewData.ok).toBe(true);
    expect(overviewData.plan.name).toBe('Starter');
    expect(overviewData.usage.quota_percent).toBeGreaterThanOrEqual(0);

    // 2. Activate free 7-day trial without VietQR
    const trialRes = await app.request(
      '/v1/billing/create-payment',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan_id: 'trial' }),
      },
      env
    );
    expect(trialRes.status).toBe(200);
    const trialData = (await trialRes.json()) as {
      ok: boolean;
      trial_activated: boolean;
      plan_id: string;
    };
    expect(trialData.ok).toBe(true);
    expect(trialData.trial_activated).toBe(true);
    expect(trialData.plan_id).toBe('trial');
  });

  it('keeps non-F&B bots (Zalo BaaS SaaS) strictly domain-isolated without restaurant leakage', async () => {
    const { formatSmartKnowledgeReply } = await import('./routes/webhook.js');
    const { buildSystemInstruction } = await import('@zalo-baas/llm');

    const saasDoc = `
# Tài liệu Chăm sóc Khách hàng Zalo BaaS

## 1. Tính năng nổi bật của Zalo BaaS
- Kết nối Zalo Bot nhanh trong 10 giây qua Webhook.
- Kho tri thức RAG tách riêng cho từng Bot, chống ảo giác Strictly Grounded.
- Hộp thư hội thoại Live Chat & chuyển giao nhân viên CSKH tự động.

## 2. Bảng giá gói cước Zalo BaaS
| Gói cước | Giá bán | Đơn vị | Ghi chú |
| Dùng thử | 0đ | 7 ngày | Tối đa 1 Bot, 1.000 tin nhắn AI |
| Gói Starter | 99.000đ | tháng | Tối đa 1 Zalo Bot, 3.000 tin nhắn AI |
| Gói Pro | 299.000đ | tháng | Tối đa 3 Zalo Bot, 15.000 tin nhắn AI |
| Gói Enterprise | 499.000đ | tháng | Tối đa 5 Zalo Bot, 50.000 tin nhắn AI |
`;

    // Query 1: Ask about features
    const featureReply = formatSmartKnowledgeReply(
      'giới thiệu tính năng?',
      saasDoc,
      'Zalo BaaS - Chăm sóc khách hàng',
      'Mr Bửu Vĩnh Long'
    );
    expect(featureReply).toContain('Zalo BaaS - Chăm sóc khách hàng');
    expect(featureReply).toContain('Kho tri thức RAG tách riêng cho từng Bot');
    expect(featureReply).not.toContain('bảng giá của quán');
    expect(featureReply).not.toContain('0986.000.797');
    expect(featureReply).not.toContain('🍗');

    // Query 2: Ask about Starter package price
    const starterReply = formatSmartKnowledgeReply(
      'giá gói Starter?',
      saasDoc,
      'Zalo BaaS - Chăm sóc khách hàng',
      'Mr Bửu Vĩnh Long'
    );
    expect(starterReply).toContain('Gói Starter');
    expect(starterReply).toContain('99.000đ');
    expect(starterReply).not.toContain('tại quán');
    expect(starterReply).not.toContain('Xốt phô mai');
    expect(starterReply).not.toContain('🍗');

    // Query 3: Ask about an unmentioned item -> clean domain-neutral fallback
    const missingReply = formatSmartKnowledgeReply(
      'giá gói VIP Platinum?',
      saasDoc,
      'Zalo BaaS - Chăm sóc khách hàng',
      'Mr Bửu Vĩnh Long'
    );
    expect(missingReply).toContain('Zalo BaaS - Chăm sóc khách hàng');
    expect(missingReply).not.toContain('món "');
    expect(missingReply).not.toContain('trong bảng giá của quán');
    expect(missingReply).not.toContain('menu');
    expect(missingReply).not.toContain('0986.000.797');
    expect(missingReply).not.toContain('🍗');

    // System prompt must never contain hardcoded fried chicken examples
    const sysPrompt = buildSystemInstruction({
      botName: 'Zalo BaaS - Chăm sóc khách hàng',
      strictGrounding: true,
    });
    expect(sysPrompt).toContain('Zalo BaaS - Chăm sóc khách hàng');
    expect(sysPrompt).not.toContain('Gà giòn');
    expect(sysPrompt).not.toContain('ShopeeFood');
    expect(sysPrompt).not.toContain('Xúc xích');
  });

  it('builds RFC-compliant SMTP MIME payloads and strips Gmail App Password whitespace', async () => {
    const {
      encodeMimeWord,
      wrapBase64Lines,
      normalizeSmtpPassword,
      buildSmtpMimePayload,
    } = await import('./services/email.js');

    expect(normalizeSmtpPassword('abcd efgh ijkl mnop')).toBe('abcdefghijklmnop');

    const encodedFrom = encodeMimeWord('Zalo BaaS - Kỹ Năng Mềm');
    expect(encodedFrom).toMatch(/^=\?UTF-8\?B\?.+\?=$/);

    const longB64 = 'A'.repeat(200);
    const wrapped = wrapBase64Lines(longB64, 76);
    const lines = wrapped.split('\r\n');
    expect(lines.length).toBe(3);
    expect(lines[0].length).toBe(76);
    expect(lines[2].length).toBe(48);

    const payload = buildSmtpMimePayload({
      from: 'congtykynangmem@gmail.com',
      fromName: 'Zalo BaaS - Kỹ Năng Mềm',
      to: 'customer@example.com',
      subject: 'Xác nhận thanh toán',
      html: '<p>' + 'Noi dung thanh toan '.repeat(20) + '</p>',
    });
    expect(payload).toContain('From: =?UTF-8?B?');
    expect(payload).toContain('<congtykynangmem@gmail.com>');
    expect(payload).toContain('To: <customer@example.com>');
    expect(payload).toContain('\r\n.\r\n');
  });
});
