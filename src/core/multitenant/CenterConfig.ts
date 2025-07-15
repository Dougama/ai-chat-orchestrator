import { CenterConfig } from "./interfaces";

export const CENTERS_CONFIG: Record<string, CenterConfig> = {
  bogota: {
    id: "bogota",
    name: "Centro Bogotá",
    region: "co-central",
    gcpProject: {
      projectId: "logistica-bogota",
      location: "us-central1",
      serviceAccountPath: process.env.GCP_SA_BOGOTA_PATH,
    },
    firestore: {
      chatsCollection: "chats",
      vectorCollection: "pdf_documents_vector",
    },
    mcp: {
      serverUrl: process.env.MCP_BOGOTA_URL || "https://mcp-bogota.run.app",
      isEnabled: true,
      fallbackEnabled: true,
    },
    billing: {
      enabled: true,
      maxChatsPerDay: 1000,
      maxTokensPerMonth: 100000,
    },
    status: "active",
  },
  
  medellin: {
    id: "medellin", 
    name: "Centro Medellín",
    region: "co-northwest",
    gcpProject: {
      projectId: "logistica-medellin",
      location: "us-central1",
      serviceAccountPath: process.env.GCP_SA_MEDELLIN_PATH,
    },
    firestore: {
      chatsCollection: "chats",
      vectorCollection: "pdf_documents_vector",
    },
    mcp: {
      serverUrl: process.env.MCP_MEDELLIN_URL || "https://mcp-medellin.run.app",
      isEnabled: true,
      fallbackEnabled: true,
    },
    billing: {
      enabled: true,
      maxChatsPerDay: 800,
      maxTokensPerMonth: 80000,
    },
    status: "active",
  },
  
  cucuta: {
    id: "cucuta",
    name: "Centro Cúcuta", 
    region: "co-northeast",
    gcpProject: {
      projectId: "logistica-cucuta",
      location: "us-central1",
      serviceAccountPath: process.env.GCP_SA_CUCUTA_PATH,
    },
    firestore: {
      chatsCollection: "chats",
      vectorCollection: "pdf_documents_vector",
    },
    mcp: {
      serverUrl: process.env.MCP_CUCUTA_URL || "https://mcp-cucuta.run.app",
      isEnabled: true,
      fallbackEnabled: true,
    },
    billing: {
      enabled: true,
      maxChatsPerDay: 500,
      maxTokensPerMonth: 50000,
    },
    status: "active",
  },
};

export const DEFAULT_CENTER = "bogota";

export function getCenterConfig(centerId: string): CenterConfig {
  const config = CENTERS_CONFIG[centerId];
  if (!config) {
    throw new Error(`Centro no encontrado: ${centerId}`);
  }
  return config;
}

export function getAllCenters(): CenterConfig[] {
  return Object.values(CENTERS_CONFIG);
}

export function getActiveCenters(): CenterConfig[] {
  return getAllCenters().filter(center => center.status === "active");
}