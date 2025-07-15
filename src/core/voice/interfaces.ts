// Placeholder interfaces for future voice integration

export interface AudioChunk {
  data: string; // Base64 encoded audio
  mimeType: string; // audio/mpeg, audio/wav, etc.
  duration?: number; // in milliseconds
}

export interface VoiceConfig {
  language: string; // "es-CO", "en-US", etc.
  sampleRate: number; // 16000, 44100, etc.
  encoding: string; // "LINEAR16", "MP3", etc.
}

export interface TranscriptionResult {
  text: string;
  confidence: number;
  language?: string;
}

export interface SynthesisResult {
  audioData: string; // Base64 encoded
  mimeType: string;
  duration: number;
}

// Future implementation interfaces
export interface IVoiceProcessor {
  transcribeAudio(audio: AudioChunk, config?: VoiceConfig): Promise<TranscriptionResult>;
  synthesizeText(text: string, config?: VoiceConfig): Promise<SynthesisResult>;
}

export interface IAudioPipeline {
  processVoiceInput(audio: AudioChunk): Promise<string>; // Returns transcribed text
  processVoiceOutput(text: string): Promise<AudioChunk>; // Returns synthesized audio
}

export interface IVoiceProvider {
  name: string;
  isAvailable(): boolean;
  transcribe(audio: AudioChunk, config?: VoiceConfig): Promise<TranscriptionResult>;
  synthesize(text: string, config?: VoiceConfig): Promise<SynthesisResult>;
}