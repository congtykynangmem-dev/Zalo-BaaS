// apps/control-api/src/routes/customers.ts
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { decryptAesGcm } from '@zalo-baas/crypto';
import { ZaloBotClient } from '@zalo-baas/zalo-bot-sdk';
import { authMiddleware, requireRole } from '../auth.js';
import type { Env, HonoVariables } from '../types.js';

export const customersRouter = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

customersRouter.use('*', authMiddleware);

// 1. List customers with search, tag filter & pagination
customersRouter.get('/', async (c) => {
  const user = c.get('user');
  const tenantId = user.tenant_id;
  const botId = c.req.query('bot_id');
  const tag = c.req.query('tag');
  const search = c.req.query('search')?.trim().toLowerCase();

  let querySql = `
    SELECT c.id, c.tenant_id, c.bot_id, c.chat_id, c.display_name, c.phone, c.tags, c.notes,
           c.total_messages, c.last_message_at, c.state, b.name as bot_name
    FROM conversations c
    LEFT JOIN bots b ON c.bot_id = b.id
    WHERE c.tenant_id = ?
  `;
  const params: unknown[] = [tenantId];

  if (botId && botId !== 'all') {
    querySql += ' AND c.bot_id = ?';
    params.push(botId);
  }

  if (search) {
    querySql += ' AND (LOWER(c.display_name) LIKE ? OR LOWER(c.phone) LIKE ? OR LOWER(c.chat_id) LIKE ?)';
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
  }

  querySql += ' ORDER BY c.last_message_at DESC LIMIT 100';

  const rows = await c.env.DB.prepare(querySql)
    .bind(...params)
    .all<{
      id: string;
      tenant_id: string;
      bot_id: string;
      chat_id: string;
      display_name: string | null;
      phone: string | null;
      tags: string | null;
      notes: string | null;
      total_messages: number | null;
      last_message_at: number;
      state: string;
      bot_name: string | null;
    }>();

  let customers = (rows?.results || []).map((row) => {
    let parsedTags: string[] = [];
    try {
      if (row.tags) parsedTags = JSON.parse(row.tags);
    } catch {}

    return {
      id: row.id,
      bot_id: row.bot_id,
      bot_name: row.bot_name || 'Zalo Bot',
      chat_id: row.chat_id,
      display_name: row.display_name || 'Khách hàng Zalo',
      phone: row.phone || '',
      tags: parsedTags,
      notes: row.notes || '',
      total_messages: row.total_messages || 1,
      last_message_at: row.last_message_at,
      state: row.state,
    };
  });

  if (tag && tag !== 'all') {
    customers = customers.filter((cust) => cust.tags.includes(tag));
  }

  // Calculate quick stats
  const total = customers.length;
  const vipCount = customers.filter((c) => c.tags.includes('VIP')).length;
  const hasPhoneCount = customers.filter((c) => Boolean(c.phone)).length;

  return c.json({
    ok: true,
    customers,
    stats: {
      total,
      vip_count: vipCount,
      has_phone_count: hasPhoneCount,
    },
  });
});

