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
  const tenantsCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM tenants').first<{ count: number }>();
  const usersCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();
  const botsCount = await c.env.DB.prepare("SELECT COUNT(*) as count FROM bots WHERE status = 'active'").first<{ count: number }>();
  const docsCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM documents').first<{ count: number }>();
  const totalAi = await c.env.DB.prepare('SELECT SUM(ai_messages) as total FROM usage_daily').first<{ total: number | null }>();

  // Revenue estimation
  const revenueRow = await c.env.DB.prepare(`
    SELECT SUM(p.price_vnd) as monthly_revenue
    FROM tenants t
    JOIN plans p ON t.plan_id = p.id
    WHERE t.status = 'active' AND p.price_vnd > 0
  `).first<{ monthly_revenue: number | null }>();

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
});

// 2. List All Tenants with Stats
adminRouter.get('/tenants', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT t.id, t.name, t.plan_id, t.status, t.contact_email, t.created_at,
           p.name as plan_name, p.price_vnd,
           (SELECT COUNT(*) FROM bots b WHERE b.tenant_id = t.id) as bot_count,
           (SELECT COUNT(*) FROM documents d WHERE d.tenant_id = t.id) as doc_count,
           (SELECT COALESCE(SUM(u.ai_messages), 0) FROM usage_daily u WHERE u.tenant_id = t.id) as ai_messages_count
    FROM tenants t
    JOIN plans p ON t.plan_id = p.id
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
    bot_count: number;
    doc_count: number;
    ai_messages_count: number;
  }>();

  return c.json({
    ok: true,
    tenants: rows?.results || [],
  });
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
    tenant_name?: string;
    admin_email?: string;
    admin_password?: string;
    plan_id?: string;
  }>();

  if (!body.tenant_name || !body.admin_email || !body.admin_password) {
    return c.json({ error: 'Tên doanh nghiệp, email và mật khẩu là bắt buộc' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(body.admin_email.trim().toLowerCase())
    .first();

  if (existing) {
    return c.json({ error: 'Email này đã được sử dụng' }, 409);
  }

  const tenantId = `tenant_${nanoid(12)}`;
  const userId = `usr_${nanoid(16)}`;
  const now = Date.now();
  const planId = body.plan_id || 'starter';

  await c.env.DB.prepare(
    'INSERT INTO tenants (id, name, plan_id, status, contact_email, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
    .bind(tenantId, body.tenant_name.trim(), planId, 'active', body.admin_email.trim().toLowerCase(), now)
    .run();

  const passwordHash = await hashPassword(body.admin_password);
  await c.env.DB.prepare(
    'INSERT INTO users (id, tenant_id, email, password_hash, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(userId, tenantId, body.admin_email.trim().toLowerCase(), passwordHash, 'tenant_admin', 'active', now)
    .run();

  return c.json({
    ok: true,
    message: 'Khởi tạo tài khoản doanh nghiệp thành công!',
    tenant: {
      id: tenantId,
      name: body.tenant_name.trim(),
      plan_id: planId,
    },
    user: {
      id: userId,
      email: body.admin_email.trim().toLowerCase(),
    },
  });
});
