// apps/control-api/src/routes/documents.ts
import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import { GeminiClient } from '@zalo-baas/llm';
import { chunkText } from '@zalo-baas/rag';
import { authMiddleware, requireRole } from '../auth.js';
import type { Env, HonoVariables } from '../types.js';

export const documentsRouter = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

documentsRouter.use('*', authMiddleware);

// 1. List documents for a specific bot
documentsRouter.get('/bots/:botId/documents', async (c) => {
  const user = c.get('user');
  const botId = c.req.param('botId');

  const docs = await c.env.DB.prepare(
    `SELECT id, title, source_type, size_bytes, status, chunk_count, error, created_at
     FROM documents WHERE bot_id = ? AND tenant_id = ? ORDER BY created_at DESC`
  )
    .bind(botId, user.tenant_id)
    .all();

  return c.json({ documents: docs.results });
});

// 2. Upload / Ingest plain text or markdown document into bot's knowledge base
documentsRouter.post(
  '/bots/:botId/documents',
  requireRole(['tenant_admin', 'platform_owner']),
  async (c) => {
    const user = c.get('user');
    const botId = c.req.param('botId') ?? '';
    const tenantId = user.tenant_id ?? '';

    if (!tenantId) {
      return c.json({ error: 'Tenant context required' }, 400);
    }
    if (!botId) {
      return c.json({ error: 'Bot ID required' }, 400);
    }

    const body = await c.req.json<{
      title?: string;
      content?: string;
    }>();

    if (!body.title || !body.content || body.content.trim() === '') {
      return c.json({ error: 'Title and content are required' }, 400);
    }

    // Verify bot belongs to tenant
    const bot = await c.env.DB.prepare('SELECT id FROM bots WHERE id = ? AND tenant_id = ?')
      .bind(botId, tenantId)
      .first();

    if (!bot) {
      return c.json({ error: 'Bot not found' }, 404);
    }

    const docId = `doc_${nanoid(16)}`;
    const now = Date.now();
    const title = body.title.trim();
    const rawContent = body.content.trim();
    const sizeBytes = new TextEncoder().encode(rawContent).length;

    // Create document record
    await c.env.DB.prepare(
      `INSERT INTO documents (id, tenant_id, bot_id, title, source_type, r2_key, size_bytes, status, chunk_count, created_at)
       VALUES (?, ?, ?, ?, 'upload', '', ?, 'processing', 0, ?)`
    )
      .bind(docId, tenantId, botId, title, sizeBytes, now)
      .run();

    // Run chunking
    const chunks = chunkText(rawContent);
    const gemini = new GeminiClient(c.env.GEMINI_API_KEY);
    const vectorRecords: VectorizeVector[] = [];

    try {
      for (const chunk of chunks) {
        const chunkId = `chk_${nanoid(16)}`;

        // Insert chunk into D1
        await c.env.DB.prepare(
          `INSERT INTO chunks (id, tenant_id, bot_id, doc_id, ord, content, token_count)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            chunkId,
            tenantId,
            botId,
            docId,
            chunk.ord,
            chunk.content,
            chunk.estimatedTokens
          )
          .run();

        // Generate embedding vector
        const embedResult = await gemini.embedContent({ text: chunk.content });

        vectorRecords.push({
          id: chunkId,
          values: embedResult.values,
          metadata: {
            tenant_id: tenantId,
            bot_id: botId,
            doc_id: docId,
            chunk_id: chunkId,
            title,
            content: chunk.content,
          },
        });
      }

      // Upsert into Cloudflare Vectorize
      if (c.env.VECTORS && vectorRecords.length > 0) {
        await c.env.VECTORS.upsert(vectorRecords);
      }

      // Update document status to ready
      await c.env.DB.prepare(
        `UPDATE documents SET status = 'ready', chunk_count = ? WHERE id = ?`
      )
        .bind(chunks.length, docId)
        .run();

      return c.json({
        ok: true,
        document: {
          id: docId,
          title: body.title.trim(),
          status: 'ready',
          chunk_count: chunks.length,
          size_bytes: sizeBytes,
        },
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Processing failed';
      await c.env.DB.prepare(
        `UPDATE documents SET status = 'failed', error = ? WHERE id = ?`
      )
        .bind(errorMsg, docId)
        .run();

      return c.json({ error: `Ingestion failed: ${errorMsg}` }, 500);
    }
  }
);

// 3. Delete document
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
