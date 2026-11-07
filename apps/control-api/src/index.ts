// apps/control-api/src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { authRouter } from './routes/auth.js';
import { botsRouter } from './routes/bots.js';
import { documentsRouter } from './routes/documents.js';
import { conversationsRouter } from './routes/conversations.js';
import { analyticsRouter } from './routes/analytics.js';
import type { Env, HonoVariables } from './types.js';

export const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// Enable CORS for Portal
app.use(
  '*',
  cors({
    origin: (origin) => origin ?? '*',
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: true,
  })
);

// Health check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'control-api',
    timestamp: Date.now(),
  });
});

// Mount modular sub-routers under /v1
app.route('/v1/auth', authRouter);
app.route('/v1/bots', botsRouter);
app.route('/v1', documentsRouter);
app.route('/v1', conversationsRouter);
app.route('/v1/analytics', analyticsRouter);

// Global Error Handler to guarantee clean JSON errors
app.onError((err, c) => {
  console.error('[Zalo-BaaS Control-API Unhandled Error]:', err);
  return c.json(
    {
      error: err.message || 'Lỗi hệ thống máy chủ nội bộ',
    },
    500
  );
});

export default app;