// 2. Export Customers to CSV
customersRouter.get('/export', async (c) => {
  const user = c.get('user');
  const tenantId = user.tenant_id;

  const rows = await c.env.DB.prepare(`
    SELECT c.display_name, c.phone, b.name as bot_name, c.tags, c.notes, c.last_message_at
    FROM conversations c
    LEFT JOIN bots b ON c.bot_id = b.id
    WHERE c.tenant_id = ?
    ORDER BY c.last_message_at DESC
  `)
    .bind(tenantId)
    .all<{
      display_name: string | null;
      phone: string | null;
      bot_name: string | null;
      tags: string | null;
      notes: string | null;
      last_message_at: number;
    }>();

  const lines = ['"Tên Zalo","Số điện thoại","Bot tương tác","Nhãn (Tags)","Ghi chú CSKH","Tương tác cuối"'];

  for (const row of rows?.results || []) {
    let tagsStr = '';
    try {
      if (row.tags) tagsStr = JSON.parse(row.tags).join('; ');
    } catch {}

    const dateStr = new Date(row.last_message_at).toLocaleString('vi-VN');
    const safeName = (row.display_name || 'Khách hàng Zalo').replace(/"/g, '""');
    const safePhone = (row.phone || '').replace(/"/g, '""');
    const safeBot = (row.bot_name || 'Zalo Bot').replace(/"/g, '""');
    const safeNotes = (row.notes || '').replace(/"/g, '""');

    lines.push(`"${safeName}","${safePhone}","${safeBot}","${tagsStr}","${safeNotes}","${dateStr}"`);
  }

  const csvContent = '\uFEFF' + lines.join('\n'); // Add BOM for Excel UTF-8 support
  return new Response(csvContent, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="zalo_baas_customers.csv"',
    },
  });
});

// 3. Get customer detail with recent messages
customersRouter.get('/:id', async (c) => {
  const user = c.get('user');
  const convId = c.req.param('id');

  const customer = await c.env.DB.prepare(`
    SELECT c.id, c.bot_id, c.chat_id, c.display_name, c.phone, c.tags, c.notes,
           c.total_messages, c.last_message_at, c.state, b.name as bot_name
    FROM conversations c
    LEFT JOIN bots b ON c.bot_id = b.id
    WHERE c.id = ? AND c.tenant_id = ?
  `)
    .bind(convId, user.tenant_id)
    .first<{
      id: string;
      bot_id: string;
      chat_id: string;
      display_name: string | null;
      phone: string | null;
      tags: string | null;
      notes: string | null;
      total_messages: number | null;
      last_message_at: number;
      state: string;
      bot_name: string | null;
    }>();

  if (!customer) {
    return c.json({ error: 'Khách hàng không tồn tại' }, 404);
  }

  let parsedTags: string[] = [];
  try {
    if (customer.tags) parsedTags = JSON.parse(customer.tags);
  } catch {}

  const messages = await c.env.DB.prepare(`
    SELECT id, direction, sender, text, created_at
    FROM messages
    WHERE conversation_id = ? AND tenant_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `)
    .bind(convId, user.tenant_id)
    .all<{
      id: string;
      direction: string;
      sender: string;
      text: string;
      created_at: number;
    }>();

  return c.json({
    ok: true,
    customer: {
      ...customer,
      tags: parsedTags,
    },
    messages: (messages?.results || []).reverse(),
  });
});

// 4. Update customer information (Phone, Tags, Notes, Display Name)
customersRouter.patch(
  '/:id',
  requireRole(['tenant_admin', 'tenant_agent', 'platform_owner']),
  async (c) => {
    const user = c.get('user');
    const convId = c.req.param('id');

    const body = await c.req.json<{
      display_name?: string;
      phone?: string;
      tags?: string[];
      notes?: string;
    }>();

    const updates: string[] = [];
    const params: unknown[] = [];

    if (body.display_name !== undefined) {
      updates.push('display_name = ?');
      params.push(body.display_name.trim());
    }
    if (body.phone !== undefined) {
      updates.push('phone = ?');
      params.push(body.phone.trim());
    }
    if (body.tags !== undefined) {
      updates.push('tags = ?');
      params.push(JSON.stringify(body.tags));
    }
    if (body.notes !== undefined) {
      updates.push('notes = ?');
      params.push(body.notes.trim());
    }

    if (updates.length === 0) {
      return c.json({ ok: true, message: 'Không có thay đổi nào' });
    }

    params.push(convId, user.tenant_id);
    await c.env.DB.prepare(
      `UPDATE conversations SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`
    )
      .bind(...params)
      .run();

    const updated = await c.env.DB.prepare(
      `SELECT c.id, c.tenant_id, c.bot_id, c.chat_id, c.display_name, c.phone, c.tags, c.notes,
              c.total_messages, c.last_message_at, c.state, b.name as bot_name
       FROM conversations c
       LEFT JOIN bots b ON c.bot_id = b.id
       WHERE c.id = ? AND c.tenant_id = ?`
    )
      .bind(convId, user.tenant_id)
      .first<{
        id: string;
        tenant_id: string;
        bot_id: string;
        chat_id: string;
        display_name: string | null;
        phone: string | null;
        tags: string | null;
        notes: string | null;
        total_messages: number;
        last_message_at: number;
        state: 'bot' | 'human';
        bot_name: string | null;
      }>();

    let parsedTags: string[] = [];
    if (updated?.tags) {
      try {
        parsedTags = JSON.parse(updated.tags);
      } catch {}
    }

    return c.json({
      ok: true,
      message: 'Cập nhật thông tin khách hàng thành công!',
      customer: updated ? { ...updated, tags: parsedTags } : null,
    });
  }
);

// 5. Direct care message sending from Bot to Customer
customersRouter.post(
  '/:id/send',
  requireRole(['tenant_admin', 'tenant_agent', 'platform_owner']),
  async (c) => {
    const user = c.get('user');
    const convId = c.req.param('id');
    const body = await c.req.json<{ text?: string; message?: string }>();
    const textToSend = body.text || body.message;

    if (!textToSend || !textToSend.trim()) {
      return c.json({ error: 'Nội dung tin nhắn không được để trống' }, 400);
    }

    const conv = await c.env.DB.prepare(
      'SELECT id, bot_id, chat_id FROM conversations WHERE id = ? AND tenant_id = ?'
    )
      .bind(convId, user.tenant_id)
      .first<{ id: string; bot_id: string; chat_id: string }>();

    if (!conv) {
      return c.json({ error: 'Hội thoại khách hàng không tồn tại' }, 404);
    }

    // Decrypt bot token
    const cred = await c.env.DB.prepare(
      'SELECT bot_token_enc FROM bot_credentials WHERE bot_id = ?'
    )
      .bind(conv.bot_id)
      .first<{ bot_token_enc: Uint8Array | ArrayBuffer }>();

    if (!cred) {
      return c.json({ error: 'Chứng thực Bot bị thiếu' }, 404);
    }

    const tokenBytes = cred.bot_token_enc instanceof Uint8Array ? cred.bot_token_enc : new Uint8Array(cred.bot_token_enc);
    const botToken = await decryptAesGcm(tokenBytes, c.env.KEK_V1);
    const zaloClient = new ZaloBotClient(botToken);

    try {
      const now = Date.now();
      const text = textToSend.trim();
      const sent = await zaloClient.sendMessage({ chat_id: conv.chat_id, text });

      // Save message record
      await c.env.DB.prepare(`
        INSERT INTO messages (id, tenant_id, conversation_id, direction, sender, text, zalo_msg_id, created_at)
        VALUES (?, ?, ?, 'out', 'agent', ?, ?, ?)
      `)
        .bind(`msg_${nanoid(16)}`, user.tenant_id, conv.id, text, sent.message_id, now)
        .run();

      // Update conversation last_message_at
      await c.env.DB.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?')
        .bind(now, conv.id)
        .run();

      return c.json({ ok: true, message: 'Đã gửi tin nhắn chăm sóc thành công!', message_id: sent.message_id });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Gửi tin nhắn qua Zalo thất bại: ${msg}` }, 500);
    }
  }
);
