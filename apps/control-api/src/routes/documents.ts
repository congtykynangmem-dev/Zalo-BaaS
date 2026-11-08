// apps/control-api/src/routes/documents.ts
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { GeminiClient } from '@zalo-baas/llm';
import { chunkText } from '@zalo-baas/rag';
import { authMiddleware, requireRole } from '../auth.js';
import type { Env, HonoVariables } from '../types.js';

export const documentsRouter = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

documentsRouter.use('*', authMiddleware);

interface IngestOptions {
  title: string;
  content: string;
  targetBotId: string | null;
  tenantId: string;
  sourceType?: string;
  env: Env;
}

// Helper to chunk, embed, and ingest a document
async function ingestDocument(opts: IngestOptions) {
  const { title, content, targetBotId, tenantId, sourceType = 'upload', env } = opts;
  const docId = `doc_${nanoid(16)}`;
  const now = Date.now();
  const rawContent = content.trim();
  const sizeBytes = new TextEncoder().encode(rawContent).length;

  // 1. Insert document record into D1
  await env.DB.prepare(
    `INSERT INTO documents (id, tenant_id, bot_id, title, source_type, r2_key, size_bytes, status, chunk_count, created_at)
     VALUES (?, ?, ?, ?, ?, '', ?, 'processing', 0, ?)`
  )
    .bind(docId, tenantId, targetBotId, title, sourceType, sizeBytes, now)
    .run();

  // 2. Chunk text
  const chunks = chunkText(rawContent);
  const vectorRecords: VectorizeVector[] = [];

  let activeGeminiKey = env.GEMINI_API_KEY || '';
  try {
    const keyRow = await env.DB.prepare(
      'SELECT gemini_api_key FROM tenant_settings WHERE tenant_id = ?'
    )
      .bind(tenantId)
      .first<{ gemini_api_key: string }>();
    if (keyRow?.gemini_api_key && keyRow.gemini_api_key.trim()) {
      activeGeminiKey = keyRow.gemini_api_key.trim();
    }
  } catch {}

  const hasGemini = Boolean(activeGeminiKey && activeGeminiKey.trim());
  const gemini = hasGemini ? new GeminiClient(activeGeminiKey) : null;

  try {
    for (const chunk of chunks) {
      const chunkId = `chk_${nanoid(16)}`;

      // Insert chunk into D1
      await env.DB.prepare(
        `INSERT INTO chunks (id, tenant_id, bot_id, doc_id, ord, content, token_count)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          chunkId,
          tenantId,
          targetBotId,
          docId,
          chunk.ord,
          chunk.content,
          chunk.estimatedTokens
        )
        .run();

      // Generate embedding if Gemini API key is configured
      if (gemini) {
        try {
          const embedResult = await gemini.embedContent({ text: chunk.content });
          vectorRecords.push({
            id: chunkId,
            values: embedResult.values,
            metadata: {
              tenant_id: tenantId,
              bot_id: targetBotId || 'all',
              doc_id: docId,
              chunk_id: chunkId,
              title,
              content: chunk.content,
            },
          });
        } catch (embedErr) {
          console.warn('[Doc Ingestion] Embedding warning for chunk:', embedErr);
        }
      }
    }

    // 3. Upsert into Vectorize if available
    if (env.VECTORS && vectorRecords.length > 0) {
      try {
        await env.VECTORS.upsert(vectorRecords);
      } catch (vecErr) {
        console.warn('[Doc Ingestion] Vectorize upsert warning:', vecErr);
      }
    }

    // 4. Update document status to ready
    await env.DB.prepare(
      `UPDATE documents SET status = 'ready', chunk_count = ? WHERE id = ?`
    )
      .bind(chunks.length, docId)
      .run();

    return {
      id: docId,
      title,
      bot_id: targetBotId,
      status: 'ready' as const,
      chunk_count: chunks.length,
      size_bytes: sizeBytes,
      created_at: now,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Processing failed';
    await env.DB.prepare(
      `UPDATE documents SET status = 'failed', error = ? WHERE id = ?`
    )
      .bind(errorMsg, docId)
      .run();

    throw new Error(`Ingestion failed: ${errorMsg}`);
  }
}

// 1. List all documents (with flexible filtering: all, global, or bot-specific)
documentsRouter.get('/documents', async (c) => {
  const user = c.get('user');
  const botId = c.req.query('bot_id');

  let query = `
    SELECT d.id, d.bot_id, b.name as bot_name, d.title, d.source_type, d.size_bytes, d.status, d.chunk_count, d.error, d.created_at
    FROM documents d
    LEFT JOIN bots b ON d.bot_id = b.id
    WHERE d.tenant_id = ?
  `;
  const params: unknown[] = [user.tenant_id];

  if (botId === 'all' || botId === 'global') {
    query += ' AND d.bot_id IS NULL';
  } else if (botId) {
    // When a specific bot is chosen, show both its dedicated docs AND the tenant global docs
    query += ' AND (d.bot_id = ? OR d.bot_id IS NULL)';
    params.push(botId);
  }

  query += ' ORDER BY d.created_at DESC';

  const docs = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ documents: docs.results || [] });
});

// 2. Backward-compatible route for specific bot
documentsRouter.get('/bots/:botId/documents', async (c) => {
  const user = c.get('user');
  const botId = c.req.param('botId');

  const docs = await c.env.DB.prepare(
    `SELECT d.id, d.bot_id, b.name as bot_name, d.title, d.source_type, d.size_bytes, d.status, d.chunk_count, d.error, d.created_at
     FROM documents d
     LEFT JOIN bots b ON d.bot_id = b.id
     WHERE d.tenant_id = ? AND (d.bot_id = ? OR d.bot_id IS NULL)
     ORDER BY d.created_at DESC`
  )
    .bind(user.tenant_id, botId)
    .all();

  return c.json({ documents: docs.results || [] });
});

// 3. Flexible document upload / ingest (supports both global and bot-specific)
documentsRouter.post(
  '/documents',
  requireRole(['tenant_admin', 'platform_owner']),
  async (c) => {
    const user = c.get('user');
    const tenantId = user.tenant_id;
    if (!tenantId) {
      return c.json({ error: 'Tenant context required' }, 400);
    }

    const body = await c.req.json<{
      title?: string;
      content?: string;
      bot_id?: string | null;
      scope?: 'all' | 'bot';
      source_type?: string;
    }>();

    if (!body.title || !body.content || body.content.trim() === '') {
      return c.json({ error: 'Tiêu đề và nội dung tài liệu là bắt buộc' }, 400);
    }

    let targetBotId: string | null = null;
    const isBotScope = body.scope === 'bot' || (body.bot_id && body.bot_id !== 'all' && body.bot_id !== 'global');

    if (isBotScope && body.bot_id) {
      const bot = await c.env.DB.prepare('SELECT id FROM bots WHERE id = ? AND tenant_id = ?')
        .bind(body.bot_id, tenantId)
        .first();
      if (!bot) {
        return c.json({ error: 'Bot không tồn tại hoặc không thuộc tổ chức của bạn' }, 404);
      }
      targetBotId = body.bot_id;
    }

    try {
      const doc = await ingestDocument({
        title: body.title.trim(),
        content: body.content.trim(),
        targetBotId,
        tenantId,
        sourceType: body.source_type || 'upload',
        env: c.env,
      });

      return c.json({ ok: true, document: doc });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Nạp tài liệu thất bại: ${msg}` }, 500);
    }
  }
);

