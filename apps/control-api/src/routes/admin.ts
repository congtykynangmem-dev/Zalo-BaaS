// apps/control-api/src/routes/admin.ts
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { authMiddleware, requireRole, hashPassword } from '../auth.js';
import type { Env, HonoVariables } from '../types.js';

export const adminRouter = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// Only platform_owner can access /v1/admin routes
adminRouter.use('*', authMiddleware, requireRole(['platform_owner']));

// 1. System Overview Metrics
adminRouter.get('/overview', async (c) => {
  try {
    const tenantsCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM tenants').first<{ count: number }>().catch(() => ({ count: 0 }));
    const usersCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>().catch(() => ({ count: 0 }));
    const botsCount = await c.env.DB.prepare("SELECT COUNT(*) as count FROM bots WHERE status = 'active'").first<{ count: number }>().catch(() => ({ count: 0 }));
    const docsCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM documents').first<{ count: number }>().catch(() => ({ count: 0 }));
    const totalAi = await c.env.DB.prepare('SELECT SUM(ai_messages) as total FROM usage_daily').first<{ total: number | null }>().catch(() => ({ total: 0 }));

    // Revenue estimation
    const revenueRow = await c.env.DB.prepare(`
      SELECT SUM(p.price_vnd) as monthly_revenue
      FROM tenants t
      JOIN plans p ON LOWER(t.plan_id) = LOWER(p.id)
      WHERE t.status = 'active' AND p.price_vnd > 0
    `).first<{ monthly_revenue: number | null }>().catch(() => ({ monthly_revenue: 0 }));

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
    const rows = await c.env.DB.prepare(`
      SELECT t.id, t.name, t.plan_id, t.status,
             COALESCE(NULLIF(t.contact_email, ''), (SELECT email FROM users u WHERE u.tenant_id = t.id LIMIT 1), 'Chưa cập nhật') as contact_email,
             t.created_at,
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
    `).all<{
      id: string;
      name: string;
      plan_id: string;
      status: string;
      contact_email: string;
      created_at: number;
      plan_name: string;
      price_vnd: number;
      max_bots: number;
      max_documents: number;
      monthly_ai_messages: number;
      bot_count: number;
      doc_count: number;
      ai_messages_count: number;
    }>();

    return c.json({
      ok: true,
      tenants: rows?.results || [],
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
  }>();

  const tenant = await c.env.DB.prepare('SELECT id FROM tenants WHERE id = ?')
    .bind(tenantId)
    .first();

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
  }>();

  const tenantName = (body.name || body.tenant_name || '').trim();
  const adminEmail = (body.email || body.admin_email || '').trim().toLowerCase();
  const adminPassword = (body.password || body.admin_password || '').trim();
  const planId = body.plan_id || 'starter';

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

  await c.env.DB.prepare(
    'INSERT INTO tenants (id, name, plan_id, status, contact_email, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(tenantId, tenantName, planId, 'active', adminEmail, now)
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
    },
    user: {
      id: userId,
      email: adminEmail,
    },
  });
});

