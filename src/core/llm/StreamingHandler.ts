// Placeholder for future streaming implementation

export interface StreamingConfig {
  enableStreaming: boolean;
  chunkSize?: number;
}

export interface StreamChunk {
  text: string;
  isComplete: boolean;
}

export interface IStreamingHandler {
  streamContent(prompt: string, config?: StreamingConfig): AsyncIterable<StreamChunk>;
}

// Future implementation
export class GoogleGenAIStreamingHandler implements IStreamingHandler {
  async* streamContent(prompt: string, config?: StreamingConfig): AsyncIterable<StreamChunk> {
    // TODO: Implement streaming with Google GenAI SDK
    // Using generateContentStream() method
    throw new Error("Streaming not implemented yet");
  }
}