// 4. Backward-compatible route for /bots/:botId/documents POST
documentsRouter.post(
  '/bots/:botId/documents',
  requireRole(['tenant_admin', 'platform_owner']),
  async (c) => {
    const user = c.get('user');
    const botId = c.req.param('botId') ?? '';
    const tenantId = user.tenant_id ?? '';

    if (!tenantId || !botId) {
      return c.json({ error: 'Tenant context and Bot ID required' }, 400);
    }

    const body = await c.req.json<{
      title?: string;
      content?: string;
      scope?: 'all' | 'bot';
      source_type?: string;
    }>();

    if (!body.title || !body.content || body.content.trim() === '') {
      return c.json({ error: 'Tiêu đề và nội dung tài liệu là bắt buộc' }, 400);
    }

    let targetBotId: string | null = botId;
    if (botId === 'all' || body.scope === 'all') {
      targetBotId = null;
    } else {
      const bot = await c.env.DB.prepare('SELECT id FROM bots WHERE id = ? AND tenant_id = ?')
        .bind(botId, tenantId)
        .first();
      if (!bot) {
        return c.json({ error: 'Bot không tồn tại' }, 404);
      }
    }

    try {
      const doc = await ingestDocument({
        title: body.title.trim(),
        content: body.content.trim(),
        targetBotId,
        tenantId,
        sourceType: body.source_type || 'upload',
        env: c.env,
      });

      return c.json({ ok: true, document: doc });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: `Nạp tài liệu thất bại: ${msg}` }, 500);
    }
  }
);

// 5. Delete document
documentsRouter.delete(
  '/documents/:docId',
  requireRole(['tenant_admin', 'platform_owner']),
  async (c) => {
    const user = c.get('user');
    const docId = c.req.param('docId');

    const doc = await c.env.DB.prepare(
      'SELECT id, bot_id FROM documents WHERE id = ? AND tenant_id = ?'
    )
      .bind(docId, user.tenant_id)
      .first<{ id: string; bot_id: string }>();

    if (!doc) {
      return c.json({ error: 'Document not found' }, 404);
    }

    // Get all chunk IDs to remove from Vectorize
    const chunks = await c.env.DB.prepare(
      'SELECT id FROM chunks WHERE doc_id = ? AND tenant_id = ?'
    )
      .bind(docId, user.tenant_id)
      .all<{ id: string }>();

    if (c.env.VECTORS && chunks.results.length > 0) {
      const chunkIds = chunks.results.map((c) => c.id);
      try {
        await c.env.VECTORS.deleteByIds(chunkIds);
      } catch {
        // ignore vectorize delete failure if index doesn't have it
      }
    }

    await c.env.DB.prepare('DELETE FROM documents WHERE id = ? AND tenant_id = ?')
      .bind(docId, user.tenant_id)
      .run();

    return c.json({ ok: true, message: 'Document deleted successfully' });
  }
);
