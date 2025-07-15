import { Firestore, FieldValue } from "@google-cloud/firestore";
import { SearchResult, VectorDocument } from "../../types";
import { GoogleGenAIProvider } from "../llm/GoogleGenAIProvider";

const FIRESTORE_COLLECTION = "pdf_documents_vector";
const embeddingProvider = new GoogleGenAIProvider();

// Firestore dinámico - se pasa desde el contexto del centro

/**
 * Genera embedding para una consulta
 * @param queryText Texto de la consulta
 * @returns Embedding de la consulta
 */
async function generateQueryEmbedding(queryText: string): Promise<number[]> {
  try {
    const response = await embeddingProvider.getEmbedding({ text: queryText });
    return response.values;
  } catch (error: any) {
    throw new Error(`Error generando embedding de consulta: ${error.message}`);
  }
}

/**
 * Realiza búsqueda semántica usando Firestore Vector Search
 * @param firestore Instancia de Firestore del centro
 * @param queryText Texto de búsqueda
 * @param topK Número de resultados
 * @param collectionName Nombre de la colección
 * @param documentFilter Filtro por documento
 * @returns Resultados de la búsqueda
 */
export async function searchSimilarEmbeddingsVector(
  firestore: Firestore,
  queryText: string,
  topK: number = 3,
  collectionName: string = FIRESTORE_COLLECTION,
  documentFilter?: string
): Promise<SearchResult[]> {
  try {
    console.log("🔍 Generando embedding de consulta...");
    const queryEmbedding = await generateQueryEmbedding(queryText);

    console.log("📥 Realizando búsqueda vectorial en Firestore...");
    let collection = firestore.collection(collectionName);

    // Aplicar filtro si se especifica
    if (documentFilter) {
      collection = collection.where(
        "metadata.documentId",
        "==",
        documentFilter
      ) as any;
    }

    // Realizar búsqueda vectorial
    const vectorQuery = collection.findNearest({
      vectorField: "embedding",
      queryVector: FieldValue.vector(queryEmbedding),
      limit: topK,
      distanceMeasure: "COSINE",
    });

    const querySnapshot = await vectorQuery.get();
    const results: SearchResult[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data() as VectorDocument;
      results.push({
        id: doc.id,
        text: data.text,
        score: doc.data()._distance || 0, // Firestore proporciona la distancia
        metadata: data.metadata,
        chunkIndex: data.chunkIndex,
      });
    });

    console.log(`✅ Encontrados ${results.length} resultados similares`);
    return results;
  } catch (error: any) {
    console.error("❌ Error en búsqueda vectorial:", error);
    throw new Error(`Error en búsqueda vectorial: ${error.message}`);
  }
}