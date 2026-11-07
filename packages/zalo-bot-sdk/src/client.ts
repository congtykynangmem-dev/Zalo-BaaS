// packages/zalo-bot-sdk/src/client.ts
import { ZALO_BOT_API_BASE_URL } from '@zalo-baas/shared';
import type {
  ZaloApiResponse,
  ZaloBotProfile,
  SetWebhookOptions,
  WebhookInfo,
  SendMessageOptions,
  SendChatActionOptions,
  SendPhotoOptions,
  SentMessageResult,
} from './types.js';

export class ZaloBotApiError extends Error {
  constructor(
    message: string,
    public readonly errorCode?: number,
    public readonly description?: string
  ) {
    super(message);
    this.name = 'ZaloBotApiError';
  }
}

export class ZaloBotClient {
  private readonly baseUrl: string;

  constructor(
    private readonly botToken: string,
    baseUrl: string = ZALO_BOT_API_BASE_URL
  ) {
    if (!botToken || botToken.trim() === '') {
      throw new Error('Bot token is required to initialize ZaloBotClient');
    }
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private async request<T>(
    methodName: string,
    payload?: Record<string, unknown>,
    httpMethod: 'GET' | 'POST' = 'POST'
  ): Promise<T> {
    const url = `${this.baseUrl}/bot${this.botToken}/${methodName}`;
    const options: RequestInit = {
      method: httpMethod,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (payload && httpMethod === 'POST') {
      options.body = JSON.stringify(payload);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      let errorDesc = `HTTP error ${response.status}: ${response.statusText}`;
      try {
        const errorJson = (await response.json()) as ZaloApiResponse<unknown>;
        if (errorJson.description) {
          errorDesc = errorJson.description;
        }
      } catch {
        // ignore json parse error on non-json error responses
      }
      throw new ZaloBotApiError(errorDesc, response.status, errorDesc);
    }

    const json = (await response.json()) as ZaloApiResponse<T>;

    if (json.ok === false) {
      throw new ZaloBotApiError(
        json.description || 'Zalo Bot API request returned false',
        json.error_code,
        json.description
      );
    }

    return json.result as T;
  }

  /**
   * Tests bot token and retrieves bot profile.
   */
  async getMe(): Promise<ZaloBotProfile> {
    return this.request<ZaloBotProfile>('getMe', undefined, 'GET');
  }

  /**
   * Sets webhook URL and optional secret token for inbound updates.
   */
  async setWebhook(options: SetWebhookOptions): Promise<boolean> {
    const result = await this.request<boolean | { ok: boolean }>('setWebhook', {
      url: options.url,
      secret_token: options.secret_token,
    });
    return typeof result === 'boolean' ? result : true;
  }

  /**
   * Deletes the currently configured webhook.
   */
  async deleteWebhook(): Promise<boolean> {
    const result = await this.request<boolean | { ok: boolean }>('deleteWebhook', {});
    return typeof result === 'boolean' ? result : true;
  }

  /**
   * Retrieves current webhook status and error details.
   */
  async getWebhookInfo(): Promise<WebhookInfo> {
    return this.request<WebhookInfo>('getWebhookInfo', undefined, 'GET');
  }

  /**
   * Sends typing indicator or other chat actions to the recipient.
   */
  async sendChatAction(options: SendChatActionOptions): Promise<boolean> {
    const result = await this.request<boolean | { ok: boolean }>('sendChatAction', {
      chat_id: options.chat_id,
      action: options.action,
    });
    return typeof result === 'boolean' ? result : true;
  }

  /**
   * Sends a text message (supports Markdown or HTML formatting).
   */
  async sendMessage(options: SendMessageOptions): Promise<SentMessageResult> {
    return this.request<SentMessageResult>('sendMessage', {
      chat_id: options.chat_id,
      text: options.text,
      parse_mode: options.parse_mode ?? 'markdown',
    });
  }

  /**
   * Sends a photo message with optional caption.
   */
  async sendPhoto(options: SendPhotoOptions): Promise<SentMessageResult> {
    return this.request<SentMessageResult>('sendPhoto', {
      chat_id: options.chat_id,
      photo: options.photo,
      caption: options.caption,
      parse_mode: options.parse_mode ?? 'markdown',
    });
  }
}

