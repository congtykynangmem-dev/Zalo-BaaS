-- Migration: Add rag_scope to bots for strict per-bot vs global RAG isolation
ALTER TABLE bots ADD COLUMN rag_scope TEXT NOT NULL DEFAULT 'bot_and_global';

