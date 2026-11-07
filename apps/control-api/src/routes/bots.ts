// apps/control-api/src/routes/bots.ts
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { encryptAesGcm, decryptAesGcm } from '@zalo-baas/crypto';
import { ZaloBotClient } from '@zalo-baas/zalo-bot-sdk';
import { KV_TTL, type BotCacheData } from '@zalo-baas/shared';
import { authMiddleware, requireRole } from '../auth.js';
import type { Env, HonoVariables } from '../types.js';

export const botsRouter = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// All bot management routes require auth
botsRouter.use('*', authMiddleware);

// 1. Connect new Zalo Bot (Automatic 10s Onboarding)
botsRouter.post('/connect', requireRole(['tenant_admin', 'platform_owner']), async (c) => {
  const user = c.get('user');
  if (!user.tenant_id) {
    return c.json({ error: 'Tenant context required' }, 400);
  }

  const body = await c.req.json<{
    bot_token?: string;
    system_prompt?: string;
    strict_grounding?: boolean;
    handover_keywords?: string[];
    handover_minutes?: number;
  }>();

  if (!body.bot_token || body.bot_token.trim() === '') {
    return c.json({ error: 'bot_token is required' }, 400);
  }

  const botToken = body.bot_token.trim();

  // 1.1. Test and verify bot token with Zalo Bot Platform
  const zaloClient = new ZaloBotClient(botToken);
  let profile;
  try {
    profile = await zaloClient.getMe();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid Bot Token';
    return c.json({ error: `Failed to verify Zalo Bot Token: ${message}` }, 400);
  }

  // 1.2. Generate unique identifiers and security secret
  const botId = `bot_${nanoid(16)}`;
  const secretTokenBytes = crypto.getRandomValues(new Uint8Array(16));
  const secretToken = Array.from(secretTokenBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const webhookBase = c.env.WEBHOOK_BASE_URL.replace(/\/+$/, '');
  const webhookUrl = `${webhookBase}/${botId}`;

  // 1.3. Auto-configure webhook with Zalo Bot Platform
  try {
    await zaloClient.setWebhook({
      url: webhookUrl,
      secret_token: secretToken,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to register webhook';
    return c.json({ error: `Zalo setWebhook failed: ${message}` }, 502);
  }

  // 1.4. Encrypt sensitive credentials with master key
  const botTokenEnc = await encryptAesGcm(botToken, c.env.KEK_V1);
  const secretTokenEnc = await encryptAesGcm(secretToken, c.env.KEK_V1);

  const now = Date.now();
  const botName = profile.name || 'Zalo Bot';
  const handoverKeywordsJson = body.handover_keywords
    ? JSON.stringify(body.handover_keywords)
    : null;

  // 1.5. Persist to D1
  await c.env.DB.prepare(
    `INSERT INTO bots (id, tenant_id, bot_type, name, zalo_bot_id, username, status, system_prompt, strict_grounding, handover_keywords, handover_minutes, created_at)
     VALUES (?, ?, 'zalo_bot', ?, ?, ?, 'active', ?, ?, ?, ?, ?)`
  )
    .bind(
      botId,
      user.tenant_id,
      botName,
      profile.id,
      profile.username ?? null,
      body.system_prompt ?? null,
      body.strict_grounding ? 1 : 0,
      handoverKeywordsJson,
      body.handover_minutes ?? 30,
      now
    )
    .run();

  await c.env.DB.prepare(
    `INSERT INTO bot_credentials (bot_id, tenant_id, bot_token_enc, secret_token_enc, created_at)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(botId, user.tenant_id, botTokenEnc, secretTokenEnc, now)
    .run();

  // 1.6. Populate KV cache
  const cacheData: BotCacheData = {
    bot_id: botId,
    tenant_id: user.tenant_id,
    status: 'active',
    secret_token: secretToken,
    bot_token: botToken,
  };

  await c.env.KV_CACHE.put(`bot:${botId}`, JSON.stringify(cacheData), {
    expirationTtl: KV_TTL.BOT_CACHE_SECONDS,
  });

  return c.json({
    ok: true,
    bot: {
      id: botId,
      name: botName,
      zalo_bot_id: profile.id,
      username: profile.username,
      status: 'active',
      webhook_url: webhookUrl,
      created_at: now,
    },
  });
});

// 2. List all bots for current tenant
botsRouter.get('/', async (c) => {
  const user = c.get('user');
  const tenantId = user.tenant_id;

  const result = await c.env.DB.prepare(
    `SELECT id, name, zalo_bot_id, username, status, system_prompt, strict_grounding, handover_minutes, created_at
     FROM bots WHERE tenant_id = ? ORDER BY created_at DESC`
  )
    .bind(tenantId)
    .all();

  return c.json({ bots: result.results });
});

// 3. Get single bot details
botsRouter.get('/:id', async (c) => {
  const user = c.get('user');
  const botId = c.req.param('id');

  const bot = await c.env.DB.prepare(
    `SELECT id, name, zalo_bot_id, username, status, system_prompt, strict_grounding, handover_keywords, handover_minutes, created_at
     FROM bots WHERE id = ? AND tenant_id = ?`
  )
    .bind(botId, user.tenant_id)
    .first();

  if (!bot) {
    return c.json({ error: 'Bot not found' }, 404);
  }

  const webhookBase = c.env.WEBHOOK_BASE_URL.replace(/\/+$/, '');
  return c.json({
    bot: {
      ...bot,
      webhook_url: `${webhookBase}/${botId}`,
    },
  });
});

// 4. Update bot configuration
botsRouter.patch('/:id', requireRole(['tenant_admin', 'platform_owner']), async (c) => {
  const user = c.get('user');
  const botId = c.req.param('id');
  const body = await c.req.json<{
    name?: string;
    system_prompt?: string;
    strict_grounding?: boolean;
    handover_keywords?: string[];
    handover_minutes?: number;
  }>();

  const bot = await c.env.DB.prepare('SELECT id FROM bots WHERE id = ? AND tenant_id = ?')
    .bind(botId, user.tenant_id)
    .first();

  if (!bot) {
    return c.json({ error: 'Bot not found' }, 404);
  }

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.name !== undefined) {
    updates.push('name = ?');
    params.push(body.name);
  }
  if (body.system_prompt !== undefined) {
    updates.push('system_prompt = ?');
    params.push(body.system_prompt);
  }
  if (body.strict_grounding !== undefined) {
    updates.push('strict_grounding = ?');
    params.push(body.strict_grounding ? 1 : 0);
  }
  if (body.handover_keywords !== undefined) {
    updates.push('handover_keywords = ?');
    params.push(JSON.stringify(body.handover_keywords));
  }
  if (body.handover_minutes !== undefined) {
    updates.push('handover_minutes = ?');
    params.push(body.handover_minutes);
  }

  if (updates.length > 0) {
    params.push(botId, user.tenant_id);
    await c.env.DB.prepare(
      `UPDATE bots SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`
    )
      .bind(...params)
      .run();

    // Evict KV cache to refresh on next request
    await c.env.KV_CACHE.delete(`bot:${botId}`);
  }

  return c.json({ ok: true, message: 'Bot updated successfully' });
});

// 5. Pause bot
botsRouter.post('/:id/pause', requireRole(['tenant_admin', 'platform_owner']), async (c) => {
  const user = c.get('user');
  const botId = c.req.param('id');

  await c.env.DB.prepare("UPDATE bots SET status = 'paused' WHERE id = ? AND tenant_id = ?")
    .bind(botId, user.tenant_id)
    .run();

  await c.env.KV_CACHE.delete(`bot:${botId}`);
  return c.json({ ok: true, status: 'paused' });
});

// 6. Resume bot
botsRouter.post('/:id/resume', requireRole(['tenant_admin', 'platform_owner']), async (c) => {
  const user = c.get('user');
  const botId = c.req.param('id');

  await c.env.DB.prepare("UPDATE bots SET status = 'active' WHERE id = ? AND tenant_id = ?")
    .bind(botId, user.tenant_id)
    .run();

  await c.env.KV_CACHE.delete(`bot:${botId}`);
  return c.json({ ok: true, status: 'active' });
});

// 7. Delete bot
botsRouter.delete('/:id', requireRole(['tenant_admin', 'platform_owner']), async (c) => {
  const user = c.get('user');
  const botId = c.req.param('id');

  // Try to remove webhook on Zalo
  const credRow = await c.env.DB.prepare(
    'SELECT bot_token_enc FROM bot_credentials WHERE bot_id = ? AND tenant_id = ?'
  )
    .bind(botId, user.tenant_id)
    .first<{ bot_token_enc: ArrayBuffer }>();

  if (credRow?.bot_token_enc) {
    try {
      const token = await decryptAesGcm(new Uint8Array(credRow.bot_token_enc), c.env.KEK_V1);
      const zaloClient = new ZaloBotClient(token);
      await zaloClient.deleteWebhook();
    } catch {
      // ignore
    }
  }

  await c.env.DB.prepare('DELETE FROM bots WHERE id = ? AND tenant_id = ?')
    .bind(botId, user.tenant_id)
    .run();

  await c.env.KV_CACHE.delete(`bot:${botId}`);
  return c.json({ ok: true, message: 'Bot deleted' });
});

