import { Firestore, FieldValue } from "@google-cloud/firestore";
import { GoogleGenAI } from "@google/genai";
import { RAGResponse, SearchResult, VectorDocument } from "../types";

const EMBEDDING_MODEL = "text-embedding-004";
const GENERATIVE_MODEL = "gemini-2.0-flash-001";
const FIRESTORE_COLLECTION = "pdf_documents_vector";
const PROJECT_ID = process.env.GCP_PROJECT_ID;
const LOCATION = process.env.GCP_LOCATION || "us-central1";

const ai = new GoogleGenAI({
  vertexai: true,
  project: PROJECT_ID,
  location: LOCATION || "us-central1",
});

// Inicializar Firestore
const db = new Firestore({
  projectId: "backend-developer-446300",
});
/**
 * Genera embedding para una consulta
 * @param queryText Texto de la consulta
 * @returns Embedding de la consulta
 */
async function generateQueryEmbedding(queryText: string): Promise<number[]> {
  try {
    const model = ai.models;
    const result = await model.embedContent({
      model: EMBEDDING_MODEL,
      contents: [queryText],
    });

    if (!result || !result.embeddings || result.embeddings.length === 0) {
      throw new Error(
        `No se generaron embeddings para la consulta: ${queryText}`
      );
    }
    if (!result.embeddings[0].values) {
      throw new Error(`Embedding vacío para la consulta: ${queryText}`);
    }
    return result.embeddings[0].values;
  } catch (error: any) {
    throw new Error(`Error generando embedding de consulta: ${error.message}`);
  }
}

/**
 * Realiza búsqueda semántica usando Firestore Vector Search
 * @param queryText Texto de búsqueda
 * @param topK Número de resultados
 * @param collectionName Nombre de la colección
 * @param documentFilter Filtro por documento
 * @returns Resultados de la búsqueda
 */
export async function searchSimilarEmbeddingsVector(
  queryText: string,
  topK: number = 3,
  collectionName: string = FIRESTORE_COLLECTION,
  documentFilter?: string
): Promise<SearchResult[]> {
  try {
    console.log("🔍 Generando embedding de consulta...");
    const queryEmbedding = await generateQueryEmbedding(queryText);

    console.log("📥 Realizando búsqueda vectorial en Firestore...");
    let collection = db.collection(collectionName);

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
