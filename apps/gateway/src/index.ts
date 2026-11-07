// apps/gateway/src/index.ts
import { Hono } from 'hono';
import { timingSafeEqualString } from '@zalo-baas/crypto';
import {
  KV_TTL,
  ZaloWebhookEventSchema,
  type BotCacheData,
  type QueueInboundMessage,
} from '@zalo-baas/shared';
import type { Env } from './types.js';

export const app = new Hono<{ Bindings: Env }>();

// 1. Health check endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'gateway',
    timestamp: Date.now(),
  });
});

// 2. Inbound webhook endpoint for Zalo Bot Platform
app.post('/v1/webhook/bot/:botId', async (c) => {
  const botId = c.req.param('botId');

  // 2.1. Check secret token header from Zalo
  const secretTokenHeader = c.req.header('x-bot-api-secret-token');
  if (!secretTokenHeader) {
    return c.json({ error: 'Missing security token header' }, 401);
  }

  // 2.2. Fetch bot configuration from KV cache
  const botCacheRaw = await c.env.KV_CACHE.get(`bot:${botId}`);
  if (!botCacheRaw) {
    return c.json({ error: 'Bot not found or not active' }, 404);
  }

  let botConfig: BotCacheData;
  try {
    botConfig = JSON.parse(botCacheRaw) as BotCacheData;
  } catch {
    return c.json({ error: 'Corrupted bot configuration' }, 500);
  }

  if (botConfig.status !== 'active') {
    return c.json({ error: 'Bot is paused or disabled' }, 403);
  }

  // 2.3. Verify security token using timing-safe comparison
  const isValidSecret = timingSafeEqualString(secretTokenHeader, botConfig.secret_token);
  if (!isValidSecret) {
    return c.json({ error: 'Invalid security token' }, 401);
  }

  // 2.4. Parse and validate JSON body from Zalo
  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON payload' }, 400);
  }

  const parseResult = ZaloWebhookEventSchema.safeParse(rawBody);
  if (!parseResult.success) {
    // If not a standard schema, return 200 to acknowledge and avoid Zalo retrying
    return c.json({ ok: true, ignored: true, reason: 'unrecognized_event_schema' });
  }

  const event = parseResult.data;
  const message = event.message;

  // If event has no message object (e.g. system status event), acknowledge with 200
  if (!message) {
    return c.json({ ok: true, ignored: true, reason: 'no_message_in_event' });
  }

  // 2.5. Check idempotency in KV: idem:{botId}:{message_id}
  const idemKey = `idem:${botId}:${message.message_id}`;
  const existingEvent = await c.env.KV_CACHE.get(idemKey);
  if (existingEvent) {
    // Duplicate message, return 200 immediately
    return c.json({ ok: true, duplicate: true });
  }

  // Record idempotency key with 24 hours TTL
  await c.env.KV_CACHE.put(idemKey, '1', {
    expirationTtl: KV_TTL.IDEMPOTENCY_SECONDS,
  });

  // 2.6. Enqueue inbound message for asynchronous agent processing
  const queuePayload: QueueInboundMessage = {
    tenant_id: botConfig.tenant_id,
    bot_id: botId,
    event_name: event.event_name,
    message_id: message.message_id,
    chat_id: message.chat.id,
    user_id: message.from.id,
    display_name: message.from.display_name ?? 'Người dùng Zalo',
    text: message.text ?? '',
    received_at: Date.now(),
  };

  await c.env.Q_INBOUND.send(queuePayload);

  // 2.7. Return 200 OK immediately (< 30ms)
  return c.json({ ok: true });
});

export default app;

