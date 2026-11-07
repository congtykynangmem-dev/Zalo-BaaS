// apps/gateway/src/types.ts
export interface Env {
  ENVIRONMENT: string;
  KV_CACHE: KVNamespace;
  Q_INBOUND: Queue;
}

