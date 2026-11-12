// apps/control-api/src/routes/documents.ts
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { GeminiClient } from '@zalo-baas/llm';
import { chunkText, stitchChunksCleanly, deduplicateDocumentContent } from '@zalo-baas/rag';
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
  const rawContent = deduplicateDocumentContent(content.trim());
  const sizeBytes = new TextEncoder().encode(rawContent).length;

  // 1. Insert document record into D1 (preserves original raw_content without duplicate overlap)
  try {
    await env.DB.prepare(
      `INSERT INTO documents (id, tenant_id, bot_id, title, source_type, r2_key, size_bytes, status, chunk_count, raw_content, created_at)
       VALUES (?, ?, ?, ?, ?, '', ?, 'processing', 0, ?, ?)`
    )
      .bind(docId, tenantId, targetBotId, title, sourceType, sizeBytes, rawContent, now)
      .run();
  } catch {
    await env.DB.prepare(
      `INSERT INTO documents (id, tenant_id, bot_id, title, source_type, r2_key, size_bytes, status, chunk_count, created_at)
       VALUES (?, ?, ?, ?, ?, '', ?, 'processing', 0, ?)`
    )
      .bind(docId, tenantId, targetBotId, title, sourceType, sizeBytes, now)
      .run();
  }

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
  const strict = c.req.query('strict') === '1' || c.req.query('strict') === 'true';

  let query = `
    SELECT d.id, d.bot_id, b.name as bot_name, d.title, d.source_type, d.size_bytes, d.status, d.chunk_count, d.error, d.created_at
    FROM documents d
    LEFT JOIN bots b ON d.bot_id = b.id
    WHERE d.tenant_id = ?
  `;
  const params: unknown[] = [user.tenant_id];

  if (botId === 'all' || botId === 'global') {
    query += " AND (d.bot_id IS NULL OR d.bot_id = '' OR d.bot_id = 'all')";
  } else if (botId) {
    if (strict) {
      // Strictly show only dedicated docs assigned to this bot
      query += ' AND d.bot_id = ?';
    } else {
      // Show dedicated docs AND global docs (with bot-specific sorted first)
      query += " AND (d.bot_id = ? OR d.bot_id IS NULL OR d.bot_id = '' OR d.bot_id = 'all')";
    }
    params.push(botId);
  }

  query += ' ORDER BY CASE WHEN d.bot_id IS NOT NULL THEN 0 ELSE 1 END, d.created_at DESC';

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

    // Commercial Quota Check: Document limit per plan
    try {
      const planRow = await c.env.DB.prepare(
        'SELECT COALESCE(p.max_documents, 5) as max_documents, COALESCE(p.name, UPPER(t.plan_id)) as name FROM tenants t LEFT JOIN plans p ON LOWER(t.plan_id) = LOWER(p.id) WHERE t.id = ?'
      )
        .bind(tenantId)
        .first<{ max_documents: number; name: string }>();

      if (planRow && planRow.max_documents > 0) {
        const countRow = await c.env.DB.prepare(
          'SELECT COUNT(*) as cnt FROM documents WHERE tenant_id = ?'
        )
          .bind(tenantId)
          .first<{ cnt: number }>();

        if (countRow && countRow.cnt >= planRow.max_documents) {
          return c.json(
            {
              error: `Gói cước ${planRow.name} giới hạn tối đa ${planRow.max_documents} tài liệu. Vui lòng nâng cấp gói cước để nạp thêm!`,
              code: 'QUOTA_EXCEEDED',
            },
            403
          );
        }
      }
    } catch {}

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

