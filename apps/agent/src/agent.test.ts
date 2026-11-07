// apps/agent/src/agent.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processInboundMessage } from './index.js';
import type { Env } from './types.js';
import type { QueueInboundMessage } from '@zalo-baas/shared';

describe('Agent Worker with Agentic RAG (apps/agent)', () => {
  let mockKV: Map<string, string>;
  let mockD1Queries: { sql: string; params: unknown[] }[];
  let mockVectorMatches: unknown[];
  let env: Env;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockKV = new Map();
    mockD1Queries = [];
    mockVectorMatches = [];

    // Mock D1
    const mockStatement = (sql: string) => {
      let boundParams: unknown[] = [];
      return {
        bind: (...params: unknown[]) => {
          boundParams = params;
          return {
            first: vi.fn(async () => {
              mockD1Queries.push({ sql, params: boundParams });
              if (sql.includes('SELECT name, system_prompt, strict_grounding')) {
                return {
                  name: 'Test Bot',
                  system_prompt: 'Thân thiện',
                  strict_grounding: 0,
                  model_policy: 'auto',
                  handover_keywords: null,
                  handover_minutes: 30,
                };
              }
              if (sql.includes('SELECT id, state, human_until FROM conversations')) {
                return { id: 'conv_123', state: 'ai', human_until: null };
              }
              return null;
            }),
            run: vi.fn(async () => {
              mockD1Queries.push({ sql, params: boundParams });
              return { success: true };
            }),
          };
        },
      };
    };

    env = {
      ENVIRONMENT: 'test',
      KEK_V1: 'dummy_kek',
      GEMINI_API_KEY: 'test_gemini_key',
      KV_CACHE: {
        get: vi.fn(async (key: string) => mockKV.get(key) ?? null),
        put: vi.fn(async (key: string, value: string) => {
          mockKV.set(key, value);
        }),
      } as unknown as KVNamespace,
      DB: {
        prepare: vi.fn((sql: string) => mockStatement(sql)),
      } as unknown as D1Database,
      VECTORS: {
        query: vi.fn(async () => ({
          matches: mockVectorMatches,
        })),
      } as unknown as VectorizeIndex,
    };
  });

  it('runs complete RAG pipeline with Vectorize & Gemini Flash', async () => {
    mockKV.set(
      'bot:bot_1',
      JSON.stringify({
        bot_id: 'bot_1',
        tenant_id: 'tenant_1',
        status: 'active',
        secret_token: 'secret_1',
        bot_token: 'valid_bot_token_abc',
      })
    );

    mockVectorMatches = [
      {
        id: 'chunk_1',
        score: 0.88,
        metadata: {
          tenant_id: 'tenant_1',
          bot_id: 'bot_1',
          doc_id: 'doc_1',
          chunk_id: 'c1',
          title: 'Chính sách bảo hành.pdf',
          content: 'Sản phẩm được bảo hành 12 tháng chính hãng.',
        },
      },
    ];

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const urlStr = url.toString();
      if (urlStr.includes('/sendChatAction')) {
        return { ok: true, json: async () => ({ ok: true, result: true }) } as Response;
      }
      if (urlStr.includes('text-embedding-004')) {
        return {
          ok: true,
          json: async () => ({ embedding: { values: [0.1, 0.2, 0.3] } }),
        } as Response;
      }
      if (urlStr.includes('gemini-2.5-flash:generateContent')) {
        return {
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: 'Dạ sản phẩm được **bảo hành 12 tháng** chính hãng ạ (Nguồn: Chính sách bảo hành.pdf).',
                    },
                  ],
                },
              },
            ],
            usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 25 },
          }),
        } as Response;
      }
      if (urlStr.includes('/sendMessage')) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            result: { message_id: 'msg_zalo_resp_1', date: 123456789 },
          }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    const payload: QueueInboundMessage = {
      tenant_id: 'tenant_1',
      bot_id: 'bot_1',
      event_name: 'message.text.received',
      message_id: 'msg_in_1',
      chat_id: 'chat_1',
      user_id: 'u1',
      display_name: 'Tuấn',
      text: 'Sản phẩm bảo hành bao lâu?',
      received_at: Date.now(),
    };

    await processInboundMessage(payload, env);

    // Typing action sent
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/sendChatAction'),
      expect.any(Object)
    );

    // Vectorize query executed
    expect(env.VECTORS.query).toHaveBeenCalled();

    // Outbound message sent via Zalo Bot API
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/sendMessage'),
      expect.objectContaining({
        body: expect.stringContaining('bảo hành 12 tháng'),
      })
    );

    // KV memory updated
    expect(mockKV.has('mem:bot_1:chat_1')).toBe(true);
  });

  it('triggers human handover when message contains keyword', async () => {
    mockKV.set(
      'bot:bot_1',
      JSON.stringify({
        bot_id: 'bot_1',
        tenant_id: 'tenant_1',
        status: 'active',
        secret_token: 'secret_1',
        bot_token: 'valid_bot_token_abc',
      })
    );

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = url.toString();
      if (urlStr.includes('/sendChatAction')) {
        return { ok: true, json: async () => ({ ok: true, result: true }) } as Response;
      }
      if (urlStr.includes('/sendMessage')) {
        return {
          ok: true,
          json: async () => ({ ok: true, result: { message_id: 'msg_ho_resp' } }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    const payload: QueueInboundMessage = {
      tenant_id: 'tenant_1',
      bot_id: 'bot_1',
      event_name: 'message.text.received',
      message_id: 'msg_in_2',
      chat_id: 'chat_1',
      user_id: 'u1',
      display_name: 'Tuấn',
      text: 'Cho tôi gặp nhân viên tư vấn',
      received_at: Date.now(),
    };

    await processInboundMessage(payload, env);

    // Handover ticket and conversation update executed
    const sqlStatements = mockD1Queries.map((q) => q.sql.replace(/\s+/g, ' '));
    expect(sqlStatements.some((s) => s.includes("UPDATE conversations SET state = 'human'"))).toBe(true);
    expect(sqlStatements.some((s) => s.includes('INSERT INTO handovers'))).toBe(true);

    // Handover notification sent
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/sendMessage'),
      expect.objectContaining({
        body: expect.stringContaining('chuyển tiếp tới nhân viên tư vấn'),
      })
    );

    // Gemini should NOT be called
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('generateContent'),
      expect.any(Object)
    );
  });

  it('enforces monthly quota limit and sends fallback message without calling Gemini', async () => {
    mockKV.set(
      'bot:bot_1',
      JSON.stringify({
        bot_id: 'bot_1',
        tenant_id: 'tenant_1',
        status: 'active',
        secret_token: 'secret_1',
        bot_token: 'valid_bot_token_abc',
      })
    );

    // Mock D1 to return monthlyLimit = 1000 and total_used = 1000
    const originalPrepare = env.DB.prepare;
    env.DB.prepare = vi.fn((sql: string) => {
      const normSql = sql.replace(/\s+/g, ' ');
      if (normSql.includes('SELECT p.monthly_ai_messages FROM tenants t')) {
        return {
          bind: () => ({
            first: async () => ({ monthly_ai_messages: 1000 }),
          }),
        } as unknown as D1PreparedStatement;
      }
      if (normSql.includes('SELECT SUM(ai_messages) as total_used FROM usage_daily')) {
        return {
          bind: () => ({
            first: async () => ({ total_used: 1000 }), // Reached 100% quota
          }),
        } as unknown as D1PreparedStatement;
      }
      return originalPrepare(sql);
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const urlStr = url.toString();
      if (urlStr.includes('/sendChatAction')) {
        return { ok: true, json: async () => ({ ok: true, result: true }) } as Response;
      }
      if (urlStr.includes('/sendMessage')) {
        return {
          ok: true,
          json: async () => ({ ok: true, result: { message_id: 'msg_quota_resp' } }),
        } as Response;
      }
      return { ok: false } as Response;
    });

    const payload: QueueInboundMessage = {
      tenant_id: 'tenant_1',
      bot_id: 'bot_1',
      event_name: 'message.text.received',
      message_id: 'msg_in_3',
      chat_id: 'chat_1',
      user_id: 'u1',
      display_name: 'Tuấn',
      text: 'Tư vấn giúp tôi sản phẩm',
      received_at: Date.now(),
    };

    await processInboundMessage(payload, env);

    // Outbound quota warning message sent via Zalo Bot API
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/sendMessage'),
      expect.objectContaining({
        body: expect.stringContaining('đạt giới hạn trong tháng'),
      })
    );

    // Gemini generation should NOT be called to prevent extra cost
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('generateContent'),
      expect.any(Object)
    );
  });
});
