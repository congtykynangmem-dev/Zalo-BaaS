// packages/llm/src/gemini.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GeminiClient,
  GeminiApiError,
  buildSystemInstruction,
  formatContextBlock,
} from './index.js';

describe('packages/llm', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Prompt helpers', () => {
    it('buildSystemInstruction should build instruction with strict grounding', () => {
      const instruction = buildSystemInstruction({
        botName: 'Shop Thời Trang',
        tenantSystemPrompt: 'Luôn gọi khách hàng là "quý khách".',
        strictGrounding: true,
      });

      expect(instruction).toContain('Shop Thời Trang');
      expect(instruction).toContain('Strict Grounding');
      expect(instruction).toContain('Luôn gọi khách hàng là "quý khách".');
    });

    it('formatContextBlock should format chunks safely inside <context>', () => {
      const chunks = [
        { title: 'Chính sách bảo hành.pdf', content: 'Bảo hành 12 tháng đổi mới.' },
        { title: 'Bảng giá.xlsx', content: 'Gói cơ bản: 199.000đ/tháng.' },
      ];

      const block = formatContextBlock(chunks);
      expect(block).toContain('<context>');
      expect(block).toContain('</context>');
      expect(block).toContain('[Nguồn 1: Chính sách bảo hành.pdf]');
      expect(block).toContain('[Nguồn 2: Bảng giá.xlsx]');
    });
  });

  describe('GeminiClient', () => {
    it('should initialize with api key', () => {
      const client = new GeminiClient('test_api_key');
      expect(client).toBeInstanceOf(GeminiClient);
      expect(() => new GeminiClient('')).toThrow('Gemini API key is required');
    });

    it('generateContent should call Gemini API and return text with token usage', async () => {
      const client = new GeminiClient('test_key', 'https://mock.gemini.api');

      const mockApiResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: '**Xin chào!** Tôi có thể giúp gì cho bạn?' }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 150,
          candidatesTokenCount: 30,
        },
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse,
      } as Response);

      const result = await client.generateContent({
        messages: [{ role: 'user', parts: [{ text: 'Chào bot' }] }],
        systemInstruction: 'Bạn là bot hữu ích',
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/models/gemini-2.5-flash:generateContent?key=test_key'),
        expect.objectContaining({ method: 'POST' })
      );
      expect(result.text).toBe('**Xin chào!** Tôi có thể giúp gì cho bạn?');
      expect(result.tokensIn).toBe(150);
      expect(result.tokensOut).toBe(30);
    });

    it('embedContent should call text-embedding-004 and return vector array', async () => {
      const client = new GeminiClient('test_key', 'https://mock.gemini.api');

      const mockEmbeddingValues = [0.12, -0.45, 0.78];
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          embedding: { values: mockEmbeddingValues },
        }),
      } as Response);

      const result = await client.embedContent({ text: 'Câu hỏi của khách hàng' });

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/models/text-embedding-004:embedContent?key=test_key'),
        expect.objectContaining({ method: 'POST' })
      );
      expect(result.values).toEqual(mockEmbeddingValues);
    });

    it('should throw GeminiApiError when API call fails', async () => {
      const client = new GeminiClient('test_key', 'https://mock.gemini.api');

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ error: { message: 'API_KEY_INVALID' } }),
      } as Response);

      await expect(
        client.generateContent({
          messages: [{ role: 'user', parts: [{ text: 'hi' }] }],
        })
      ).rejects.toThrow(GeminiApiError);
    });
  });
});

