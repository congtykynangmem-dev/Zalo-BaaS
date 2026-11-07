// packages/shared/src/constants.ts

export const ZALO_BOT_API_BASE_URL = 'https://bot-api.zaloplatforms.com';

export const KV_TTL = {
  BOT_CACHE_SECONDS: 300, // 5 minutes
  IDEMPOTENCY_SECONDS: 86400, // 24 hours
  MEMORY_SECONDS: 86400, // 24 hours
  RATE_LIMIT_SECONDS: 60, // 1 minute
} as const;

export const DEFAULT_HANDOVER_MINUTES = 30;

export const SIMILARITY_THRESHOLD_DEFAULT = 0.55;

export const MAX_MEMORY_MESSAGES = 10;
