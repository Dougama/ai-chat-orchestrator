import { GoogleGenAI } from "@google/genai";
import {
  ILLMProvider,
  IEmbeddingProvider,
  GenerationRequest,
  GenerationResponse,
  EmbeddingRequest,
  EmbeddingResponse,
} from "./interfaces";
import { GoogleGenAIManager } from "./GoogleGenAIManager";

const EMBEDDING_MODEL = "text-embedding-004";
const GENERATIVE_MODEL_ID = "gemini-2.0-flash-001";

/**
 * Genera embedding usando GoogleGenAI del centro especificado
 * @param text Texto para generar embedding
 * @param centerId ID del centro (default, cucuta)
 * @returns Vector de embedding
 */
export async function getEmbedding(text: string, centerId: string = 'default') {
  try {
    const ai = GoogleGenAIManager.getInstance(centerId);
    const response = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: [text],
    });
    if (!response || !response.embeddings || response.embeddings.length === 0) {
      throw new Error("No se generó ningún embedding.");
    }
    return response.embeddings[0].values; // Retorna el primer embedding
  } catch (error) {
    console.error(`Error generando embedding para centro ${centerId}:`, error);
    throw new Error("Error al generar embedding del texto");
  }
}

/**
 * Genera contenido usando GoogleGenAI del centro especificado
 * @param prompt Prompt para generar contenido
 * @param centerId ID del centro (default, cucuta)
 * @returns Texto generado
 */
export const aiGenerateContent = async (prompt: string, centerId: string = 'default'): Promise<string> => {
  const ai = GoogleGenAIManager.getInstance(centerId);
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

/**
 * Provider class para GoogleGenAI con soporte multi-tenant
 */
export class GoogleGenAIProvider implements ILLMProvider {
  private centerId: string;

  constructor(centerId: string = 'default') {
    this.centerId = centerId;
  }

  /**
   * Cambia el centro activo para este provider
   * @param centerId Nuevo centro a usar
   */
  setCenterId(centerId: string): void {
    this.centerId = centerId;
  }

  /**
   * Genera contenido usando la instancia GoogleGenAI del centro configurado
   */
  async generateContent(
    request: GenerationRequest
  ): Promise<GenerationResponse> {
    const ai = GoogleGenAIManager.getInstance(this.centerId);
    
    const generateConfig: any = {
      model: GENERATIVE_MODEL_ID,
      contents: request.prompt,
      config: {
        temperature: request.config?.temperature || 0.3,
        maxOutputTokens: request.config?.maxOutputTokens || 1000,
        topK: request.config?.topK || 40,
        topP: request.config?.topP || 0.95,
        // Agregar herramientas si están presentes
        ...(request.tools &&
          request.tools.length > 0 && { tools: request.tools }),
        ...(request.toolConfig && { toolConfig: request.toolConfig }),
      },
    };

    const response = await ai.models.generateContent(generateConfig);

    console.log(`DEBUG GoogleGenAIProvider (${this.centerId}): Response raw:`, {
      hasText: !!response?.text,
      hasFunctionCalls: !!response?.functionCalls,
      functionCallsLength: response?.functionCalls?.length || 0,
      functionCallsRaw: response?.functionCalls,
    });

    if (!response || (!response.text && !response.functionCalls)) {
      throw new Error("No se generó contenido.");
    }

    return {
      text: response.text || "",
      functionCalls: response.functionCalls || [],
    };
  }

  /**
   * Genera embedding usando la instancia GoogleGenAI del centro configurado
   */
  async getEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const values = await getEmbedding(request.text, this.centerId);
    return { values: values || [] };
  }
}
