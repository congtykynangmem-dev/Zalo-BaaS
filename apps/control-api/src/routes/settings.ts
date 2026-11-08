// apps/control-api/src/routes/settings.ts
import { Hono } from 'hono';
import { authMiddleware, requireRole } from '../auth.js';
import type { Env, HonoVariables } from '../types.js';

export const settingsRouter = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

settingsRouter.use('*', authMiddleware);

// 1. Get AI settings status (is Gemini API key configured?)
settingsRouter.get('/ai', async (c) => {
  const user = c.get('user');

  let dbKey = '';
  try {
    const row = await c.env.DB.prepare(
      'SELECT gemini_api_key FROM tenant_settings WHERE tenant_id = ?'
    )
      .bind(user.tenant_id)
      .first<{ gemini_api_key: string }>();
    dbKey = row?.gemini_api_key || '';
  } catch {}

  const activeKey = dbKey || c.env.GEMINI_API_KEY || '';
  const configured = Boolean(activeKey && activeKey.trim());

  let maskedKey = '';
  if (configured) {
    const clean = activeKey.trim();
    maskedKey = clean.length > 8 ? `${clean.slice(0, 4)}...${clean.slice(-4)}` : '••••••••';
  }

  return c.json({
    configured,
    masked_key: maskedKey,
    source: dbKey ? 'tenant_custom' : (c.env.GEMINI_API_KEY ? 'system_env' : 'none'),
  });
});

// 2. Update AI settings (save Gemini API key for tenant)
settingsRouter.post('/ai', requireRole(['tenant_admin', 'platform_owner']), async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ gemini_api_key?: string }>();

  if (!body.gemini_api_key || !body.gemini_api_key.trim()) {
    return c.json({ error: 'Vui lòng cung cấp Gemini API Key' }, 400);
  }

  const apiKey = body.gemini_api_key.trim();
  const now = Date.now();

  try {
    // Ensure table exists
    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS tenant_settings (
        tenant_id TEXT PRIMARY KEY,
        gemini_api_key TEXT,
        updated_at INTEGER
      )
    `).run();

    await c.env.DB.prepare(
      `INSERT INTO tenant_settings (tenant_id, gemini_api_key, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(tenant_id) DO UPDATE SET
         gemini_api_key = excluded.gemini_api_key,
         updated_at = excluded.updated_at`
    )
      .bind(user.tenant_id, apiKey, now)
      .run();

    const masked = apiKey.length > 8 ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : '••••••••';
    return c.json({ ok: true, masked_key: masked });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Lưu cấu hình thất bại: ${msg}` }, 500);
  }
});
