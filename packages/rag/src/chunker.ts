// packages/rag/src/chunker.ts
import type { DocumentChunk, ChunkOptions } from './types.js';

const DEFAULT_MAX_CHARS = 1800; // ~450-600 tokens
const DEFAULT_OVERLAP_CHARS = 200; // ~50 tokens

/**
 * Splits document text into overlapping chunks suitable for embedding.
 */
export function chunkText(rawText: string, options: ChunkOptions = {}): DocumentChunk[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const overlapChars = options.overlapChars ?? DEFAULT_OVERLAP_CHARS;

  const normalized = rawText.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return [];
  }

  // Split text by paragraphs
  const paragraphs = normalized.split(/\n\s*\n/);
  const chunks: DocumentChunk[] = [];

  let currentChunk = '';
  let ord = 1;

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) continue;

    // If single paragraph exceeds maxChars, split it by sentences or characters
    if (trimmedPara.length > maxChars) {
      if (currentChunk.trim()) {
        chunks.push({
          ord: ord++,
          content: currentChunk.trim(),
          charCount: currentChunk.trim().length,
          estimatedTokens: Math.ceil(currentChunk.trim().length / 3.5),
        });
        currentChunk = '';
      }

      // Sub-chunk oversized paragraph
      let start = 0;
      while (start < trimmedPara.length) {
        let end = start + maxChars;
        if (end < trimmedPara.length) {
          // Try to break at last period, newline, or space
          const breakPoint = trimmedPara.lastIndexOf(' ', end);
          if (breakPoint > start + maxChars / 2) {
            end = breakPoint;
          }
        }

        const subText = trimmedPara.slice(start, end).trim();
        if (subText) {
          chunks.push({
            ord: ord++,
            content: subText,
            charCount: subText.length,
            estimatedTokens: Math.ceil(subText.length / 3.5),
          });
        }

        start = end - overlapChars;
        if (start < 0) start = 0;
        if (end >= trimmedPara.length) break;
      }
      continue;
    }

    // Normal paragraph accumulation
    if ((currentChunk + '\n\n' + trimmedPara).length <= maxChars) {
      currentChunk = currentChunk ? currentChunk + '\n\n' + trimmedPara : trimmedPara;
    } else {
      if (currentChunk.trim()) {
        chunks.push({
          ord: ord++,
          content: currentChunk.trim(),
          charCount: currentChunk.trim().length,
          estimatedTokens: Math.ceil(currentChunk.trim().length / 3.5),
        });
      }

      // Add overlap from previous chunk
      if (currentChunk.length > overlapChars) {
        const overlapSlice = currentChunk.slice(currentChunk.length - overlapChars).trim();
        currentChunk = overlapSlice + '\n\n' + trimmedPara;
      } else {
        currentChunk = trimmedPara;
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      ord: ord++,
      content: currentChunk.trim(),
      charCount: currentChunk.trim().length,
      estimatedTokens: Math.ceil(currentChunk.trim().length / 3.5),
    });
  }

  return chunks;
}

