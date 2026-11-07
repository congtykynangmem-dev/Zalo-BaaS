// apps/control-api/src/routes/webhook.ts
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { decryptAesGcm } from '@zalo-baas/crypto';
import { ZaloBotClient } from '@zalo-baas/zalo-bot-sdk';
import { GeminiClient, buildSystemInstruction, formatContextBlock } from '@zalo-baas/llm';
import { filterMatches, type VectorMatch } from '@zalo-baas/rag';
import type { Env, HonoVariables } from '../types.js';

export const webhookRouter = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// Inbound webhook for Zalo Bot Platform
webhookRouter.post('/bot/:botId', async (c) => {
  const botId = c.req.param('botId');
  const now = Date.now();

  // 1. Fetch bot and verify status
  const bot = await c.env.DB.prepare(
    `SELECT id, tenant_id, name, status, system_prompt, strict_grounding, handover_keywords, handover_minutes
     FROM bots WHERE id = ?`
  )
    .bind(botId)
    .first<{
      id: string;
      tenant_id: string;
      name: string;
      status: string;
      system_prompt: string | null;
      strict_grounding: number;
      handover_keywords: string | null;
      handover_minutes: number;
    }>();

  if (!bot || bot.status !== 'active') {
    return c.json({ ok: false, error: 'Bot not found or not active' }, 404);
  }

  // 2. Fetch encrypted bot credentials
  const cred = await c.env.DB.prepare(
    'SELECT bot_token_enc, secret_token_enc FROM bot_credentials WHERE bot_id = ?'
  )
    .bind(botId)
    .first<{ bot_token_enc: Uint8Array | ArrayBuffer; secret_token_enc: Uint8Array | ArrayBuffer }>();

  if (!cred) {
    return c.json({ ok: false, error: 'Bot credentials missing' }, 404);
  }

  // 3. Decrypt bot token
  const tokenBytes = cred.bot_token_enc instanceof Uint8Array ? cred.bot_token_enc : new Uint8Array(cred.bot_token_enc);
  const botToken = await decryptAesGcm(tokenBytes, c.env.KEK_V1);
  const zaloClient = new ZaloBotClient(botToken);

  // 4. Parse incoming JSON body flexibly
  let body: Record<string, unknown>;
  try {
    body = (await c.req.json()) as Record<string, unknown>;
  } catch {
    return c.json({ ok: true, ignored: true, reason: 'invalid_json' });
  }

  const rawMsg = (body.message || body) as Record<string, unknown>;
  const rawText = rawMsg.text || body.text || '';
  const safeText = String(rawText).trim();

  // Extract identifiers flexibly
  const rawChat = (rawMsg.chat || body.chat || {}) as Record<string, unknown>;
  const rawFrom = (rawMsg.from || body.from || body.sender || {}) as Record<string, unknown>;

  const chatId = String(rawChat.id || rawFrom.id || '');
  const userId = String(rawFrom.id || chatId || 'user_anon');
  const displayName = String(rawFrom.display_name || rawFrom.name || 'Người dùng Zalo');
  const messageId = String(rawMsg.message_id || body.message_id || `msg_${now}`);

  if (!chatId) {
    // If event has no chat ID (e.g. system heartbeat), acknowledge with 200
    return c.json({ ok: true, acknowledged: true });
  }

  // 5. Send typing action immediately to keep user engaged
  try {
    await zaloClient.sendChatAction({ chat_id: chatId, action: 'typing' });
  } catch (err) {
    console.warn('[Webhook] sendChatAction warning:', err);
  }

  // 6. Upsert conversation
  const convId = `conv_${nanoid(16)}`;
  await c.env.DB.prepare(
    `INSERT INTO conversations (id, tenant_id, bot_id, chat_id, display_name, last_message_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(bot_id, chat_id) DO UPDATE SET
       last_message_at = excluded.last_message_at,
       display_name = excluded.display_name`
  )
    .bind(convId, bot.tenant_id, bot.id, chatId, displayName, now)
    .run();

  const convRow = await c.env.DB.prepare(
    'SELECT id, state, human_until FROM conversations WHERE bot_id = ? AND chat_id = ?'
  )
    .bind(bot.id, chatId)
    .first<{ id: string; state: string; human_until: number | null }>();

  const activeConvId = convRow?.id ?? convId;
  const isHumanState = convRow?.state === 'human' && (convRow.human_until ?? 0) > now;

  // 7. Save user message to DB
  await c.env.DB.prepare(
    `INSERT INTO messages (id, tenant_id, conversation_id, direction, sender, text, zalo_msg_id, created_at)
     VALUES (?, ?, ?, 'in', 'user', ?, ?, ?)`
  )
    .bind(`msg_${nanoid(16)}`, bot.tenant_id, activeConvId, safeText, messageId, now)
    .run();

  // 8. If in human handover mode, do not auto-respond
  if (isHumanState) {
    return c.json({ ok: true, mode: 'human' });
  }

  // 9. Check handover keywords
  const DEFAULT_HANDOVER_KEYWORDS = ['gặp nhân viên', 'tư vấn viên', 'người thật', 'khiếu nại', 'cskh', 'hỗ trợ viên'];
  let wantsHandover = false;
  const lowerText = safeText.toLowerCase();
  for (const kw of DEFAULT_HANDOVER_KEYWORDS) {
    if (lowerText.includes(kw)) {
      wantsHandover = true;
      break;
    }
  }

  if (!wantsHandover && bot.handover_keywords) {
    try {
      const customKws = JSON.parse(bot.handover_keywords);
      if (Array.isArray(customKws)) {
        for (const kw of customKws) {
          if (kw && lowerText.includes(String(kw).toLowerCase().trim())) {
            wantsHandover = true;
            break;
          }
        }
      }
    } catch {}
  }

  if (wantsHandover) {
    const handoverMinutes = bot.handover_minutes || 30;
    const humanUntil = now + handoverMinutes * 60 * 1000;
    await c.env.DB.prepare('UPDATE conversations SET state = ?, human_until = ? WHERE id = ?')
      .bind('human', humanUntil, activeConvId)
      .run();
    await c.env.DB.prepare('INSERT INTO handovers (id, tenant_id, conversation_id, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(`ho_${nanoid(16)}`, bot.tenant_id, activeConvId, 'keyword', 'open', now)
      .run();

    const handoverReply = 'Dạ em đã ghi nhận yêu cầu và chuyển tiếp tới nhân viên tư vấn. Nhân viên sẽ phản hồi bạn trong ít phút nữa ạ!';
    const sent = await zaloClient.sendMessage({ chat_id: chatId, text: handoverReply });
    await c.env.DB.prepare('INSERT INTO messages (id, tenant_id, conversation_id, direction, sender, text, zalo_msg_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(`msg_${nanoid(16)}`, bot.tenant_id, activeConvId, 'out', 'agent', handoverReply, sent.message_id, now)
      .run();

    return c.json({ ok: true, handover: true });
  }

  // 10. Generate AI Response
  let botReply = '';
  if (c.env.GEMINI_API_KEY && c.env.GEMINI_API_KEY.trim()) {
    try {
      const geminiClient = new GeminiClient(c.env.GEMINI_API_KEY);
      let relevantChunks: Array<{ title: string; content: string; score: number }> = [];

      if (c.env.VECTORS && safeText) {
        try {
          const embedResult = await geminiClient.embedContent({ text: safeText });
          const qRes = await c.env.VECTORS.query(embedResult.values, { topK: 5, returnMetadata: 'all' });
          const candidateMatches: VectorMatch[] = (qRes.matches || []).map((m: any) => ({
            id: m.id,
            score: m.score,
            metadata: m.metadata as VectorMatch['metadata'],
          }));
          const matches = filterMatches(
            candidateMatches.filter(
              (m) =>
                m.metadata?.tenant_id === bot.tenant_id &&
                (m.metadata?.bot_id === bot.id ||
                  m.metadata?.bot_id === 'all' ||
                  !m.metadata?.bot_id)
            )
          );
          relevantChunks = matches.map((m: any) => ({
            title: m.metadata?.title || 'Tài liệu',
            content: m.metadata?.content || '',
            score: m.score,
          }));
        } catch (vecErr) {
          console.warn('[Webhook] Vector query warning:', vecErr);
        }
      }

      const isStrict = bot.strict_grounding === 1;
      if (isStrict && relevantChunks.length === 0) {
        botReply =
          'Dạ hiện tại em chưa tìm thấy thông tin phù hợp trong tài liệu hướng dẫn. Bạn có muốn kết nối với nhân viên tư vấn để được hỗ trợ chi tiết hơn không ạ?';
      } else {
        const contextBlock = formatContextBlock(relevantChunks);
        const systemInstruction = buildSystemInstruction({
          botName: bot.name,
          tenantSystemPrompt: bot.system_prompt || undefined,
          strictGrounding: isStrict,
        });
        const prompt = contextBlock ? `${contextBlock}\n\nCâu hỏi của khách hàng: ${safeText}` : safeText;
        const res = await geminiClient.generateContent({
          messages: [{ role: 'user', parts: [{ text: prompt }] }],
          systemInstruction,
        });
        botReply = res.text;
      }
    } catch (aiErr: any) {
      console.warn('[Webhook] Gemini generation warning:', aiErr?.message);
      botReply = `Xin chào ${displayName}! Em đã nhận được tin nhắn của bạn. Em sẽ phản hồi bạn ngay ạ.`;
    }
  } else {
    // If Gemini API Key not set yet, reply with friendly confirmation
    botReply = `Xin chào ${displayName}! Em là ${bot.name}. Em đã nhận được tin nhắn: "${safeText}". Hệ thống kết nối Zalo Bot đang hoạt động rất tốt!`;
  }

  // 11. Send reply back to Zalo
  if (botReply) {
    try {
      const sent = await zaloClient.sendMessage({ chat_id: chatId, text: botReply });
      await c.env.DB.prepare(
        `INSERT INTO messages (id, tenant_id, conversation_id, direction, sender, text, zalo_msg_id, created_at)
         VALUES (?, ?, ?, 'out', 'ai', ?, ?, ?)`
      )
        .bind(`msg_${nanoid(16)}`, bot.tenant_id, activeConvId, botReply, sent.message_id, Date.now())
        .run();
    } catch (sendErr) {
      console.error('[Webhook] Failed to send message to Zalo:', sendErr);
    }
  }

  return c.json({ ok: true });
});
