// packages/shared/src/schemas.ts
import { z } from 'zod';

// 1. Zalo Bot Webhook Inbound Payload Schema
export const ZaloChatSchema = z.object({
  id: z.string(),
  chat_type: z.enum(['PRIVATE', 'GROUP', 'CHANNEL']).default('PRIVATE'),
});

export const ZaloFromSchema = z.object({
  id: z.string(),
  is_bot: z.boolean().default(false),
  display_name: z.string().optional().default('Người dùng Zalo'),
});

export const ZaloMessagePayloadSchema = z.object({
  message_id: z.string(),
  date: z.number(),
  chat: ZaloChatSchema,
  from: ZaloFromSchema,
  text: z.string().optional(),
});

export const ZaloWebhookEventSchema = z.object({
  event_name: z.string(),
  message: ZaloMessagePayloadSchema.optional(),
});

// 2. Queue Inbound Message Schema (Passed from Gateway Worker to Agent Worker)
export const QueueInboundMessageSchema = z.object({
  tenant_id: z.string(),
  bot_id: z.string(),
  event_name: z.string(),
  message_id: z.string(),
  chat_id: z.string(),
  user_id: z.string(),
  display_name: z.string(),
  text: z.string(),
  received_at: z.number(),
});

// 3. Connect Bot API Input Schema
export const ConnectBotInputSchema = z.object({
  tenant_id: z.string().min(1, 'Tenant ID is required'),
  bot_token: z.string().min(10, 'Valid Zalo Bot Token is required'),
  system_prompt: z.string().optional(),
  handover_keywords: z.array(z.string()).optional(),
});

// 4. Send Message API Payload
export const SendMessagePayloadSchema = z.object({
  chat_id: z.string(),
  text: z.string().min(1).max(2000),
  parse_mode: z.enum(['markdown', 'html']).optional().default('markdown'),
});

// 5. Chat Action Payload
export const SendChatActionPayloadSchema = z.object({
  chat_id: z.string(),
  action: z.enum(['typing', 'upload_photo']).default('typing'),
});
