// apps/control-api/src/routes/auth.ts
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { hashPassword, verifyPassword, signJwt, authMiddleware } from '../auth.js';
import type { Env, HonoVariables } from '../types.js';

export const authRouter = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// 1. Register new tenant & admin user
authRouter.post('/register', async (c) => {
  const body = await c.req.json<{
    email?: string;
    password?: string;
    tenant_name?: string;
  }>();

  if (!body.email || !body.password || !body.tenant_name) {
    return c.json({ error: 'Email, password, and tenant_name are required' }, 400);
  }

  const email = body.email.toLowerCase().trim();
  const tenantName = body.tenant_name.trim();

  // Check if user already exists
  const existingUser = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(email)
    .first();

  if (existingUser) {
    return c.json({ error: 'Email is already registered' }, 409);
  }

  const tenantId = `tenant_${nanoid(12)}`;
  const userId = `user_${nanoid(12)}`;
  const now = Date.now();
  const passwordHash = await hashPassword(body.password);

  // Create tenant
  await c.env.DB.prepare(
    `INSERT INTO tenants (id, name, plan_id, status, contact_email, created_at)
     VALUES (?, ?, 'starter', 'active', ?, ?)`
  )
    .bind(tenantId, tenantName, email, now)
    .run();

  // Create user as tenant_admin
  await c.env.DB.prepare(
    `INSERT INTO users (id, tenant_id, email, password_hash, role, status, created_at)
     VALUES (?, ?, ?, ?, 'tenant_admin', 'active', ?)`
  )
    .bind(userId, tenantId, email, passwordHash, now)
    .run();

  const user = {
    id: userId,
    tenant_id: tenantId,
    email,
    role: 'tenant_admin' as const,
  };

  const token = await signJwt(user, c.env.JWT_SECRET);

  return c.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      tenant: {
        id: tenantId,
        name: tenantName,
        plan_id: 'starter',
      },
    },
  });
});

// 2. Login
authRouter.post('/login', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>();
  if (!body.email || !body.password) {
    return c.json({ error: 'Email and password are required' }, 400);
  }

  const email = body.email.toLowerCase().trim();

  const userRow = await c.env.DB.prepare(
    `SELECT u.id, u.tenant_id, u.email, u.password_hash, u.role, u.status, t.name as tenant_name, t.plan_id
     FROM users u
     LEFT JOIN tenants t ON u.tenant_id = t.id
     WHERE u.email = ?`
  )
    .bind(email)
    .first<{
      id: string;
      tenant_id: string | null;
      email: string;
      password_hash: string;
      role: 'platform_owner' | 'tenant_admin' | 'tenant_agent';
      status: string;
      tenant_name: string | null;
      plan_id: string | null;
    }>();

  if (!userRow || userRow.status !== 'active') {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const isPasswordValid = await verifyPassword(body.password, userRow.password_hash);
  if (!isPasswordValid) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const user = {
    id: userRow.id,
    tenant_id: userRow.tenant_id,
    email: userRow.email,
    role: userRow.role,
  };

  const token = await signJwt(user, c.env.JWT_SECRET);

  return c.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      tenant: userRow.tenant_id
        ? {
            id: userRow.tenant_id,
            name: userRow.tenant_name,
            plan_id: userRow.plan_id,
          }
        : null,
    },
  });
});

// 3. Get profile (/me)
authRouter.get('/me', authMiddleware, async (c) => {
  const user = c.get('user');

  const tenantRow = user.tenant_id
    ? await c.env.DB.prepare('SELECT id, name, plan_id, status FROM tenants WHERE id = ?')
        .bind(user.tenant_id)
        .first()
    : null;

  return c.json({
    user,
    tenant: tenantRow,
  });
});
