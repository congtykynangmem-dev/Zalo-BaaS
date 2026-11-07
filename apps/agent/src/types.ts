// apps/agent/src/types.ts
export interface Env {
  ENVIRONMENT: string;
  KEK_V1: string;
  GEMINI_API_KEY: string;
  DB: D1Database;
  KV_CACHE: KVNamespace;
  VECTORS: VectorizeIndex;
}

export interface BotConfigRow {
  name: string;
  system_prompt: string | null;
  strict_grounding: number;
  model_policy: string;
  handover_keywords: string | null;
  handover_minutes: number;
}
