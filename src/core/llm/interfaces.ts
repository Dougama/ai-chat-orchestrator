export interface GenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
  topK?: number;
  topP?: number;
  systemInstruction?: string;
}

export interface EmbeddingRequest {
  text: string;
  model?: string;
  trackTokens?: boolean;
  chatId?: string;
}

export interface EmbeddingResponse {
  values: number[];
}

export interface GenerationRequest {
  prompt?: string;
  contents?: any[]; // Modo nativo con historial estructurado
  systemInstruction?: string;
  config?: GenerationConfig;
  tools?: any[];
  toolConfig?: any;
  trackTokens?: boolean;
  chatId?: string;
}

export interface GenerationResponse {
  text: string;
  functionCalls?: any[];
}

export interface ILLMProvider {
  generateContent(request: GenerationRequest): Promise<GenerationResponse>;
  getEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse>;
}

export interface IEmbeddingProvider {
  getEmbedding(text: string): Promise<number[]>;
}