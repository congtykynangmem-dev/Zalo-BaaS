// packages/llm/src/types.ts

export interface GeminiContentPart {
  text: string;
}

export interface GeminiMessage {
  role: 'user' | 'model';
  parts: GeminiContentPart[];
}

export interface GenerateOptions {
  model?: string;
  systemInstruction?: string;
  messages: GeminiMessage[];
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GenerateResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
}

export interface EmbedOptions {
  model?: string;
  text: string;
}

export interface EmbedResult {
  values: number[];
}

