import { searchSimilarEmbeddingsVector } from "./VectorSearcher";
import { buildAugmentedPrompt } from "../conversation/PromptBuilder";
import { ChatMessage } from "../../types";
import { Firestore } from "@google-cloud/firestore";

export class RAGPipeline {
  /**
   * Ejecuta el pipeline completo de RAG: búsqueda vectorial + augmentación de prompt
   * @param firestore Instancia de Firestore del centro
   * @param prompt Prompt del usuario
   * @param history Historial de conversación
   * @returns Prompt augmentado con contexto
   */
  static async executeRAGPipeline(
    firestore: Firestore,
    prompt: string,
    history: ChatMessage[]
  ): Promise<string> {
    // 1. Búsqueda vectorial
    const similarChunks = await searchSimilarEmbeddingsVector(firestore, prompt);
    
    // 2. Augmentación del prompt
    const augmentedPrompt = buildAugmentedPrompt(
      prompt,
      history,
      similarChunks
    );

    return augmentedPrompt;
  }
}