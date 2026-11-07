// packages/shared/src/types.ts
import { z } from 'zod';
import {
  ZaloWebhookEventSchema,
  ZaloMessagePayloadSchema,
  QueueInboundMessageSchema,
  ConnectBotInputSchema,
  SendMessagePayloadSchema,
  SendChatActionPayloadSchema,
} from './schemas.js';

export type ZaloWebhookEvent = z.infer<typeof ZaloWebhookEventSchema>;
export type ZaloMessagePayload = z.infer<typeof ZaloMessagePayloadSchema>;
export type QueueInboundMessage = z.infer<typeof QueueInboundMessageSchema>;
export type ConnectBotInput = z.infer<typeof ConnectBotInputSchema>;
export type SendMessagePayload = z.infer<typeof SendMessagePayloadSchema>;
export type SendChatActionPayload = z.infer<typeof SendChatActionPayloadSchema>;

export interface BotCacheData {
  bot_id: string;
  tenant_id: string;
  status: 'active' | 'paused' | 'error';
  secret_token: string;
  bot_token: string;
}

export interface ConversationMemoryItem {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ConversationMemory {
  messages: ConversationMemoryItem[];
}
