// packages/zalo-bot-sdk/src/types.ts

export interface ZaloApiResponse<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

export interface ZaloBotProfile {
  id: string;
  name: string;
  username?: string;
  is_bot: boolean;
}

export interface SetWebhookOptions {
  url: string;
  secret_token?: string;
}

export interface WebhookInfo {
  url: string;
  has_custom_certificate?: boolean;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
}

export interface SendMessageOptions {
  chat_id: string;
  text: string;
  parse_mode?: 'markdown' | 'html';
}

export interface SendChatActionOptions {
  chat_id: string;
  action: 'typing' | 'upload_photo';
}

export interface SendPhotoOptions {
  chat_id: string;
  photo: string; // URL
  caption?: string;
  parse_mode?: 'markdown' | 'html';
}

export interface SentMessageResult {
  message_id: string;
  date: number;
  chat: {
    id: string;
    chat_type: string;
  };
  text?: string;
}

