// packages/rag/src/types.ts

export interface DocumentChunk {
  ord: number;
  content: string;
  charCount: number;
  estimatedTokens: number;
}

export interface ChunkOptions {
  maxChars?: number; // default: 2000 chars (~500-600 tokens)
  overlapChars?: number; // default: 200 chars (~50-60 tokens)
}

export interface VectorMetadata {
  tenant_id: string;
  bot_id: string;
  doc_id: string;
  chunk_id: string;
  title: string;
  content: string;
}

export interface VectorMatch {
  id: string;
  score: number;
  metadata?: VectorMetadata;
}

export interface VectorizeQueryOptions {
  topK?: number;
  filter?: {
    tenant_id: string;
    bot_id: string;
  };
  returnMetadata?: boolean;
}

