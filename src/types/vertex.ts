// types.ts

/**
 * Representa un punto de datos para la consulta.
 */
export interface QueryDatapoint {
  datapoint_id: string; // Identificador para este punto de datos de consulta
  feature_vector: number[]; // El vector de embedding para la consulta
  // Podrías añadir aquí 'sparse_embedding' para búsquedas híbridas si es necesario
  // sparse_embedding?: {
  //   values: number;
  //   dimensions: number;
  // };
}

/**
 * Representa una única consulta en la solicitud.
 */
export interface Query {
  datapoint: QueryDatapoint;
  neighbor_count: number; // Número de vecinos más cercanos a retornar
  // Podrías añadir aquí 'restricts' o 'numeric_restricts' para filtrado
}

/**
 * El cuerpo de la solicitud para la API findNeighbors.
 */
export interface FindNeighborsApiRequest {
  deployed_index_id: string;
  queries: Query[];
  return_full_datapoint?: boolean; // Opcional: para obtener detalles completos del vecino
}

/**
 * Representa el punto de datos de un vecino en la respuesta.
 */
export interface NeighborDatapoint {
  datapoint_id: string;
  // Si return_full_datapoint es true, otros campos como feature_vector podrían estar presentes
  feature_vector?: number;
}

/**
 * Representa un vecino encontrado.
 */
export interface Neighbor {
  datapoint: NeighborDatapoint;
  distance: number;
}

/**
 * El resultado para una única consulta dentro de la respuesta.
 */
export interface NearestNeighborsResult {
  id?: string; // Podría corresponder al datapoint_id de la consulta
  neighbors: Neighbor[];
}

/**
 * La estructura de la respuesta de la API findNeighbors.
 */
export interface FindNeighborsApiResponse {
  nearest_neighbors: NearestNeighborsResult[];
}

/**
 * Parámetros para la función findNeighborsWithFetch.
 */
export interface FindNeighborsParams {
  accessToken: string;
  publicEndpointDomainName: string; // Ej: "1957880287.us-central1-181224308459.vdb.vertexai.goog"
  projectId: string;
  location: string;
  indexEndpointId: string; // ID numérico del IndexEndpoint
  requestBody: FindNeighborsApiRequest;
}
