// apps/gateway/src/gateway.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from './index.js';
import type { Env } from './types.js';

describe('Gateway Worker (apps/gateway)', () => {
  let mockKV: Map<string, string>;
  let mockQueueMessages: unknown[];
  let env: Env;

  beforeEach(() => {
    mockKV = new Map();
    mockQueueMessages = [];

    env = {
      ENVIRONMENT: 'test',
      KV_CACHE: {
        get: vi.fn(async (key: string) => mockKV.get(key) ?? null),
        put: vi.fn(async (key: string, value: string) => {
          mockKV.set(key, value);
        }),
      } as unknown as KVNamespace,
      Q_INBOUND: {
        send: vi.fn(async (msg: unknown) => {
          mockQueueMessages.push(msg);
        }),
      } as unknown as Queue,
    };
  });

  it('GET /health returns 200 ok', async () => {
    const res = await app.request('/health', {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; service: string };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('gateway');
  });

  it('rejects with 401 if x-bot-api-secret-token is missing', async () => {
    const res = await app.request(
      '/v1/webhook/bot/bot_1',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_name: 'test' }),
      },
      env
    );
    expect(res.status).toBe(401);
  });

  it('rejects with 404 if bot is not found in KV cache', async () => {
    const res = await app.request(
      '/v1/webhook/bot/bot_not_found',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-bot-api-secret-token': 'any_token',
        },
        body: JSON.stringify({ event_name: 'test' }),
      },
      env
    );
    expect(res.status).toBe(404);
  });

  it('rejects with 401 if secret token does not match', async () => {
    mockKV.set(
      'bot:bot_1',
      JSON.stringify({
        bot_id: 'bot_1',
        tenant_id: 'tenant_1',
        status: 'active',
        secret_token: 'valid_secret_123',
        bot_token: 'tok_1',
      })
    );

    const res = await app.request(
      '/v1/webhook/bot/bot_1',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-bot-api-secret-token': 'wrong_secret',
        },
        body: JSON.stringify({ event_name: 'test' }),
      },
      env
    );
    expect(res.status).toBe(401);
  });

  it('successfully enqueues message and returns 200 on valid webhook', async () => {
    mockKV.set(
      'bot:bot_1',
      JSON.stringify({
        bot_id: 'bot_1',
        tenant_id: 'tenant_1',
        status: 'active',
        secret_token: 'secret_123',
        bot_token: 'tok_1',
      })
    );

    const payload = {
      event_name: 'message.text.received',
      message: {
        message_id: 'msg_001',
        date: 1775362520302,
        chat: { id: 'chat_user_1', chat_type: 'PRIVATE' },
        from: { id: 'user_1', is_bot: false, display_name: 'Minh Tuan' },
        text: 'Xin chào bot',
      },
    };

    const res = await app.request(
      '/v1/webhook/bot/bot_1',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-bot-api-secret-token': 'secret_123',
        },
        body: JSON.stringify(payload),
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    // Verify queue received message
    expect(mockQueueMessages.length).toBe(1);
    expect(mockQueueMessages[0]).toEqual(
      expect.objectContaining({
        tenant_id: 'tenant_1',
        bot_id: 'bot_1',
        message_id: 'msg_001',
        text: 'Xin chào bot',
        display_name: 'Minh Tuan',
      })
    );

    // Verify idempotency was stored in KV
    expect(mockKV.has('idem:bot_1:msg_001')).toBe(true);
  });

  it('ignores duplicate message without sending to queue', async () => {
    mockKV.set(
      'bot:bot_1',
      JSON.stringify({
        bot_id: 'bot_1',
        tenant_id: 'tenant_1',
        status: 'active',
        secret_token: 'secret_123',
        bot_token: 'tok_1',
      })
    );
    // Simulate message already processed
    mockKV.set('idem:bot_1:msg_001', '1');

    const payload = {
      event_name: 'message.text.received',
      message: {
        message_id: 'msg_001',
        date: 1775362520302,
        chat: { id: 'chat_user_1', chat_type: 'PRIVATE' },
        from: { id: 'user_1', is_bot: false, display_name: 'Minh Tuan' },
        text: 'Xin chào bot lặp lại',
      },
    };

    const res = await app.request(
      '/v1/webhook/bot/bot_1',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-bot-api-secret-token': 'secret_123',
        },
        body: JSON.stringify(payload),
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; duplicate?: boolean };
    expect(body.ok).toBe(true);
    expect(body.duplicate).toBe(true);
    // Queue should NOT receive duplicate message
    expect(mockQueueMessages.length).toBe(0);
  });
});

