// packages/rag/src/rag.test.ts
import { describe, it, expect } from 'vitest';
import { chunkText, filterMatches, isGroundingSufficient } from './index.js';
import type { VectorMatch } from './types.js';

describe('packages/rag', () => {
  describe('chunkText', () => {
    it('should return empty array for empty or whitespace text', () => {
      expect(chunkText('')).toEqual([]);
      expect(chunkText('   \n\n  ')).toEqual([]);
    });

    it('should split document into manageable chunks with ordinal numbers', () => {
      const paragraph1 = 'Đây là đoạn văn thứ nhất về chính sách đổi trả sản phẩm trong vòng 7 ngày.';
      const paragraph2 = 'Đây là đoạn văn thứ hai về phí vận chuyển toàn quốc đồng giá 30.000đ.';
      const rawText = `${paragraph1}\n\n${paragraph2}`;

      const chunks = chunkText(rawText, { maxChars: 100, overlapChars: 20 });
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0].ord).toBe(1);
      expect(chunks[0].content).toContain('chính sách đổi trả');
    });

    it('should properly estimate tokens', () => {
      const text = 'Một câu văn bản mẫu để kiểm tra tính toán số lượng tokens.';
      const chunks = chunkText(text);
      expect(chunks[0].estimatedTokens).toBeGreaterThan(0);
    });
  });

  describe('retriever helpers', () => {
    const mockMatches: VectorMatch[] = [
      {
        id: 'chunk_1',
        score: 0.85,
        metadata: {
          tenant_id: 't1',
          bot_id: 'b1',
          doc_id: 'd1',
          chunk_id: 'c1',
          title: 'HDSD.pdf',
          content: 'Nội dung hướng dẫn sử dụng',
        },
      },
      {
        id: 'chunk_2',
        score: 0.62,
        metadata: {
          tenant_id: 't1',
          bot_id: 'b1',
          doc_id: 'd1',
          chunk_id: 'c2',
          title: 'HDSD.pdf',
          content: 'Nội dung đoạn hai',
        },
      },
      {
        id: 'chunk_3',
        score: 0.35, // Below default 0.55 threshold
        metadata: {
          tenant_id: 't1',
          bot_id: 'b1',
          doc_id: 'd1',
          chunk_id: 'c3',
          title: 'Rac.pdf',
          content: 'Nội dung không liên quan',
        },
      },
    ];

    it('filterMatches should filter out matches below similarity threshold', () => {
      const filtered = filterMatches(mockMatches, { threshold: 0.55 });
      expect(filtered.length).toBe(2);
      expect(filtered[0].score).toBe(0.85);
      expect(filtered[1].score).toBe(0.62);
    });

    it('isGroundingSufficient should return true if max score >= threshold', () => {
      expect(isGroundingSufficient(mockMatches, 0.55)).toBe(true);
      expect(isGroundingSufficient([{ id: 'c', score: 0.4 }], 0.55)).toBe(false);
      expect(isGroundingSufficient([])).toBe(false);
    });
  });
});

