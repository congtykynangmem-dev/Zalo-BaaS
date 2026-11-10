// apps/control-api/src/routes/analytics.ts
import { Hono } from 'hono';
import { authMiddleware } from '../auth.js';
import type { Env, HonoVariables } from '../types.js';

export const analyticsRouter = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

analyticsRouter.use('*', authMiddleware);

// 1. Get bot statistics and quota consumption
analyticsRouter.get('/bots/:botId/stats', async (c) => {
  const user = c.get('user');
  const botId = c.req.param('botId');
  const tenantId = user.tenant_id;

  if (!tenantId) {
    return c.json({ error: 'Tenant context required' }, 400);
  }

  // 1.1. Verify bot belongs to tenant
  const bot = await c.env.DB.prepare('SELECT id, name FROM bots WHERE id = ? AND tenant_id = ?')
    .bind(botId, tenantId)
    .first<{ id: string; name: string }>();

  if (!bot) {
    return c.json({ error: 'Bot not found' }, 404);
  }

  // 1.2. Get tenant's plan quota
  const tenantRow = await c.env.DB.prepare(
    `SELECT t.plan_id, COALESCE(p.name, UPPER(t.plan_id)) as plan_name,
            COALESCE(p.monthly_ai_messages, 1000) as monthly_ai_messages,
            COALESCE(p.max_documents, 5) as max_documents
     FROM tenants t
     LEFT JOIN plans p ON LOWER(t.plan_id) = LOWER(p.id)
     WHERE t.id = ?`
  )
    .bind(tenantId)
    .first<{
      plan_id: string;
      plan_name: string;
      monthly_ai_messages: number;
      max_documents: number;
    }>();

  const monthlyLimit = tenantRow?.monthly_ai_messages ?? 1000;

  // 1.3. Calculate usage for current month (YYYY-MM-%)
  const currentMonthPrefix = new Date().toISOString().slice(0, 7); // e.g. "2026-11"

  const monthUsageRow = await c.env.DB.prepare(
    `SELECT 
       SUM(ai_messages) as total_ai_messages,
       SUM(tokens_in) as total_tokens_in,
       SUM(tokens_out) as total_tokens_out
     FROM usage_daily
     WHERE tenant_id = ? AND bot_id = ? AND day LIKE ?`
  )
    .bind(tenantId, botId, `${currentMonthPrefix}%`)
    .first<{
      total_ai_messages: number | null;
      total_tokens_in: number | null;
      total_tokens_out: number | null;
    }>();

  const currentMonthAiMessages = monthUsageRow?.total_ai_messages ?? 0;
  const currentMonthTokensIn = monthUsageRow?.total_tokens_in ?? 0;
  const currentMonthTokensOut = monthUsageRow?.total_tokens_out ?? 0;

  const quotaPercent = Math.min(
    100,
    Math.round((currentMonthAiMessages / monthlyLimit) * 100)
  );

  // 1.4. Daily breakdown for the last 30 days
  const dailyRows = await c.env.DB.prepare(
    `SELECT day, ai_messages, tokens_in, tokens_out
     FROM usage_daily
     WHERE tenant_id = ? AND bot_id = ?
     ORDER BY day DESC LIMIT 30`
  )
    .bind(tenantId, botId)
    .all<{
      day: string;
      ai_messages: number;
      tokens_in: number;
      tokens_out: number;
    }>();

  // 1.5. Overall conversation & handover counts
  const convCountRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as total_convs FROM conversations WHERE tenant_id = ? AND bot_id = ?'
  )
    .bind(tenantId, botId)
    .first<{ total_convs: number }>();

  const handoverCountRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as total_handovers FROM handovers h
     JOIN conversations c ON h.conversation_id = c.id
     WHERE h.tenant_id = ? AND c.bot_id = ?`
  )
    .bind(tenantId, botId)
    .first<{ total_handovers: number }>();

  // Gemini 2.5 Flash approximate cost estimation:
  // $0.075 per 1M input tokens, $0.30 per 1M output tokens
  const estimatedCostUsd =
    (currentMonthTokensIn * 0.075 + currentMonthTokensOut * 0.3) / 1_000_000;

  return c.json({
    bot: {
      id: bot.id,
      name: bot.name,
    },
    plan: {
      id: tenantRow?.plan_id ?? 'starter',
      name: tenantRow?.plan_name ?? 'Starter',
      monthly_limit: monthlyLimit,
    },
    usage: {
      current_month: currentMonthPrefix,
      ai_messages: currentMonthAiMessages,
      quota_percent: quotaPercent,
      tokens_in: currentMonthTokensIn,
      tokens_out: currentMonthTokensOut,
      estimated_cost_usd: Number(estimatedCostUsd.toFixed(4)),
      is_quota_exceeded: currentMonthAiMessages >= monthlyLimit,
      is_quota_warning: quotaPercent >= 80,
    },
    counts: {
      total_conversations: convCountRow?.total_convs ?? 0,
      total_handovers: handoverCountRow?.total_handovers ?? 0,
    },
    daily_breakdown: dailyRows?.results || [],
  });
});

// 2. Get tenant-wide analytics overview and quota consumption
analyticsRouter.get('/overview', async (c) => {
  const user = c.get('user');
  const tenantId = user.tenant_id;

  if (!tenantId) {
    return c.json({ error: 'Tenant context required' }, 400);
  }

  // 2.1. Get tenant's plan quota
  const tenantRow = await c.env.DB.prepare(
    `SELECT t.id, t.name, t.plan_id,
            COALESCE(p.name, UPPER(t.plan_id)) as plan_name,
            COALESCE(p.monthly_ai_messages, 1000) as monthly_ai_messages,
            COALESCE(p.max_bots, 1) as max_bots,
            COALESCE(p.max_documents, 5) as max_documents
     FROM tenants t
     LEFT JOIN plans p ON LOWER(t.plan_id) = LOWER(p.id)
     WHERE t.id = ?`
  )
    .bind(tenantId)
    .first<{
      id: string;
      name: string;
      plan_id: string;
      plan_name: string;
      monthly_ai_messages: number;
      max_bots: number;
      max_documents: number;
    }>()
    .catch(() => null);

  const monthlyLimit = tenantRow?.monthly_ai_messages ?? 1000;
  const maxBots = tenantRow?.max_bots ?? 1;
  const maxDocs = tenantRow?.max_documents ?? 5;

  // 2.2. Current counts
  const botCountRow = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM bots WHERE tenant_id = ? AND status != 'deleted'"
  )
    .bind(tenantId)
    .first<{ count: number }>()
    .catch(() => ({ count: 0 }));
  const botCount = botCountRow?.count ?? 0;

  const docCountRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM documents WHERE tenant_id = ?'
  )
    .bind(tenantId)
    .first<{ count: number }>()
    .catch(() => ({ count: 0 }));
  const docCount = docCountRow?.count ?? 0;

  // 2.3. Usage for current month
  const currentMonthPrefix = new Date().toISOString().slice(0, 7);

  const monthUsageRow = await c.env.DB.prepare(
    `SELECT 
       SUM(ai_messages) as total_ai_messages,
       SUM(tokens_in) as total_tokens_in,
       SUM(tokens_out) as total_tokens_out
     FROM usage_daily
     WHERE tenant_id = ? AND day LIKE ?`
  )
    .bind(tenantId, `${currentMonthPrefix}%`)
    .first<{
      total_ai_messages: number | null;
      total_tokens_in: number | null;
      total_tokens_out: number | null;
    }>()
    .catch(() => null);

  const currentMonthAiMessages = monthUsageRow?.total_ai_messages ?? 0;
  const currentMonthTokensIn = monthUsageRow?.total_tokens_in ?? 0;
  const currentMonthTokensOut = monthUsageRow?.total_tokens_out ?? 0;

  const quotaPercent = Math.min(
    100,
    Math.round((currentMonthAiMessages / monthlyLimit) * 100)
  );

  // 2.4. Daily breakdown for the last 30 days
  const dailyRows = await c.env.DB.prepare(
    `SELECT day, SUM(ai_messages) as ai_messages, SUM(tokens_in) as tokens_in, SUM(tokens_out) as tokens_out
     FROM usage_daily
     WHERE tenant_id = ?
     GROUP BY day
     ORDER BY day DESC LIMIT 30`
  )
    .bind(tenantId)
    .all<{
      day: string;
      ai_messages: number;
      tokens_in: number;
      tokens_out: number;
    }>()
    .catch(() => ({ results: [] }));

  // 2.5. Total conversations and handovers
  const convCountRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as total_convs FROM conversations WHERE tenant_id = ?'
  )
    .bind(tenantId)
    .first<{ total_convs: number }>()
    .catch(() => ({ total_convs: 0 }));

  const handoverCountRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as total_handovers FROM handovers WHERE tenant_id = ?'
  )
    .bind(tenantId)
    .first<{ total_handovers: number }>()
    .catch(() => ({ total_handovers: 0 }));

  const estimatedCostUsd =
    (currentMonthTokensIn * 0.075 + currentMonthTokensOut * 0.3) / 1_000_000;

  return c.json({
    ok: true,
    bot: {
      id: 'all',
      name: 'Toàn bộ Doanh nghiệp (Tổng quan)',
    },
    plan: {
      id: tenantRow?.plan_id ?? 'starter',
      name: tenantRow?.plan_name ?? 'Starter',
      monthly_limit: monthlyLimit,
    },
    resources: {
      bots: { current: botCount, max: maxBots },
      documents: { current: docCount, max: maxDocs },
    },
    usage: {
      current_month: currentMonthPrefix,
      ai_messages: currentMonthAiMessages,
      quota_percent: quotaPercent,
      tokens_in: currentMonthTokensIn,
      tokens_out: currentMonthTokensOut,
      estimated_cost_usd: Number(estimatedCostUsd.toFixed(4)),
      is_quota_exceeded: currentMonthAiMessages >= monthlyLimit,
      is_quota_warning: quotaPercent >= 80,
    },
    counts: {
      total_conversations: convCountRow?.total_convs ?? 0,
      total_handovers: handoverCountRow?.total_handovers ?? 0,
    },
    daily_breakdown: dailyRows?.results || [],
  });
});

