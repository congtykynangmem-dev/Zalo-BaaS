// packages/rag/src/retriever.ts
import { SIMILARITY_THRESHOLD_DEFAULT } from '@zalo-baas/shared';
import type { VectorMatch } from './types.js';

export interface FilterOptions {
  threshold?: number;
  maxResults?: number;
}

/**
 * Filters vector search matches by similarity threshold.
 */
export function filterMatches(
  matches: VectorMatch[],
  options: FilterOptions = {}
): VectorMatch[] {
  const threshold = options.threshold ?? SIMILARITY_THRESHOLD_DEFAULT;
  const maxResults = options.maxResults ?? 5;

  return matches
    .filter((m) => m.score >= threshold && m.metadata?.content)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}

/**
 * Checks if the retrieved chunks meet the strict grounding criteria.
 */
export function isGroundingSufficient(
  matches: VectorMatch[],
  threshold: number = SIMILARITY_THRESHOLD_DEFAULT
): boolean {
  if (!matches || matches.length === 0) {
    return false;
  }
  const maxScore = Math.max(...matches.map((m) => m.score));
  return maxScore >= threshold;
}

