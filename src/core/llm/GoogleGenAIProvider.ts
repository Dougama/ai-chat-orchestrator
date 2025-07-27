import { GoogleGenAI } from "@google/genai";
import { ILLMProvider, IEmbeddingProvider, GenerationRequest, GenerationResponse, EmbeddingRequest, EmbeddingResponse } from "./interfaces";
import { TokenTrackingService } from "../tracking/TokenTrackingService";
import { Firestore } from "@google-cloud/firestore";

const EMBEDDING_MODEL = "text-embedding-004";
const GENERATIVE_MODEL_ID = "gemini-2.0-flash-001";

// Configuración multi-tenant
interface ProviderConfig {
  centerId: string;
  projectId: string;
  location: string;
  firestore?: Firestore;
}

// Instancia legacy para compatibilidad (será deprecada)
const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION = process.env.GCP_LOCATION || "us-central1";

let legacyAi: GoogleGenAI | null = null;

if (PROJECT_ID) {
  legacyAi = new GoogleGenAI({
    vertexai: true,
    project: PROJECT_ID,
    location: LOCATION,
  });
}

export async function getEmbedding(text: string) {
  if (!legacyAi) {
    throw new Error("GoogleGenAI no está configurado. Use GoogleGenAIManager.getProvider(centerId) en su lugar.");
  }
  try {
    const response = await legacyAi.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: [text],
    });
    if (!response || !response.embeddings || response.embeddings.length === 0) {
      throw new Error("No se generó ningún embedding.");
    }
    return response.embeddings[0].values;
  } catch (error) {
    console.error("Error generando embedding:", error);
    throw new Error("Error al generar embedding del texto");
  }
}

export const aiGenerateContent = async (prompt: string): Promise<string> => {
  if (!legacyAi) {
    throw new Error("GoogleGenAI no está configurado. Use GoogleGenAIManager.getProvider(centerId) en su lugar.");
  }
  const response = await legacyAi.models.generateContent({
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

export class GoogleGenAIProvider implements ILLMProvider {
  private ai: GoogleGenAI;
  private config: ProviderConfig;

  constructor(ai?: GoogleGenAI, config?: ProviderConfig) {
    if (ai && config) {
      // Multi-tenant mode
      this.ai = ai;
      this.config = config;
    } else if (legacyAi) {
      // Legacy mode
      this.ai = legacyAi;
      this.config = {
        centerId: 'default',
        projectId: PROJECT_ID!,
        location: LOCATION
      };
    } else {
      throw new Error("GoogleGenAIProvider requiere una instancia de GoogleGenAI");
    }
  }
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

    const response = await this.ai.models.generateContent(generateConfig);
    
    console.log('DEBUG GoogleGenAIProvider: Response raw:', {
      hasText: !!response?.text,
      text: response?.text,
      hasFunctionCalls: !!response?.functionCalls,
      functionCallsLength: response?.functionCalls?.length || 0,
      functionCallsRaw: response?.functionCalls,
      usageMetadata: response?.usageMetadata
    });
    
    // Track token usage if enabled
    if (request.trackTokens && request.chatId && response.usageMetadata && this.config.firestore) {
      await TokenTrackingService.trackUsage(this.config.firestore, request.chatId, {
        promptTokens: response.usageMetadata.promptTokenCount || 0,
        candidatesTokens: response.usageMetadata.candidatesTokenCount || 0,
        totalTokens: response.usageMetadata.totalTokenCount || 0,
        operation: 'generateContent',
        model: GENERATIVE_MODEL_ID,
        trafficType: response.usageMetadata.trafficType
      });
    }
    
    if (!response || (!response.text && !response.functionCalls)) {
      throw new Error("No se generó contenido.");
    }
    
    return {
      text: response.text || "",
      functionCalls: response.functionCalls || []
    };
  }

  async getEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    try {
      // Count tokens for embedding if tracking is enabled
      let tokenCount = 0;
      if (request.trackTokens && request.chatId && this.config.firestore) {
        // Use a simple estimation for embedding tokens since countTokens API 
        // has different format requirements for embedding models
        // Rough approximation: 1 token ≈ 4 characters for text
        tokenCount = Math.ceil(request.text.length / 4);
        console.log(`TokenTrackingService: Estimated ${tokenCount} tokens for embedding (${request.text.length} chars)`);
      }
      
      const response = await this.ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: [request.text],
      });
      
      // Track token usage if enabled
      if (request.trackTokens && request.chatId && tokenCount > 0 && this.config.firestore) {
        await TokenTrackingService.trackUsage(this.config.firestore, request.chatId, {
          promptTokens: tokenCount,
          candidatesTokens: 0,
          totalTokens: tokenCount,
          operation: 'embedding',
          model: EMBEDDING_MODEL
        });
      }
      
      if (!response || !response.embeddings || response.embeddings.length === 0) {
        throw new Error("No se generó ningún embedding.");
      }
      
      return { values: response.embeddings[0].values || [] };
    } catch (error) {
      console.error(`Error generando embedding para centro ${this.config.centerId}:`, error);
      throw new Error("Error al generar embedding del texto");
    }
  }
}