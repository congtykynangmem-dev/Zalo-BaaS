// apps/control-api/src/routes/billing.ts
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { authMiddleware, requireRole } from '../auth.js';
import type { Env, HonoVariables } from '../types.js';

export const billingRouter = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

billingRouter.use('*', authMiddleware);

// Bank account configuration for VietQR (Standard Napas 247)
const BANK_CONFIG = {
  bank_id: 'MB', // MBBank
  account_no: '0986000797',
  account_name: 'CONG TY KY NANG MEM',
};

// 1. Get all available plans
billingRouter.get('/plans', async (c) => {
  const plans = await c.env.DB.prepare(
    'SELECT id, name, price_vnd, max_bots, monthly_ai_messages, max_documents, max_doc_mb, features FROM plans ORDER BY price_vnd ASC'
  ).bind().all<{
    id: string;
    name: string;
    price_vnd: number;
    max_bots: number;
    monthly_ai_messages: number;
    max_documents: number;
    max_doc_mb: number;
    features: string;
  }>();

  const formattedPlans = (plans?.results || []).map((p) => {
    let parsedFeatures: Record<string, boolean> = {};
    try {
      parsedFeatures = JSON.parse(p.features);
    } catch {}
    return {
      ...p,
      features: parsedFeatures,
    };
  });

  return c.json({ ok: true, plans: formattedPlans });
});

// 2. Get current tenant subscription & quota usage
billingRouter.get('/subscription', async (c) => {
  const user = c.get('user');
  const tenantId = user.tenant_id;

  let tenant = null;
  if (tenantId) {
    tenant = await c.env.DB.prepare(`
      SELECT t.id, t.name, t.plan_id, t.status, t.created_at,
             t.subscription_started_at, t.subscription_expires_at, t.payment_status,
             COALESCE(p.name, UPPER(t.plan_id)) as plan_name,
             COALESCE(p.price_vnd, 99000) as price_vnd,
             COALESCE(p.max_bots, 1) as max_bots,
             COALESCE(p.monthly_ai_messages, 3000) as monthly_ai_messages,
             COALESCE(p.max_documents, 10) as max_documents
      FROM tenants t
      LEFT JOIN plans p ON LOWER(t.plan_id) = LOWER(p.id)
      WHERE t.id = ?
    `)
      .bind(tenantId)
      .first<{
        id: string;
        name: string;
        plan_id: string;
        status: string;
        created_at: number;
        subscription_started_at?: number | null;
        subscription_expires_at?: number | null;
        payment_status?: string | null;
        plan_name: string;
        price_vnd: number;
        max_bots: number;
        monthly_ai_messages: number;
        max_documents: number;
      }>();
  }

  // Safe fallback if tenant is missing or user has no tenant_id
  const effectiveTenant = tenant || {
    id: tenantId || 'tenant_default',
    name: 'Doanh nghiệp',
    plan_id: 'starter',
    status: 'active',
    created_at: Date.now(),
    subscription_started_at: Date.now(),
    subscription_expires_at: Date.now() + 2592000000,
    payment_status: 'paid',
    plan_name: 'Starter',
    price_vnd: 99000,
    max_bots: 1,
    monthly_ai_messages: 3000,
    max_documents: 10,
  };

  const now = Date.now();
  const expiresAt = effectiveTenant.subscription_expires_at || (effectiveTenant.created_at + 2592000000);
  const daysLeft = Math.ceil((expiresAt - now) / 86400000);

  // Count current bots
  const botCount = await c.env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM bots WHERE tenant_id = ? AND status != 'deleted'"
  )
    .bind(effectiveTenant.id)
    .first<{ cnt: number }>();

  // Count current documents
  const docCount = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM documents WHERE tenant_id = ?'
  )
    .bind(effectiveTenant.id)
    .first<{ cnt: number }>();

  // Count monthly AI messages
  const usage = await c.env.DB.prepare(`
    SELECT SUM(ai_messages) as total_ai
    FROM usage_daily
    WHERE tenant_id = ?
  `)
    .bind(effectiveTenant.id)
    .first<{ total_ai: number | null }>();

  const currentBots = botCount?.cnt || 0;
  const currentDocs = docCount?.cnt || 0;
  const currentAiMsgs = usage?.total_ai || 0;

  const botsQuota = {
    current: currentBots,
    max: effectiveTenant.max_bots,
    percent: Math.min(100, Math.round((currentBots / effectiveTenant.max_bots) * 100)),
  };

  const docsQuota = {
    current: currentDocs,
    max: effectiveTenant.max_documents,
    percent: Math.min(100, Math.round((currentDocs / effectiveTenant.max_documents) * 100)),
  };

  const aiQuota = {
    current: currentAiMsgs,
    max: effectiveTenant.monthly_ai_messages,
    percent: Math.min(100, Math.round((currentAiMsgs / effectiveTenant.monthly_ai_messages) * 100)),
  };

  return c.json({
    ok: true,
    subscription: {
      plan_id: effectiveTenant.plan_id.toLowerCase(),
      plan_name: effectiveTenant.plan_name,
      price_vnd: effectiveTenant.price_vnd,
      status: effectiveTenant.status,
      subscription_started_at: effectiveTenant.subscription_started_at || null,
      subscription_expires_at: expiresAt,
      payment_status: effectiveTenant.payment_status || 'paid',
      days_left: daysLeft,
      is_expired: daysLeft <= 0,
      bots: botsQuota,
      documents: docsQuota,
      ai_messages: aiQuota,
      usage: {
        bots: botsQuota,
        documents: docsQuota,
        ai_messages: aiQuota,
      },
    },
  });
});

