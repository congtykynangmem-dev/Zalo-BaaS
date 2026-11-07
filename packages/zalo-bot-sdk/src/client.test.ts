// packages/zalo-bot-sdk/src/client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZaloBotClient, ZaloBotApiError } from './client.js';

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
});

