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

    // Should NOT include unrelated items
    expect(sausageReply).not.toContain('Cá viên');
    expect(sausageReply).not.toContain('Bò viên');
    expect(sausageReply).not.toContain('Khoai tây lắc');

    // Should include upsell suggestion
    expect(sausageReply).toContain('Gợi ý thêm');

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
    expect(menuReply).toContain('Đặt hàng giao tận nơi');
  });
});
