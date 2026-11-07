// apps/agent/src/index.ts
import { nanoid } from 'nanoid';
import { decryptAesGcm } from '@zalo-baas/crypto';
import {
  KV_TTL,
  MAX_MEMORY_MESSAGES,
  DEFAULT_HANDOVER_MINUTES,
  QueueInboundMessageSchema,
  type BotCacheData,
  type QueueInboundMessage,
  type ConversationMemory,
  type ConversationMemoryItem,
} from '@zalo-baas/shared';
import { ZaloBotClient } from '@zalo-baas/zalo-bot-sdk';
import {
  GeminiClient,
  buildSystemInstruction,
  formatContextBlock,
  type GeminiMessage,
} from '@zalo-baas/llm';
import { filterMatches, type VectorMatch } from '@zalo-baas/rag';
import type { Env, BotConfigRow } from './types.js';

const DEFAULT_HANDOVER_KEYWORDS = [
  'gặp nhân viên',
  'tư vấn viên',
  'người thật',
  'khiếu nại',
  'cskh',
  'hỗ trợ viên',
  'gặp người',
];

/**
 * Checks if incoming text triggers a handover to human agent.
 */
function isHandoverTriggered(text: string, customKeywordsJson?: string | null): boolean {
  const normalized = text.toLowerCase();
  for (const kw of DEFAULT_HANDOVER_KEYWORDS) {
    if (normalized.includes(kw)) {
      return true;
    }
  }

  if (customKeywordsJson) {
    try {
      const customKws = JSON.parse(customKeywordsJson) as string[];
      if (Array.isArray(customKws)) {
        for (const kw of customKws) {
          if (kw && normalized.includes(kw.toLowerCase().trim())) {
            return true;
          }
        }
      }
    } catch {
      // ignore json parse error
    }
  }

  return false;
}

/**
 * Resolves bot token and configuration.
 */
async function resolveBotInfo(
  botId: string,
  tenantId: string,
  env: Env
): Promise<{ token: string; config: BotConfigRow }> {
  // 1. Fetch bot configuration row from D1
  const botRow = await env.DB.prepare(
    `SELECT name, system_prompt, strict_grounding, model_policy, handover_keywords, handover_minutes
     FROM bots WHERE id = ? AND tenant_id = ?`
  )
    .bind(botId, tenantId)
    .first<BotConfigRow>();

  const config: BotConfigRow = botRow ?? {
    name: 'Zalo Assistant',
    system_prompt: null,
    strict_grounding: 0,
    model_policy: 'auto',
    handover_keywords: null,
    handover_minutes: DEFAULT_HANDOVER_MINUTES,
  };

  // 2. Fetch token from KV cache first
  const cachedRaw = await env.KV_CACHE.get(`bot:${botId}`);
  if (cachedRaw) {
    try {
      const parsed = JSON.parse(cachedRaw) as BotCacheData;
      if (parsed.bot_token) {
        return { token: parsed.bot_token, config };
      }
    } catch {
      // ignore
    }
  }

  // 3. Fallback to decrypting credentials from D1
  const credRow = await env.DB.prepare(
    'SELECT bot_token_enc FROM bot_credentials WHERE bot_id = ? AND tenant_id = ?'
  )
    .bind(botId, tenantId)
    .first<{ bot_token_enc: ArrayBuffer | Uint8Array }>();

  if (!credRow || !credRow.bot_token_enc) {
    throw new Error(`Credentials not found for bot_id: ${botId}`);
  }

  const encryptedBytes =
    credRow.bot_token_enc instanceof Uint8Array
      ? credRow.bot_token_enc
      : new Uint8Array(credRow.bot_token_enc);

  const token = await decryptAesGcm(encryptedBytes, env.KEK_V1);
  return { token, config };
}

/**
 * Loads short-term conversation memory from KV (up to 10 messages).
 */
async function loadConversationMemory(
  botId: string,
  chatId: string,
  env: Env
): Promise<ConversationMemoryItem[]> {
  const key = `mem:${botId}:${chatId}`;
  const raw = await env.KV_CACHE.get(key);
  if (!raw) return [];
  try {
    const memory = JSON.parse(raw) as ConversationMemory;
    return Array.isArray(memory.messages) ? memory.messages : [];
  } catch {
    return [];
  }
}

