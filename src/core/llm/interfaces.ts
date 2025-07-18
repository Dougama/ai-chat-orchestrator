export interface GenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
  topK?: number;
  topP?: number;
}

export interface EmbeddingRequest {
  text: string;
  model?: string;
}

export interface EmbeddingResponse {
  values: number[];
}

export interface GenerationRequest {
  prompt: string;
  config?: GenerationConfig;
  tools?: any[];
  toolConfig?: any;
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