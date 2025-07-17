import { GoogleGenAI } from "@google/genai";
import { ILLMProvider, IEmbeddingProvider, GenerationRequest, GenerationResponse, EmbeddingRequest, EmbeddingResponse } from "./interfaces";

const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION = process.env.GCP_LOCATION || "us-central1";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_MODEL = "text-embedding-004";
const GENERATIVE_MODEL_ID = "gemini-2.0-flash-001";

if (!PROJECT_ID) {
  throw new Error(
    "Faltan variables de entorno críticas. Revisa tu archivo .env (se necesita GCP_PROJECT_ID)."
  );
}

if (!GEMINI_API_KEY) {
  console.warn("GEMINI_API_KEY no está configurada. Algunas funcionalidades pueden no funcionar correctamente.");
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
    const generateConfig: any = {
      model: GENERATIVE_MODEL_ID,
      contents: request.prompt,
      config: {
        temperature: request.config?.temperature || 0.3,
        maxOutputTokens: request.config?.maxOutputTokens || 1000,
        topK: request.config?.topK || 40,
        topP: request.config?.topP || 0.95,
        // Agregar herramientas si están presentes
        ...(request.tools && request.tools.length > 0 && { tools: request.tools }),
        ...(request.toolConfig && { toolConfig: request.toolConfig })
      },
    };

    const response = await ai.models.generateContent(generateConfig);
    
    console.log('DEBUG GoogleGenAIProvider: Response raw:', {
      hasText: !!response?.text,
      hasFunctionCalls: !!response?.functionCalls,
      functionCallsLength: response?.functionCalls?.length || 0,
      functionCallsRaw: response?.functionCalls
    });
    
    if (!response || (!response.text && !response.functionCalls)) {
      throw new Error("No se generó contenido.");
    }
    
    return {
      text: response.text || "",
      functionCalls: response.functionCalls || []
    };
  }

  async getEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const values = await getEmbedding(request.text);
    return { values: values || [] };
  }
}