/**
 * Saves updated short-term memory to KV with 24 hours TTL.
 */
async function saveConversationMemory(
  botId: string,
  chatId: string,
  items: ConversationMemoryItem[],
  env: Env
): Promise<void> {
  const key = `mem:${botId}:${chatId}`;
  const trimmed = items.slice(-MAX_MEMORY_MESSAGES);
  const memory: ConversationMemory = { messages: trimmed };
  await env.KV_CACHE.put(key, JSON.stringify(memory), {
    expirationTtl: KV_TTL.MEMORY_SECONDS,
  });
}

/**
 * Processes a single incoming message from the queue with Agentic RAG.
 */
export async function processInboundMessage(
  payload: QueueInboundMessage,
  env: Env
): Promise<void> {
  const now = Date.now();
  const safeText = payload.text.trim();

  // 1. Resolve bot token & config
  const { token: botToken, config: botConfig } = await resolveBotInfo(
    payload.bot_id,
    payload.tenant_id,
    env
  );
  const zaloClient = new ZaloBotClient(botToken);

  // 2. Send typing action immediately to keep user engaged
  try {
    await zaloClient.sendChatAction({
      chat_id: payload.chat_id,
      action: 'typing',
    });
  } catch (err) {
    console.warn(`[Agent] Failed to send typing action:`, err);
  }

  // 3. Upsert conversation record in D1
  const convId = `conv_${nanoid(16)}`;
  await env.DB.prepare(
    `INSERT INTO conversations (id, tenant_id, bot_id, chat_id, display_name, last_message_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(bot_id, chat_id) DO UPDATE SET
       last_message_at = excluded.last_message_at,
       display_name = excluded.display_name`
  )
    .bind(convId, payload.tenant_id, payload.bot_id, payload.chat_id, payload.display_name, now)
    .run();

  const convRow = await env.DB.prepare(
    'SELECT id, state, human_until FROM conversations WHERE bot_id = ? AND chat_id = ?'
  )
    .bind(payload.bot_id, payload.chat_id)
    .first<{ id: string; state: string; human_until: number | null }>();

  const activeConvId = convRow?.id ?? convId;
  const isHumanState = convRow?.state === 'human' && (convRow.human_until ?? 0) > now;

  // 3.1. Save user message in D1
  await env.DB.prepare(
    `INSERT INTO messages (id, tenant_id, conversation_id, direction, sender, text, zalo_msg_id, created_at)
     VALUES (?, ?, ?, 'in', 'user', ?, ?, ?)`
  )
    .bind(`msg_${nanoid(16)}`, payload.tenant_id, activeConvId, safeText, payload.message_id, now)
    .run();

  // 4. Check if currently in Handover mode (Human agent handling)
  if (isHumanState) {
    // Human is taking care of conversation, do not generate AI response
    return;
  }

  // 5. Check if user requests Handover
  const wantsHandover = isHandoverTriggered(safeText, botConfig.handover_keywords);
  if (wantsHandover) {
    const handoverMinutes = botConfig.handover_minutes || DEFAULT_HANDOVER_MINUTES;
    const humanUntil = now + handoverMinutes * 60 * 1000;

    // Update conversation state to human
    await env.DB.prepare(
      `UPDATE conversations SET state = 'human', human_until = ? WHERE id = ?`
    )
      .bind(humanUntil, activeConvId)
      .run();

    // Create handover ticket
    await env.DB.prepare(
      `INSERT INTO handovers (id, tenant_id, conversation_id, reason, status, created_at)
       VALUES (?, ?, ?, 'keyword', 'open', ?)`
    )
      .bind(`ho_${nanoid(16)}`, payload.tenant_id, activeConvId, now)
      .run();

    const handoverReply =
      `Dạ em đã ghi nhận yêu cầu và chuyển tiếp tới nhân viên tư vấn. ` +
      `Nhân viên sẽ phản hồi bạn trong ít phút nữa ạ!`;

    const sentResult = await zaloClient.sendMessage({
      chat_id: payload.chat_id,
      text: handoverReply,
      parse_mode: 'markdown',
    });

    await env.DB.prepare(
      `INSERT INTO messages (id, tenant_id, conversation_id, direction, sender, text, zalo_msg_id, created_at)
       VALUES (?, ?, ?, 'out', 'agent', ?, ?, ?)`
    )
      .bind(`msg_${nanoid(16)}`, payload.tenant_id, activeConvId, handoverReply, sentResult.message_id, now)
      .run();

    return;
  }

  // 5.5. Quota Control: Check monthly AI message limits
  const tenantPlan = await env.DB.prepare(
    `SELECT p.monthly_ai_messages
     FROM tenants t
     JOIN plans p ON t.plan_id = p.id
     WHERE t.id = ?`
  )
    .bind(payload.tenant_id)
    .first<{ monthly_ai_messages: number }>();

  const monthlyLimit = tenantPlan?.monthly_ai_messages ?? 1000;
  const currentMonthPrefix = new Date(now).toISOString().slice(0, 7);

  const monthUsage = await env.DB.prepare(
    `SELECT SUM(ai_messages) as total_used
     FROM usage_daily
     WHERE tenant_id = ? AND day LIKE ?`
  )
    .bind(payload.tenant_id, `${currentMonthPrefix}%`)
    .first<{ total_used: number | null }>();

  const totalUsed = monthUsage?.total_used ?? 0;
  if (totalUsed >= monthlyLimit) {
    const quotaReply =
      `Dạ hiện tại hệ thống tư vấn tự động của shop đã đạt giới hạn trong tháng. ` +
      `Quý khách vui lòng liên hệ hotline hoặc để lại tin nhắn để nhân viên hỗ trợ trực tiếp ạ!`;

    const sentResult = await zaloClient.sendMessage({
      chat_id: payload.chat_id,
      text: quotaReply,
      parse_mode: 'markdown',
    });

    await env.DB.prepare(
      `INSERT INTO messages (id, tenant_id, conversation_id, direction, sender, text, zalo_msg_id, created_at)
       VALUES (?, ?, ?, 'out', 'system', ?, ?, ?)`
    )
      .bind(`msg_${nanoid(16)}`, payload.tenant_id, activeConvId, quotaReply, sentResult.message_id, now)
      .run();

    return;
  }

  // 6. RAG Retrieval via Vectorize
  const geminiClient = new GeminiClient(env.GEMINI_API_KEY);
  let relevantChunks: Array<{ title: string; content: string; score: number }> = [];

  if (env.VECTORS && safeText) {
    try {
      const embedResult = await geminiClient.embedContent({ text: safeText });
      const queryResults = await env.VECTORS.query(embedResult.values, {
        topK: 5,
        returnMetadata: 'all',
      });

      const candidateMatches: VectorMatch[] = (queryResults.matches ?? []).map((m) => ({
        id: m.id,
        score: m.score,
        metadata: m.metadata as VectorMatch['metadata'],
      }));

      // Filter matches by tenant, bot and similarity threshold (matches both dedicated and global tenant docs)
      const matched = filterMatches(
        candidateMatches.filter(
          (m) =>
            m.metadata?.tenant_id === payload.tenant_id &&
            (m.metadata?.bot_id === payload.bot_id ||
              m.metadata?.bot_id === 'all' ||
              !m.metadata?.bot_id)
        )
      );

      relevantChunks = matched.map((m) => ({
        title: m.metadata?.title ?? 'Tài liệu',
        content: m.metadata?.content ?? '',
        score: m.score,
      }));
    } catch (vectorErr) {
      console.warn(`[Agent] Vectorize query failed or empty:`, vectorErr);
    }
  }

  // 7. Strict Grounding Check
  const isStrict = botConfig.strict_grounding === 1;
  if (isStrict && relevantChunks.length === 0) {
    const refusalReply =
      `Dạ hiện tại em chưa tìm thấy thông tin phù hợp trong tài liệu hướng dẫn. ` +
      `Bạn có muốn kết nối với nhân viên tư vấn để được hỗ trợ chi tiết hơn không ạ?`;

    const sentResult = await zaloClient.sendMessage({
      chat_id: payload.chat_id,
      text: refusalReply,
      parse_mode: 'markdown',
    });

    await env.DB.prepare(
      `INSERT INTO messages (id, tenant_id, conversation_id, direction, sender, text, zalo_msg_id, created_at)
       VALUES (?, ?, ?, 'out', 'ai', ?, ?, ?)`
    )
      .bind(`msg_${nanoid(16)}`, payload.tenant_id, activeConvId, refusalReply, sentResult.message_id, now)
      .run();
    return;
  }

  // 8. Prepare Gemini Generation (Memory + Context + Prompt)
  const memoryItems = await loadConversationMemory(payload.bot_id, payload.chat_id, env);

  const contextBlock = formatContextBlock(relevantChunks);
  const systemInstruction = buildSystemInstruction({
    botName: botConfig.name,
    tenantSystemPrompt: botConfig.system_prompt ?? undefined,
    strictGrounding: isStrict,
  });

  const messagesPayload: GeminiMessage[] = [];

  // Add historical memory
  for (const item of memoryItems) {
    messagesPayload.push({
      role: item.role === 'user' ? 'user' : 'model',
      parts: [{ text: item.content }],
    });
  }

  // Add current user prompt with context
  const currentPromptText = contextBlock
    ? `${contextBlock}\n\nCâu hỏi của người dùng: ${safeText}`
    : safeText;

  messagesPayload.push({
    role: 'user',
    parts: [{ text: currentPromptText }],
  });

  // 9. Call Gemini 2.5 Flash
  const generation = await geminiClient.generateContent({
    model: 'gemini-2.5-flash',
    systemInstruction,
    messages: messagesPayload,
    temperature: 0.3,
  });

  const replyText = generation.text || 'Dạ em đã nhận được thông tin từ bạn.';

  // 10. Send outbound message via Zalo Bot Platform
  const sentResult = await zaloClient.sendMessage({
    chat_id: payload.chat_id,
    text: replyText,
    parse_mode: 'markdown',
  });

  // 11. Update short-term memory in KV
  const updatedMemory: ConversationMemoryItem[] = [
    ...memoryItems,
    { role: 'user', content: safeText, timestamp: now },
    { role: 'assistant', content: replyText, timestamp: Date.now() },
  ];
  await saveConversationMemory(payload.bot_id, payload.chat_id, updatedMemory, env);

  // 12. Save AI reply message and usage stats in D1
  await env.DB.prepare(
    `INSERT INTO messages (id, tenant_id, conversation_id, direction, sender, text, zalo_msg_id, tokens_in, tokens_out, created_at)
     VALUES (?, ?, ?, 'out', 'ai', ?, ?, ?, ?, ?)`
  )
    .bind(
      `msg_${nanoid(16)}`,
      payload.tenant_id,
      activeConvId,
      replyText,
      sentResult.message_id,
      generation.tokensIn,
      generation.tokensOut,
      now
    )
    .run();

  const todayStr = new Date(now).toISOString().slice(0, 10);
  await env.DB.prepare(
    `INSERT INTO usage_daily (tenant_id, bot_id, day, ai_messages, tokens_in, tokens_out)
     VALUES (?, ?, ?, 1, ?, ?)
     ON CONFLICT(tenant_id, bot_id, day) DO UPDATE SET
       ai_messages = ai_messages + 1,
       tokens_in = tokens_in + excluded.tokens_in,
       tokens_out = tokens_out + excluded.tokens_out`
  )
    .bind(payload.tenant_id, payload.bot_id, todayStr, generation.tokensIn, generation.tokensOut)
    .run();
}

/**
 * Cloudflare Worker Queue Handler.
 */
export default {
  async queue(batch: MessageBatch<QueueInboundMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        const validation = QueueInboundMessageSchema.safeParse(message.body);
        if (!validation.success) {
          console.error('[Agent] Invalid queue payload structure:', validation.error);
          message.ack();
          continue;
        }

        await processInboundMessage(validation.data, env);
        message.ack();
      } catch (error) {
        console.error('[Agent] Error processing message from queue:', error);
        message.retry();
      }
    }
  },
};
