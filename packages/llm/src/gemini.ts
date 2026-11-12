// packages/llm/src/gemini.ts
import type {
  GenerateOptions,
  GenerateResult,
  EmbedOptions,
  EmbedResult,
} from './types.js';

const GOOGLE_AI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export class GeminiApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'GeminiApiError';
  }
}

export class GeminiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl: string = GOOGLE_AI_BASE_URL) {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('Gemini API key is required');
    }
    this.apiKey = apiKey.trim();
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  /**
   * Generates text response using Gemini with automatic fallback to stable models.
   */
  async generateContent(options: GenerateOptions): Promise<GenerateResult> {
    const candidateModels = options.model
      ? [options.model]
      : ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-pro'];

    let lastError: Error | null = null;

    for (let i = 0; i < candidateModels.length; i++) {
      const model = candidateModels[i];
      const url = `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;

      const bodyPayload: Record<string, unknown> = {
        contents: options.messages,
        generationConfig: {
          temperature: options.temperature ?? 0.3,
          maxOutputTokens: options.maxOutputTokens ?? 1000,
        },
      };

      if (options.systemInstruction) {
        bodyPayload.system_instruction = {
          parts: [{ text: options.systemInstruction }],
        };
      }

      try {
        const signal =
          typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
            ? AbortSignal.timeout(12000)
            : undefined;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(bodyPayload),
          ...(signal ? { signal } : {}),
        });

        if (!response.ok) {
          let errorMsg = `Gemini API HTTP Error ${response.status}: ${response.statusText}`;
          try {
            const errorJson = (await response.json()) as { error?: { message?: string } };
            if (errorJson.error?.message) {
              errorMsg = errorJson.error.message;
            }
          } catch {
            // ignore parse error
          }
          console.warn(`[GeminiClient] Model ${model} returned error (${response.status}): ${errorMsg}`);
          throw new GeminiApiError(errorMsg, response.status);
        }

        const data = (await response.json()) as {
          candidates?: Array<{
            content?: {
              parts?: Array<{ text?: string }>;
            };
          }>;
          usageMetadata?: {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
          };
        };

        const firstCandidate = data.candidates?.[0];
        const text =
          firstCandidate?.content?.parts
            ?.map((p) => p.text ?? '')
            .join('')
            .trim() ?? '';

        return {
          text,
          tokensIn: data.usageMetadata?.promptTokenCount ?? 0,
          tokensOut: data.usageMetadata?.candidatesTokenCount ?? 0,
          model,
        };
      } catch (err: any) {
        lastError = err;
        // Do not retry different models if API Key is definitively invalid
        if (err.status === 401 || err.status === 403 || err.message?.includes('API_KEY_INVALID')) {
          throw err;
        }
        if (i < candidateModels.length - 1) {
          console.info(`[GeminiClient] Retrying with fallback model: ${candidateModels[i + 1]}`);
          continue;
        }
      }
    }

    throw lastError || new GeminiApiError('Failed to generate content with any Gemini model');
  }

  /**
   * Generates vector embeddings for a given text using text-embedding-004.
   */
  async embedContent(options: EmbedOptions): Promise<EmbedResult> {
    const model = options.model ?? 'text-embedding-004';
    const url = `${this.baseUrl}/models/${model}:embedContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: `models/${model}`,
        content: {
          parts: [{ text: options.text }],
        },
      }),
    });

    if (!response.ok) {
      let errorMsg = `Gemini Embed API HTTP Error ${response.status}`;
      try {
        const errJson = (await response.json()) as { error?: { message?: string } };
        if (errJson.error?.message) {
          errorMsg = errJson.error.message;
        }
      } catch {
        // ignore
      }
      throw new GeminiApiError(errorMsg, response.status);
    }

    const data = (await response.json()) as {
      embedding?: {
        values?: number[];
      };
    };

    if (!data.embedding?.values) {
      throw new GeminiApiError('No embedding values returned from Gemini API');
    }

    return {
      values: data.embedding.values,
    };
  }
}

