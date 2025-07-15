import { GoogleGenAI } from "@google/genai";
import { ILLMProvider, IEmbeddingProvider, GenerationRequest, GenerationResponse, EmbeddingRequest, EmbeddingResponse } from "./interfaces";

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION = process.env.GCP_LOCATION || "us-central1";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_MODEL = "text-embedding-004";
const GENERATIVE_MODEL_ID = "gemini-2.0-flash-001";

if (!PROJECT_ID || !GEMINI_API_KEY) {
  throw new Error(
    "Faltan variables de entorno críticas. Revisa tu archivo .env (se necesita DEPLOYED_INDEX_ID)."
  );
}

const ai = new GoogleGenAI({
  vertexai: true,
  project: PROJECT_ID,
  location: LOCATION || "us-central1",
});

export async function getEmbedding(text: string) {
  try {
    const response = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: [text],
    });
    if (!response || !response.embeddings || response.embeddings.length === 0) {
      throw new Error("No se generó ningún embedding.");
    }
    return response.embeddings[0].values; // Retorna el primer embedding
  } catch (error) {
    console.error("Error generando embedding:", error);
    throw new Error("Error al generar embedding del texto");
  }
}

export const aiGenerateContent = async (prompt: string): Promise<string> => {
  const response = await ai.models.generateContent({
    model: GENERATIVE_MODEL_ID,
    contents: prompt,
    config: {
      temperature: 0.3,
      maxOutputTokens: 1000,
      topK: 40,
      topP: 0.95,
    },
  });
  if (!response || !response.text) {
    throw new Error("No se generó contenido.");
  }
  return response.text;
};

// Provider class implementation (future use)
export class GoogleGenAIProvider implements ILLMProvider {
  async generateContent(request: GenerationRequest): Promise<GenerationResponse> {
    const text = await aiGenerateContent(request.prompt);
    return { text };
  }

  async getEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const values = await getEmbedding(request.text);
    return { values: values || [] };
  }
}