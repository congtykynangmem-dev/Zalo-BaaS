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
   * Sends a text message (supports Markdown, HTML, or plain text via 'none').
   */
  async sendMessage(options: SendMessageOptions): Promise<SentMessageResult> {
    const payload: Record<string, unknown> = {
      chat_id: options.chat_id,
      text: options.text,
    };
    if (options.parse_mode !== 'none') {
      payload.parse_mode = options.parse_mode ?? 'markdown';
    }
    return this.request<SentMessageResult>('sendMessage', payload);
  }

  /**
   * Splits long text cleanly under Zalo's 2000-character limit and retries as plain text
   * if Zalo rejects Markdown formatting.
   */
  async sendMessageResilient(options: SendMessageOptions): Promise<SentMessageResult[]> {
    const chunks = splitZaloMessageChunks(options.text, 1800);
    const results: SentMessageResult[] = [];

    for (const chunk of chunks) {
      try {
        const res = await this.sendMessage({
          chat_id: options.chat_id,
          text: chunk,
          parse_mode: options.parse_mode,
        });
        results.push(res);
      } catch (err) {
        const isNonRetryable =
          err instanceof ZaloBotApiError &&
          (err.errorCode === 401 ||
            err.errorCode === 403 ||
            err.errorCode === -213 ||
            /unauthorized|invalid token|chat not found|user has not followed/i.test(err.message));

        if (isNonRetryable || options.parse_mode === 'none') {
          throw err;
        }

        // Retry without parse_mode and strip raw markdown syntax so message still delivers cleanly
        const plainChunks = splitZaloMessageChunks(stripMarkdownForPlainZalo(chunk), 1800);
        for (const plain of plainChunks) {
          const res = await this.sendMessage({
            chat_id: options.chat_id,
            text: plain,
            parse_mode: 'none',
          });
          results.push(res);
        }
      }
    }

    return results;
  }

  /**
   * Sends a photo message with optional caption.
   */
  async sendPhoto(options: SendPhotoOptions): Promise<SentMessageResult> {
    const payload: Record<string, unknown> = {
      chat_id: options.chat_id,
      photo: options.photo,
      caption: options.caption,
    };
    if (options.parse_mode !== 'none') {
      payload.parse_mode = options.parse_mode ?? 'markdown';
    }
    return this.request<SentMessageResult>('sendPhoto', payload);
  }
}

/**
 * Splits a long message into chunks <= maxLength at natural boundaries.
 */
export function splitZaloMessageChunks(text: string, maxLength = 1800): string[] {
  const clean = (text || '').trim();
  if (!clean) return [];
  if (clean.length <= maxLength) return [clean];

  const chunks: string[] = [];
  let remaining = clean;

  while (remaining.length > maxLength) {
    let splitIdx = remaining.lastIndexOf('\n\n', maxLength);
    if (splitIdx < maxLength * 0.4) {
      splitIdx = remaining.lastIndexOf('\n', maxLength);
    }
    if (splitIdx < maxLength * 0.4) {
      splitIdx = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIdx <= 0) {
      splitIdx = maxLength;
    }

    const part = remaining.slice(0, splitIdx).trim();
    if (part) chunks.push(part);
    remaining = remaining.slice(splitIdx).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

/**
 * Strips Markdown formatting markers into clean readable plain text for fallback delivery.
 */
export function stripMarkdownForPlainZalo(text: string): string {
  return (text || '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|\s)_([^_\n]+)_(\s|$|[.,!?;:])/g, '$1$2$3')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/\|?-{3,}\|?/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

