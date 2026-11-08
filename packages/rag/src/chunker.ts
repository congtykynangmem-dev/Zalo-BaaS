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

    // Normal paragraph accumulation: keep natural paragraph boundaries clean
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

      currentChunk = trimmedPara;
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

/**
 * Seamlessly stitches document chunks together into full original text
 * while identifying and eliminating any overlapping suffixes/prefixes.
 */
export function stitchChunksCleanly(chunks: string[]): string {
  if (!chunks || chunks.length === 0) return '';
  if (chunks.length === 1) return deduplicateDocumentContent(chunks[0].trim());

  let result = chunks[0].trimEnd();

  for (let i = 1; i < chunks.length; i++) {
    const nextChunk = chunks[i].trimStart();
    const maxOverlap = Math.min(800, result.length, nextChunk.length);
    let matchedLen = 0;

    // 1. Character-level suffix-prefix match
    for (let len = maxOverlap; len >= 15; len--) {
      const suffix = result.slice(result.length - len);
      if (nextChunk.startsWith(suffix)) {
        matchedLen = len;
        break;
      }
    }

    if (matchedLen > 0) {
      result = result + nextChunk.slice(matchedLen);
    } else {
      // 2. Line-level suffix-prefix match (handles whitespace / indentation variances)
      const linesRes = result.split('\n');
      const linesNext = nextChunk.split('\n');
      let lineMatch = 0;

      for (let l = Math.min(15, linesRes.length, linesNext.length); l >= 1; l--) {
        const tailLines = linesRes.slice(-l).map((s) => s.trim()).filter(Boolean).join('\n');
        const headLines = linesNext.slice(0, l).map((s) => s.trim()).filter(Boolean).join('\n');
        if (tailLines && tailLines === headLines) {
          lineMatch = l;
          break;
        }
      }

      if (lineMatch > 0) {
        result = linesRes.concat(linesNext.slice(lineMatch)).join('\n');
      } else {
        result = result + '\n\n' + nextChunk;
      }
    }
  }

  return deduplicateDocumentContent(result);
}

/**
 * Strips out duplicate consecutive lines, duplicate headings, or duplicate paragraphs
 * that may have been accidentally saved in prior versions.
 */
export function deduplicateDocumentContent(text: string): string {
  if (!text) return '';
  const normalized = text.replace(/\r\n/g, '\n').trim();
  const lines = normalized.split('\n');
  const cleanLines: string[] = [];
  let lastNonEmpty = '';

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed !== '') {
      // Avoid consecutive duplicate non-empty line (even if blank lines in between)
      if (trimmed === lastNonEmpty) {
        continue;
      }
      lastNonEmpty = trimmed;
    }
    cleanLines.push(raw);
  }

  // Also clean duplicate consecutive paragraphs
  const cleanText = cleanLines.join('\n');
  const paragraphs = cleanText.split(/\n\s*\n/);
  const cleanParas: string[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i].trim();
    if (!p) continue;
    if (cleanParas.length > 0 && cleanParas[cleanParas.length - 1] === p) {
      continue;
    }
    cleanParas.push(p);
  }

  return cleanParas.join('\n\n');
}

