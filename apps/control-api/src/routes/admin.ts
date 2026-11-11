// apps/control-api/src/routes/admin.ts
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { authMiddleware, requireRole, hashPassword } from '../auth.js';
import {
  getSystemSettings,
  sendPaymentSuccessEmail,
  DEFAULT_CONTACT_SETTINGS,
  DEFAULT_BANK_SETTINGS,
  DEFAULT_EMAIL_CONFIG,
} from '../services/email.js';
import type { Env, HonoVariables } from '../types.js';

export const adminRouter = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// Only platform_owner can access /v1/admin routes
adminRouter.use('*', authMiddleware, requireRole(['platform_owner']));

// 1. System Overview Metrics
adminRouter.get('/overview', async (c) => {
  try {
    const tenantsCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM tenants').bind().first<{ count: number }>().catch(() => ({ count: 0 }));
    const usersCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').bind().first<{ count: number }>().catch(() => ({ count: 0 }));
    const botsCount = await c.env.DB.prepare("SELECT COUNT(*) as count FROM bots WHERE status = 'active'").bind().first<{ count: number }>().catch(() => ({ count: 0 }));
    const docsCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM documents').bind().first<{ count: number }>().catch(() => ({ count: 0 }));
    const totalAi = await c.env.DB.prepare('SELECT SUM(ai_messages) as total FROM usage_daily').bind().first<{ total: number | null }>().catch(() => ({ total: 0 }));

    // Revenue estimation
    const revenueRow = await c.env.DB.prepare(`
      SELECT SUM(p.price_vnd) as monthly_revenue
      FROM tenants t
      JOIN plans p ON LOWER(t.plan_id) = LOWER(p.id)
      WHERE t.status = 'active' AND p.price_vnd > 0
    `).bind().first<{ monthly_revenue: number | null }>().catch(() => ({ monthly_revenue: 0 }));

    return c.json({
      ok: true,
      stats: {
        total_tenants: tenantsCount?.count || 0,
        total_users: usersCount?.count || 0,
        total_active_bots: botsCount?.count || 0,
        total_documents: docsCount?.count || 0,
        total_ai_messages: totalAi?.total || 0,
        monthly_revenue_vnd: revenueRow?.monthly_revenue || 0,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({
      ok: true,
      stats: {
        total_tenants: 0,
        total_users: 0,
        total_active_bots: 0,
        total_documents: 0,
        total_ai_messages: 0,
        monthly_revenue_vnd: 0,
      },
      warning: msg,
    });
  }
});

// 2. List All Tenants with Detailed Quota & Stats
adminRouter.get('/tenants', async (c) => {
  try {
    // Auto-heal any registered user whose tenant record might be missing
    await c.env.DB.prepare(`
      INSERT OR IGNORE INTO tenants (id, name, plan_id, status, contact_email, created_at)
      SELECT u.tenant_id,
             CASE WHEN u.email = 'fivestarkimky@gmail.com' THEN 'Gà rán Five Star Kim Kỳ' ELSE COALESCE(NULLIF(u.email, ''), 'Doanh nghiệp mới') END,
             'starter', 'active', u.email, u.created_at
      FROM users u
      WHERE u.tenant_id IS NOT NULL AND u.tenant_id != ''
        AND u.tenant_id NOT IN (SELECT id FROM tenants)
    `).bind().run().catch(() => {});

    // Ensure fivestarkimky@gmail.com brand name is properly formatted
    await c.env.DB.prepare(`
      UPDATE tenants
      SET name = 'Gà rán Five Star Kim Kỳ'
      WHERE contact_email = 'fivestarkimky@gmail.com'
         OR id IN (SELECT tenant_id FROM users WHERE email = 'fivestarkimky@gmail.com')
    `).bind().run().catch(() => {});

    const rows = await c.env.DB.prepare(`
      SELECT t.id, t.name, t.plan_id, t.status,
             COALESCE(NULLIF(t.contact_email, ''), (SELECT email FROM users u WHERE u.tenant_id = t.id LIMIT 1), 'Chưa cập nhật') as contact_email,
             t.created_at,
             t.subscription_started_at,
             COALESCE(t.subscription_expires_at, t.created_at + 2592000000) as subscription_expires_at,
             COALESCE(t.payment_status, 'paid') as payment_status,
             COALESCE(p.name, UPPER(t.plan_id)) as plan_name,
             COALESCE(p.price_vnd, 0) as price_vnd,
             COALESCE(p.max_bots, 1) as max_bots,
             COALESCE(p.max_documents, 5) as max_documents,
             COALESCE(p.monthly_ai_messages, 1000) as monthly_ai_messages,
             (SELECT COUNT(*) FROM bots b WHERE b.tenant_id = t.id AND b.status != 'deleted') as bot_count,
             (SELECT COUNT(*) FROM documents d WHERE d.tenant_id = t.id) as doc_count,
             (SELECT COALESCE(SUM(u.ai_messages), 0) FROM usage_daily u WHERE u.tenant_id = t.id) as ai_messages_count
      FROM tenants t
      LEFT JOIN plans p ON LOWER(t.plan_id) = LOWER(p.id)
      ORDER BY t.created_at DESC
    `).bind().all<{
      id: string;
      name: string;
      plan_id: string;
      status: string;
      contact_email: string;
      created_at: number;
      subscription_started_at?: number | null;
      subscription_expires_at: number;
      payment_status: 'paid' | 'pending' | 'trial' | 'expired';
      plan_name: string;
      price_vnd: number;
      max_bots: number;
      max_documents: number;
      monthly_ai_messages: number;
      bot_count: number;
      doc_count: number;
      ai_messages_count: number;
    }>();

    const now = Date.now();
    const formattedTenants = (rows?.results || []).map((t) => {
      const expiresAt = t.subscription_expires_at || (t.created_at + 2592000000);
      const daysLeft = Math.ceil((expiresAt - now) / 86400000);
      return {
        ...t,
        subscription_expires_at: expiresAt,
        days_left: daysLeft,
        is_expired: daysLeft <= 0,
      };
    });

    return c.json({
      ok: true,
      tenants: formattedTenants,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return c.json({ ok: false, error: msg, tenants: [] }, 500);
  }
});

// 3. Update Tenant Status or Plan
adminRouter.patch('/tenants/:id', async (c) => {
  const tenantId = c.req.param('id');
  const body = await c.req.json<{
    plan_id?: string;
    status?: 'active' | 'suspended' | 'cancelled';
    name?: string;
    contact_email?: string;
    payment_status?: 'paid' | 'pending' | 'trial' | 'expired';
    subscription_expires_at?: number;
    extend_days?: number;
  }>();

  const tenant = await c.env.DB.prepare('SELECT id, subscription_expires_at FROM tenants WHERE id = ?')
    .bind(tenantId)
    .first<{ id: string; subscription_expires_at: number | null }>();

  if (!tenant) {
    return c.json({ error: 'Doanh nghiệp không tồn tại' }, 404);
  }

  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.plan_id !== undefined) {
    updates.push('plan_id = ?');
    params.push(body.plan_id);
  }
  if (body.status !== undefined) {
    updates.push('status = ?');
    params.push(body.status);
  }
  if (body.name !== undefined) {
    updates.push('name = ?');
    params.push(body.name.trim());
  }
  if (body.contact_email !== undefined) {
    updates.push('contact_email = ?');
    params.push(body.contact_email.trim());
  }
  if (body.payment_status !== undefined) {
    updates.push('payment_status = ?');
    params.push(body.payment_status);
  }
  if (body.subscription_expires_at !== undefined) {
    updates.push('subscription_expires_at = ?');
    params.push(body.subscription_expires_at);
  } else if (body.extend_days !== undefined && body.extend_days > 0) {
    const base = Math.max(Date.now(), tenant.subscription_expires_at || Date.now());
    const newExpires = base + body.extend_days * 86400000;
    updates.push('subscription_expires_at = ?');
    params.push(newExpires);
  }

  if (updates.length > 0) {
    params.push(tenantId);
    await c.env.DB.prepare(`UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...params)
      .run();
  }

  return c.json({ ok: true, message: 'Cập nhật doanh nghiệp thành công!' });
});

// 4. Manually Provision New Tenant & Admin User
adminRouter.post('/tenants', async (c) => {
  const body = await c.req.json<{
    name?: string;
    tenant_name?: string;
    email?: string;
    admin_email?: string;
    password?: string;
    admin_password?: string;
    plan_id?: string;
    subscription_days?: number;
    payment_status?: 'paid' | 'pending' | 'trial';
  }>();

  const tenantName = (body.name || body.tenant_name || '').trim();
  const adminEmail = (body.email || body.admin_email || '').trim().toLowerCase();
  const adminPassword = (body.password || body.admin_password || '').trim();
  const planId = (body.plan_id || 'starter').toLowerCase();
  const isTrial = planId === 'trial';
  const subDays = body.subscription_days || (isTrial ? 7 : 30);
  const paymentStatus = body.payment_status || (isTrial ? 'trial' : 'paid');

  if (!tenantName || !adminEmail || !adminPassword) {
    return c.json({ error: 'Tên doanh nghiệp, email và mật khẩu là bắt buộc' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(adminEmail)
    .first();

  if (existing) {
    return c.json({ error: 'Email này đã được sử dụng' }, 409);
  }

  const tenantId = `tenant_${nanoid(12)}`;
  const userId = `usr_${nanoid(16)}`;
  const now = Date.now();
  const expiresAt = now + subDays * 86400 * 1000;

  await c.env.DB.prepare(
    'INSERT INTO tenants (id, name, plan_id, status, contact_email, created_at, subscription_started_at, subscription_expires_at, payment_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(tenantId, tenantName, planId, 'active', adminEmail, now, now, expiresAt, paymentStatus)
    .run();

  const passwordHash = await hashPassword(adminPassword);
  await c.env.DB.prepare(
    'INSERT INTO users (id, tenant_id, email, password_hash, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(userId, tenantId, adminEmail, passwordHash, 'tenant_admin', 'active', now)
    .run();

  return c.json({
    ok: true,
    message: 'Khởi tạo tài khoản doanh nghiệp thành công!',
    tenant: {
      id: tenantId,
      name: tenantName,
      plan_id: planId,
      payment_status: paymentStatus,
      subscription_expires_at: expiresAt,
    },
    user: {
      id: userId,
      email: adminEmail,
    },
  });
});

// 5. Get System Settings (Website Contact, Receiving Bank Account, Email Config)
adminRouter.get('/settings', async (c) => {
  const settings = await getSystemSettings(c.env.DB);
  return c.json({ ok: true, settings });
});

// 6. Update System Settings
adminRouter.put('/settings', async (c) => {
  const body = await c.req.json<{
    website_contact?: any;
    bank_account?: any;
    email_config?: any;
  }>();

  const now = Date.now();

  if (body.website_contact) {
    await c.env.DB.prepare(
      'INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
    )
      .bind('website_contact', JSON.stringify(body.website_contact), now)
      .run();
  }

  if (body.bank_account) {
    await c.env.DB.prepare(
      'INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
    )
      .bind('bank_account', JSON.stringify(body.bank_account), now)
      .run();
  }

  if (body.email_config) {
    await c.env.DB.prepare(
      'INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
    )
      .bind('email_config', JSON.stringify(body.email_config), now)
      .run();
  }

  const updatedSettings = await getSystemSettings(c.env.DB);
  return c.json({
    ok: true,
    message: 'Cập nhật cấu hình hệ thống thành công!',
    settings: updatedSettings,
  });
});

// 7. Get Email Logs
adminRouter.get('/email-logs', async (c) => {
  try {
    const logs = await c.env.DB.prepare(
      'SELECT id, to_email, from_email, subject, status, error, metadata, created_at FROM email_logs ORDER BY created_at DESC LIMIT 100'
    )
      .bind()
      .all<{
        id: string;
        to_email: string;
        from_email: string;
        subject: string;
        status: string;
        error?: string;
        metadata?: string;
        created_at: number;
      }>();

    const formatted = (logs.results || []).map((l) => {
      let meta = null;
      try {
        if (l.metadata) meta = JSON.parse(l.metadata);
      } catch {}
      return { ...l, metadata: meta };
    });

    return c.json({ ok: true, logs: formatted });
  } catch (err: any) {
    return c.json({ ok: true, logs: [] });
  }
});

// 8. Send Test Confirmation Email
adminRouter.post('/send-test-email', async (c) => {
  const body = await c.req.json<{ to_email?: string }>();
  const toEmail = body.to_email?.trim();

  if (!toEmail) {
    return c.json({ error: 'Vui lòng cung cấp email nhận thư thử nghiệm' }, 400);
  }

  const res = await sendPaymentSuccessEmail(c.env.DB, {
    tenantName: 'Doanh nghiệp Thử Nghiệm',
    toEmail,
    planName: 'Pro',
    amountVnd: 299000,
    days: 30,
    expiresAt: Date.now() + 30 * 86400 * 1000,
    invoiceId: `test_${nanoid(10)}`,
  });

  return c.json({
    ok: true,
    message: `Đã xử lý gửi email thử nghiệm tới ${toEmail}! Trạng thái: ${res.status}`,
    result: res,
  });
});