// 6. Get Document Full Content (clean original text or deduplicated reconstruction)
documentsRouter.get('/documents/:docId/content', async (c) => {
  const user = c.get('user');
  const docId = c.req.param('docId');

  let doc: {
    id: string;
    title: string;
    bot_id: string | null;
    status: string;
    chunk_count: number;
    size_bytes: number;
    raw_content?: string | null;
  } | null = null;

  try {
    doc = await c.env.DB.prepare(
      'SELECT id, title, bot_id, status, chunk_count, size_bytes, raw_content FROM documents WHERE id = ? AND tenant_id = ?'
    )
      .bind(docId, user.tenant_id)
      .first();
  } catch {
    doc = await c.env.DB.prepare(
      'SELECT id, title, bot_id, status, chunk_count, size_bytes FROM documents WHERE id = ? AND tenant_id = ?'
    )
      .bind(docId, user.tenant_id)
      .first();
  }

  if (!doc) {
    return c.json({ error: 'Tài liệu không tồn tại' }, 404);
  }

  let fullContent = doc.raw_content ? doc.raw_content.trim() : '';

  // If raw_content is empty (for documents created prior to this update),
  // reconstruct from chunks without overlapping duplicate sentences/headings
  if (!fullContent) {
    const chunkRows = await c.env.DB.prepare(
      'SELECT content FROM chunks WHERE doc_id = ? AND tenant_id = ? ORDER BY ord ASC'
    )
      .bind(docId, user.tenant_id)
      .all<{ content: string }>();

    const chunks = (chunkRows?.results || []).map((r) => r.content);
    fullContent = stitchChunksCleanly(chunks);

    // Save cleaned reconstructed text as raw_content so it's permanently preserved
    if (fullContent) {
      try {
        await c.env.DB.prepare('UPDATE documents SET raw_content = ? WHERE id = ?')
          .bind(fullContent, docId)
          .run();
      } catch {}
    }
  } else {
    // Run deduplication in case an older version already contained duplicate lines
    const cleaned = deduplicateDocumentContent(fullContent);
    if (cleaned !== fullContent) {
      fullContent = cleaned;
      try {
        await c.env.DB.prepare('UPDATE documents SET raw_content = ? WHERE id = ?')
          .bind(fullContent, docId)
          .run();
      } catch {}
    }
  }

  return c.json({
    ok: true,
    document: doc,
    content: fullContent,
  });
});

