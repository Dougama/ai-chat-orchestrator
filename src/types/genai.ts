import { FieldValue } from "@google-cloud/firestore";

export interface ChunkWithOverlap {
  text: string;
  startIndex: number;
  endIndex: number;
  chunkIndex: number;
}

export interface ChunkResult {
  chunks: ChunkWithOverlap[];
  totalChunks: number;
  totalCharacters: number;
}

export interface EmbeddingBatch {
  contents: ChunkWithOverlap[];
  batchIndex: number;
  totalBatches: number;
}

export interface VectorDocument {
  id?: string;
  documentName: string;
  chunkIndex: number;
  text: string;
  embedding: FieldValue; // Vector field para Firestore Vector Search
  metadata: {
    totalChunks: number;
    chunkLength: number;
    startIndex: number;
    endIndex: number;
    createdAt: FirebaseFirestore.Timestamp;
    filePath: string;
    documentId: string;
  };
}

export interface SearchResult {
  id: string;
  text: string;
  score: number;
  metadata: VectorDocument["metadata"];
  chunkIndex: number;
}

export interface RAGResponse {
  answer: string;
  sources: SearchResult[];
  context: string;
  queryEmbedding?: number[];
}
