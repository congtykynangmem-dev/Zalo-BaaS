// packages/zalo-bot-sdk/src/client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ZaloBotClient,
  ZaloBotApiError,
  splitZaloMessageChunks,
  stripMarkdownForPlainZalo,
} from './client.js';

describe('ZaloBotClient', () => {
  const token = 'test_token_12345';
  const baseUrl = 'https://bot-api.test.com';
  let client: ZaloBotClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    client = new ZaloBotClient(token, baseUrl);
  });

  it('should initialize with token and baseUrl', () => {
    expect(client).toBeInstanceOf(ZaloBotClient);
    expect(() => new ZaloBotClient('')).toThrow('Bot token is required');
  });

  it('getMe should call GET /bot<token>/getMe and return profile', async () => {
    const mockProfile = { id: 'bot_1', name: 'Bot KNM', is_bot: true };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, result: mockProfile }),
    } as Response);

    const result = await client.getMe();

    expect(fetchSpy).toHaveBeenCalledWith(
      `${baseUrl}/bot${token}/getMe`,
      expect.objectContaining({ method: 'GET' })
    );
    expect(result).toEqual(mockProfile);
  });

  it('setWebhook should call POST /bot<token>/setWebhook with payload', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, result: true }),
    } as Response);

    const result = await client.setWebhook({
      url: 'https://bot.knm.asia/v1/webhook/bot/123',
      secret_token: 'secret_abc',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      `${baseUrl}/bot${token}/setWebhook`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          url: 'https://bot.knm.asia/v1/webhook/bot/123',
          secret_token: 'secret_abc',
        }),
      })
    );
    expect(result).toBe(true);
  });

  it('sendMessage should send markdown message by default', async () => {
    const mockMsgResult = {
      message_id: 'msg_999',
      date: 123456789,
      chat: { id: 'chat_1', chat_type: 'PRIVATE' },
      text: '**Hello**',
    };

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, result: mockMsgResult }),
    } as Response);

    const result = await client.sendMessage({
      chat_id: 'chat_1',
      text: '**Hello**',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      `${baseUrl}/bot${token}/sendMessage`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          chat_id: 'chat_1',
          text: '**Hello**',
          parse_mode: 'markdown',
        }),
      })
    );
    expect(result).toEqual(mockMsgResult);
  });

  it('sendChatAction should send typing action', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, result: true }),
    } as Response);

    const result = await client.sendChatAction({
      chat_id: 'chat_1',
      action: 'typing',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      `${baseUrl}/bot${token}/sendChatAction`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          chat_id: 'chat_1',
          action: 'typing',
        }),
      })
    );
    expect(result).toBe(true);
  });

  it('should throw ZaloBotApiError when API responds with ok: false', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: false,
        error_code: 400,
        description: 'Bad Request: chat not found',
      }),
    } as Response);

    await expect(
      client.sendMessage({ chat_id: 'invalid', text: 'hi' })
    ).rejects.toThrow(ZaloBotApiError);
  });

  it('sendMessageResilient splits messages >1800 chars and retries without parse_mode on Markdown error', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      // Chunk 1 fails with markdown parse error on first attempt, then succeeds in plain text
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: false,
          error_code: 400,
          description: "Bad Request: can't parse entities",
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: { message_id: 'msg_chunk_1', date: 1700000001 },
        }),
      } as Response)
      // Chunk 2 succeeds immediately
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: { message_id: 'msg_chunk_2', date: 1700000002 },
        }),
      } as Response);

    const longText = `${'**Gói Starter** — 199.000đ/tháng\n'.repeat(65)}`;
    expect(splitZaloMessageChunks(longText, 1800).length).toBe(2);

    const results = await client.sendMessageResilient({
      chat_id: 'chat_123',
      text: longText,
    });

    expect(results).toHaveLength(2);
    expect(results[0].message_id).toBe('msg_chunk_1');
    expect(results[1].message_id).toBe('msg_chunk_2');

    // Second call (retry) must omit parse_mode and strip Markdown markers
    const retryBody = JSON.parse(fetchSpy.mock.calls[1][1]!.body as string);
    expect(retryBody.parse_mode).toBeUndefined();
    expect(retryBody.text).not.toContain('**');
    expect(stripMarkdownForPlainZalo('## **Giá gói**\n| A | B |\n| --- | --- |')).not.toContain('| --- |');
  });

  it('sendMessageResilient does not retry on 401 unauthorized', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: false,
        error_code: 401,
        description: 'Unauthorized: invalid bot token',
      }),
    } as Response);

    await expect(
      client.sendMessageResilient({ chat_id: 'chat_123', text: 'hello' })
    ).rejects.toThrow(ZaloBotApiError);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