// 7. Update Document (Title, Scope, and/or Content with Re-Vectorization)
documentsRouter.patch(
  '/documents/:docId',
  requireRole(['tenant_admin', 'platform_owner']),
  async (c) => {
    const user = c.get('user');
    const docId = c.req.param('docId');
    if (!user.tenant_id) {
      return c.json({ error: 'Tenant không hợp lệ' }, 400);
    }
    const tenantId = user.tenant_id;

    const doc = await c.env.DB.prepare(
      'SELECT id, title, bot_id FROM documents WHERE id = ? AND tenant_id = ?'
    )
      .bind(docId, tenantId)
      .first<{ id: string; title: string; bot_id: string | null }>();

    if (!doc) {
      return c.json({ error: 'Tài liệu không tồn tại' }, 404);
    }

    const body = await c.req.json<{
      title?: string;
      content?: string;
      scope?: 'all' | 'bot';
      bot_id?: string | null;
    }>();

    const newTitle = body.title && body.title.trim() ? body.title.trim() : doc.title;
    let targetBotId: string | null = doc.bot_id;

    if (body.scope === 'all') {
      targetBotId = null;
    } else if (body.scope === 'bot' || body.bot_id !== undefined) {
      if (body.bot_id && body.bot_id !== 'all' && body.bot_id !== 'global') {
        const bot = await c.env.DB.prepare('SELECT id FROM bots WHERE id = ? AND tenant_id = ?')
          .bind(body.bot_id, tenantId)
          .first();
        if (!bot) {
          return c.json({ error: 'Bot được chọn không tồn tại' }, 404);
        }
        targetBotId = body.bot_id;
      } else {
        targetBotId = null;
      }
    }

    // If content is being updated, clean and re-chunk and re-vectorize
    if (body.content !== undefined && body.content.trim() !== '') {
      const cleanContent = deduplicateDocumentContent(body.content.trim());
      const newSizeBytes = new TextEncoder().encode(cleanContent).length;

      // 1. Remove old chunks from Vectorize
      const oldChunks = await c.env.DB.prepare(
        'SELECT id FROM chunks WHERE doc_id = ? AND tenant_id = ?'
      )
        .bind(docId, tenantId)
        .all<{ id: string }>();

      if (c.env.VECTORS && oldChunks.results.length > 0) {
        try {
          await c.env.VECTORS.deleteByIds(oldChunks.results.map((r) => r.id));
        } catch {}
      }

      // 2. Delete old chunks from DB
      await c.env.DB.prepare('DELETE FROM chunks WHERE doc_id = ? AND tenant_id = ?')
        .bind(docId, tenantId)
        .run();

      // 3. Re-chunk text
      const chunks = chunkText(cleanContent);
      const vectorRecords: VectorizeVector[] = [];

      let activeGeminiKey = c.env.GEMINI_API_KEY || '';
      try {
        const keyRow = await c.env.DB.prepare(
          'SELECT gemini_api_key FROM tenant_settings WHERE tenant_id = ?'
        )
          .bind(tenantId)
          .first<{ gemini_api_key: string }>();
        if (keyRow?.gemini_api_key && keyRow.gemini_api_key.trim()) {
          activeGeminiKey = keyRow.gemini_api_key.trim();
        }
      } catch {}

      const gemini = activeGeminiKey ? new GeminiClient(activeGeminiKey) : null;

      for (const chunk of chunks) {
        const chunkId = `chk_${nanoid(16)}`;

        await c.env.DB.prepare(
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

        if (gemini) {
          try {
            const embedResult = await gemini.embedContent({ text: chunk.content });
            vectorRecords.push({
              id: chunkId,
              values: embedResult.values,
              metadata: {
                tenant_id: tenantId,
                bot_id: targetBotId || 'all',
                doc_id: docId || '',
                chunk_id: chunkId,
                title: newTitle,
                content: chunk.content,
              },
            });
          } catch (embedErr) {
            console.warn('[Doc Re-Ingestion] Embedding warning:', embedErr);
          }
        }
      }

      if (c.env.VECTORS && vectorRecords.length > 0) {
        try {
          await c.env.VECTORS.upsert(vectorRecords);
        } catch (vecErr) {
          console.warn('[Doc Re-Ingestion] Vectorize upsert warning:', vecErr);
        }
      }

      // Update doc record with raw_content preserved
      try {
        await c.env.DB.prepare(
          `UPDATE documents SET title = ?, bot_id = ?, size_bytes = ?, chunk_count = ?, raw_content = ?, status = 'ready' WHERE id = ? AND tenant_id = ?`
        )
          .bind(newTitle, targetBotId, newSizeBytes, chunks.length, cleanContent, docId, tenantId)
          .run();
      } catch {
        await c.env.DB.prepare(
          `UPDATE documents SET title = ?, bot_id = ?, size_bytes = ?, chunk_count = ?, status = 'ready' WHERE id = ? AND tenant_id = ?`
        )
          .bind(newTitle, targetBotId, newSizeBytes, chunks.length, docId, tenantId)
          .run();
      }
    } else {
      // Just update title or bot scope
      await c.env.DB.prepare(
        `UPDATE documents SET title = ?, bot_id = ? WHERE id = ? AND tenant_id = ?`
      )
        .bind(newTitle, targetBotId, docId, tenantId)
        .run();

      // Update bot_id in chunks
      await c.env.DB.prepare(
        `UPDATE chunks SET bot_id = ? WHERE doc_id = ? AND tenant_id = ?`
      )
        .bind(targetBotId, docId, tenantId)
        .run();
    }

    return c.json({
      ok: true,
      message: 'Tài liệu đã được cập nhật và vector hóa lại thành công!',
    });
  }
);
