/**
 * Herramienta interna para búsqueda RAG en manuales y protocolos
 * Permite al LLM decidir cuándo buscar información específica
 */

import { searchSimilarEmbeddingsVector } from "../../../core/rag/VectorSearcher";
import { Firestore } from "@google-cloud/firestore";

interface RAGSearchParams {
  consulta: string;
}

interface RAGSearchResult {
  success: boolean;
  informacion: string;
  fuentes: Array<{
    documento: string;
    relevancia: string;
    chunk: number;
  }>;
  error?: string;
}

/**
 * Ejecuta búsqueda RAG para encontrar información específica en manuales
 */
export async function executeRAGSearch(
  firestore: Firestore,
  chatId: string,
  centerId: string,
  params: RAGSearchParams
): Promise<RAGSearchResult> {
  try {
    console.log(`🔍 RAGSearch: Buscando "${params.consulta}" para centro ${centerId}`);

    // Ejecutar búsqueda vectorial
    const results = await searchSimilarEmbeddingsVector(
      firestore,
      params.consulta,
      centerId,
      5, // Más resultados para herramienta específica
      undefined, // Sin filtro de colección
      undefined, // Sin filtro de documento
      chatId
    );

    if (results.length === 0) {
      return {
        success: false,
        informacion: "No se encontró información relevante en los manuales para esa consulta.",
        fuentes: [],
        error: "Sin resultados"
      };
    }

    // Construir información organizada
    const informacion = results
      .map((result, index) => {
        const docName = result.metadata.filePath?.split('/').pop() || 
                       result.metadata.documentId || 
                       `Documento ${index + 1}`;
        
        return `**${docName}** (Relevancia: ${(result.score * 100).toFixed(1)}%)\n${result.text}`;
      })
      .join('\n\n---\n\n');

    // Construir información de fuentes
    const fuentes = results.map((result, index) => ({
      documento: result.metadata.filePath?.split('/').pop() || 
                result.metadata.documentId || 
                `Documento ${index + 1}`,
      relevancia: `${(result.score * 100).toFixed(1)}%`,
      chunk: result.chunkIndex + 1
    }));

    console.log(`✅ RAGSearch: Encontrados ${results.length} resultados relevantes`);

    return {
      success: true,
      informacion,
      fuentes
    };

  } catch (error) {
    console.error("❌ RAGSearch: Error en búsqueda:", error);
    
    return {
      success: false,
      informacion: "Error al buscar información en los manuales.",
      fuentes: [],
      error: error instanceof Error ? error.message : "Error desconocido"
    };
  }
}