// 3. Create payment invoice & generate VietQR code
billingRouter.post(
  '/create-payment',
  requireRole(['tenant_admin', 'platform_owner']),
  async (c) => {
    const user = c.get('user');
    if (!user.tenant_id) {
      return c.json({ error: 'Tenant không hợp lệ' }, 400);
    }
    const tenantId = user.tenant_id;
    const body = await c.req.json<{ plan_id?: string }>();

    if (!body.plan_id) {
      return c.json({ error: 'Vui lòng chọn gói cước cần nâng cấp' }, 400);
    }

    const plan = await c.env.DB.prepare('SELECT id, name, price_vnd FROM plans WHERE id = ?')
      .bind(body.plan_id)
      .first<{ id: string; name: string; price_vnd: number }>();

    if (!plan) {
      return c.json({ error: 'Gói cước không hợp lệ' }, 404);
    }

    // If free / trial plan (price is 0), activate immediately without payment
    if (plan.price_vnd === 0) {
      const now = Date.now();
      const trialExpiresAt = now + 7 * 86400 * 1000;
      await c.env.DB.prepare(
        'UPDATE tenants SET plan_id = ?, status = ?, payment_status = ?, subscription_started_at = COALESCE(subscription_started_at, ?), subscription_expires_at = ? WHERE id = ?'
      )
        .bind(plan.id, 'active', 'trial', now, trialExpiresAt, tenantId)
        .run();
      return c.json({
        ok: true,
        trial_activated: true,
        message: 'Kích hoạt gói Dùng thử 7 ngày thành công!',
        plan_id: plan.id,
      });
    }

    const invoiceId = `inv_${nanoid(16)}`;
    const now = Date.now();
    // Unique transfer content: ZALOBAAS <short_tenant_id> <short_inv>
    const shortCode = tenantId.replace(/^tenant_/, '').slice(0, 6).toUpperCase();
    const shortInv = invoiceId.replace(/^inv_/, '').slice(0, 6).toUpperCase();
    const transferContent = `ZALOBAAS ${shortCode} ${shortInv}`;

    // Standard VietQR Image URL
    const encodedTransfer = encodeURIComponent(transferContent);
    const encodedAccountName = encodeURIComponent(BANK_CONFIG.account_name);
    const qrUrl = `https://img.vietqr.io/image/${BANK_CONFIG.bank_id}-${BANK_CONFIG.account_no}-compact2.png?amount=${plan.price_vnd}&addInfo=${encodedTransfer}&accountName=${encodedAccountName}`;

    // Ensure invoices table exists
    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        amount_vnd INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        payment_method TEXT NOT NULL DEFAULT 'vietqr',
        transfer_content TEXT NOT NULL,
        qr_url TEXT,
        created_at INTEGER NOT NULL,
        paid_at INTEGER
      )
    `).run();

    await c.env.DB.prepare(`
      INSERT INTO invoices (id, tenant_id, plan_id, amount_vnd, status, payment_method, transfer_content, qr_url, created_at)
      VALUES (?, ?, ?, ?, 'pending', 'vietqr', ?, ?, ?)
    `)
      .bind(invoiceId, tenantId, plan.id, plan.price_vnd, transferContent, qrUrl, now)
      .run();

    return c.json({
      ok: true,
      invoice: {
        id: invoiceId,
        invoice_id: invoiceId,
        plan_id: plan.id,
        plan_name: plan.name,
        amount_vnd: plan.price_vnd,
        transfer_content: transferContent,
        bank: BANK_CONFIG,
        qr_url: qrUrl,
        vietqr_url: qrUrl,
        created_at: now,
      },
    });
  }
);

// 4. Confirm payment & activate plan (Instant automatic upgrade)
billingRouter.post(
  '/confirm-payment',
  requireRole(['tenant_admin', 'platform_owner']),
  async (c) => {
    const user = c.get('user');
    const tenantId = user.tenant_id;
    const body = await c.req.json<{ invoice_id?: string }>();

    if (!body.invoice_id) {
      return c.json({ error: 'Mã hóa đơn là bắt buộc' }, 400);
    }

    const invoice = await c.env.DB.prepare(
      'SELECT id, plan_id, status FROM invoices WHERE id = ? AND tenant_id = ?'
    )
      .bind(body.invoice_id, tenantId)
      .first<{ id: string; plan_id: string; status: string }>();

    if (!invoice) {
      return c.json({ error: 'Hóa đơn không tồn tại' }, 404);
    }

    const now = Date.now();

    // 1. Update invoice to paid
    await c.env.DB.prepare('UPDATE invoices SET status = ?, paid_at = ? WHERE id = ?')
      .bind('paid', now, invoice.id)
      .run();

    // 2. Upgrade tenant plan immediately & update payment_status and subscription_expires_at
    const currentTenant = await c.env.DB.prepare('SELECT subscription_expires_at FROM tenants WHERE id = ?')
      .bind(tenantId)
      .first<{ subscription_expires_at?: number | null }>();

    const baseTime = currentTenant?.subscription_expires_at && currentTenant.subscription_expires_at > now
      ? currentTenant.subscription_expires_at
      : now;
    const newExpiresAt = baseTime + 30 * 86400 * 1000;

    await c.env.DB.prepare(
      'UPDATE tenants SET plan_id = ?, status = ?, payment_status = ?, subscription_started_at = COALESCE(subscription_started_at, ?), subscription_expires_at = ? WHERE id = ?'
    )
      .bind(invoice.plan_id, 'active', 'paid', now, newExpiresAt, tenantId)
      .run();

    return c.json({
      ok: true,
      message: 'Xác nhận thanh toán thành công! Gói cước của bạn đã được kích hoạt.',
      plan_id: invoice.plan_id,
    });
  }
);
