// apps/control-api/src/types.ts

export interface Env {
  ENVIRONMENT: string;
  JWT_SECRET: string;
  KEK_V1: string;
  GEMINI_API_KEY: string;
  WEBHOOK_BASE_URL: string;
  DB: D1Database;
  KV_CACHE: KVNamespace;
  VECTORS: VectorizeIndex;
}

export interface AuthUser {
  id: string;
  tenant_id: string | null;
  email: string;
  role: 'platform_owner' | 'tenant_admin' | 'tenant_agent';
}

export type HonoVariables = {
  user: AuthUser;
};

