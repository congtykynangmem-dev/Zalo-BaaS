// tests/load-simulation.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app as gatewayApp } from '../apps/gateway/src/index.js';
import type { Env as GatewayEnv } from '../apps/gateway/src/types.js';

describe('GIAI ĐOẠN 6: KIỂM THỬ TẢI & CHỐNG NGHẼN IDEMPOTENCY', () => {
  let mockKV: Map<string, string>;
  let mockQueueMessages: unknown[];
  let env: GatewayEnv;

  beforeEach(() => {
    mockKV = new Map();
    mockQueueMessages = [];

    // Seed bot in KV
    mockKV.set(
      'bot:bot_stress_1',
      JSON.stringify({
        bot_id: 'bot_stress_1',
        tenant_id: 'tenant_stress',
        status: 'active',
        secret_token: 'secret_stress_123',
        bot_token: 'tok_stress',
      })
    );

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

  it('xử lý 50 requests đồng thời với độ trễ ACK < 50ms', async () => {
    const concurrentRequests = 50;
    const startTime = performance.now();

    const promises = Array.from({ length: concurrentRequests }, (_, i) => {
      const payload = {
        event_name: 'message.text.received',
        message: {
          message_id: `msg_concurrent_${i}_${Date.now()}`,
          date: Date.now(),
          chat: { id: `chat_user_${i}`, chat_type: 'PRIVATE' },
          from: { id: `u_${i}`, is_bot: false, display_name: `User ${i}` },
          text: `Câu hỏi số ${i}`,
        },
      };

      return gatewayApp.request(
        '/v1/webhook/bot/bot_stress_1',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-bot-api-secret-token': 'secret_stress_123',
          },
          body: JSON.stringify(payload),
        },
        env
      );
    });

    const responses = await Promise.all(promises);
    const totalTimeMs = performance.now() - startTime;
    const avgTimePerRequestMs = totalTimeMs / concurrentRequests;

    // Verify all 50 requests succeeded
    for (const res of responses) {
      expect(res.status).toBe(200);
      const json = (await res.json()) as { ok: boolean };
      expect(json.ok).toBe(true);
    }

    // Verify average latency per request is well under 50ms (typically < 5ms in test)
    expect(avgTimePerRequestMs).toBeLessThan(50);
    // Verify all 50 messages were safely queued
    expect(mockQueueMessages.length).toBe(concurrentRequests);
  });

  it('chặn 100% tin nhắn trùng lặp (Idempotency suppression)', async () => {
    const duplicatedMessageId = 'unique_msg_id_999999';
    const payload = {
      event_name: 'message.text.received',
      message: {
        message_id: duplicatedMessageId,
        date: Date.now(),
        chat: { id: 'chat_user_1', chat_type: 'PRIVATE' },
        from: { id: 'u_1', is_bot: false, display_name: 'Khách hàng' },
        text: 'Tin nhắn gửi lặp do mạng chập chờn',
      },
    };

    const makeRequest = () =>
      gatewayApp.request(
        '/v1/webhook/bot/bot_stress_1',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-bot-api-secret-token': 'secret_stress_123',
          },
          body: JSON.stringify(payload),
        },
        env
      );

    // 1. Initial request from Zalo
    const firstRes = await makeRequest();
    expect(firstRes.status).toBe(200);
    const firstJson = (await firstRes.json()) as { ok: boolean; duplicate?: boolean };
    expect(firstJson.ok).toBe(true);
    expect(firstJson.duplicate).toBeUndefined();

    // 2. Simulate 5 subsequent duplicate retries with identical message_id
    for (let i = 0; i < 5; i++) {
      const retryRes = await makeRequest();
      expect(retryRes.status).toBe(200);
      const retryJson = (await retryRes.json()) as { ok: boolean; duplicate?: boolean };
      expect(retryJson.ok).toBe(true);
      expect(retryJson.duplicate).toBe(true);
    }

    // CRITICAL: Exactly ONE message must be pushed to Queue, the remaining 5 must be suppressed!
    expect(mockQueueMessages.length).toBe(1);
  });
});
