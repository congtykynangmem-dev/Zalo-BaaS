// apps/control-api/src/routes/conversations.ts
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { decryptAesGcm } from '@zalo-baas/crypto';
import { ZaloBotClient } from '@zalo-baas/zalo-bot-sdk';
import { authMiddleware } from '../auth.js';
import type { Env, HonoVariables } from '../types.js';

export const conversationsRouter = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

conversationsRouter.use('*', authMiddleware);

// 1. List conversations for a bot
conversationsRouter.get('/bots/:botId/conversations', async (c) => {
  const user = c.get('user');
  const botId = c.req.param('botId');
  const state = c.req.query('state'); // 'ai' | 'human' | undefined

  let query = `SELECT id, chat_id, display_name, state, human_until, last_message_at
               FROM conversations WHERE bot_id = ? AND tenant_id = ?`;
  const params: unknown[] = [botId, user.tenant_id];

  if (state) {
    query += ' AND state = ?';
    params.push(state);
  }

  query += ' ORDER BY last_message_at DESC LIMIT 50';

  const rows = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ conversations: rows.results });
});

// 2. Get message history of a conversation
conversationsRouter.get('/conversations/:id/messages', async (c) => {
  const user = c.get('user');
  const convId = c.req.param('id');

  // Verify conversation belongs to tenant
  const conv = await c.env.DB.prepare(
    'SELECT id, bot_id, chat_id, display_name, state FROM conversations WHERE id = ? AND tenant_id = ?'
  )
    .bind(convId, user.tenant_id)
    .first();

  if (!conv) {
    return c.json({ error: 'Conversation not found' }, 404);
  }

  const messages = await c.env.DB.prepare(
    `SELECT id, direction, sender, text, zalo_msg_id, tokens_in, tokens_out, created_at
     FROM messages WHERE conversation_id = ? AND tenant_id = ? ORDER BY created_at ASC`
  )
    .bind(convId, user.tenant_id)
    .all();

  return c.json({
    conversation: conv,
    messages: messages.results,
  });
});

// 3. Human agent manual reply to user via Zalo
conversationsRouter.post('/conversations/:id/reply', async (c) => {
  const user = c.get('user');
  const convId = c.req.param('id');
  const body = await c.req.json<{ text?: string }>();

  if (!body.text || body.text.trim() === '') {
    return c.json({ error: 'Message text is required' }, 400);
  }

  const conv = await c.env.DB.prepare(
    'SELECT id, bot_id, chat_id FROM conversations WHERE id = ? AND tenant_id = ?'
  )
    .bind(convId, user.tenant_id)
    .first<{ id: string; bot_id: string; chat_id: string }>();

  if (!conv) {
    return c.json({ error: 'Conversation not found' }, 404);
  }

  // Retrieve bot token
  const cred = await c.env.DB.prepare(
    'SELECT bot_token_enc FROM bot_credentials WHERE bot_id = ? AND tenant_id = ?'
  )
    .bind(conv.bot_id, user.tenant_id)
    .first<{ bot_token_enc: ArrayBuffer }>();

  if (!cred?.bot_token_enc) {
    return c.json({ error: 'Bot credentials missing' }, 500);
  }

  const botToken = await decryptAesGcm(new Uint8Array(cred.bot_token_enc), c.env.KEK_V1);
  const zaloClient = new ZaloBotClient(botToken);

  const replyText = body.text.trim();
  const sentResults = await zaloClient.sendMessageResilient({
    chat_id: conv.chat_id,
    text: replyText,
    parse_mode: 'markdown',
  });
  const sentMsgId = sentResults[0]?.message_id ?? null;

  const now = Date.now();
  const msgId = `msg_${nanoid(16)}`;

  // Record outbound message in D1
  await c.env.DB.prepare(
    `INSERT INTO messages (id, tenant_id, conversation_id, direction, sender, text, zalo_msg_id, created_at)
     VALUES (?, ?, ?, 'out', 'agent', ?, ?, ?)`
  )
    .bind(msgId, user.tenant_id, convId, replyText, sentMsgId, now)
    .run();

  await c.env.DB.prepare(
    'UPDATE conversations SET last_message_at = ? WHERE id = ?'
  )
    .bind(now, convId)
    .run();

  return c.json({
    ok: true,
    message: {
      id: msgId,
      text: replyText,
      created_at: now,
    },
  });
});

// 4. Return conversation back to AI mode
conversationsRouter.post('/conversations/:id/return-to-ai', async (c) => {
  const user = c.get('user');
  const convId = c.req.param('id');

  const now = Date.now();
  await c.env.DB.prepare(
    `UPDATE conversations SET state = 'ai', human_until = NULL WHERE id = ? AND tenant_id = ?`
  )
    .bind(convId, user.tenant_id)
    .run();

  // Resolve open handovers
  await c.env.DB.prepare(
    `UPDATE handovers SET status = 'resolved', resolved_at = ? WHERE conversation_id = ? AND tenant_id = ? AND status = 'open'`
  )
    .bind(now, convId, user.tenant_id)
    .run();

  return c.json({ ok: true, message: 'Conversation returned to AI successfully' });
});

// 5. List active handover tickets
conversationsRouter.get('/handovers', async (c) => {
  const user = c.get('user');
  const status = c.req.query('status') ?? 'open';

  const handovers = await c.env.DB.prepare(
    `SELECT h.id, h.conversation_id, h.reason, h.status, h.created_at, c.display_name, c.bot_id, c.chat_id
     FROM handovers h
     JOIN conversations c ON h.conversation_id = c.id
     WHERE h.tenant_id = ? AND h.status = ?
     ORDER BY h.created_at DESC`
  )
    .bind(user.tenant_id, status)
    .all();

  return c.json({ handovers: handovers.results });
});

