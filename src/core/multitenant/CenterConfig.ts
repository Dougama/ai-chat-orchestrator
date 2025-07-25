import { CenterConfig } from "./interfaces";

export const CENTERS_CONFIG: Record<string, CenterConfig> = {
  default: {
    id: "default",
    name: "Centro Default (Backend)",
    region: "co-central",
    gcpProject: {
      projectId: "backend-developer-446300",
      location: "us-central1",
      // Sin serviceAccountPath - usa credenciales por defecto del orchestrator
    },
    firestore: {
      chatsCollection: "chats",
      vectorCollection: "pdf_documents_vector",
    },
    mcp: {
      serverUrl: process.env.MCP_DEFAULT_URL || "https://mcp-default.run.app",
      isEnabled: false, // MCP deshabilitado en default
      fallbackEnabled: true,
    },
    billing: {
      enabled: false, // Sin límites en default
      maxChatsPerDay: 10000,
      maxTokensPerMonth: 1000000,
    },
    status: "active",
  },
  
  cucuta: {
    id: "cucuta",
    name: "Centro Bavaria Cúcuta", 
    region: "co-northeast",
    gcpProject: {
      projectId: "bavaria-412804",
      location: "us-central1",
      // Sin serviceAccountPath - usa credenciales por defecto del orchestrator
    },
    firestore: {
      chatsCollection: "chats",
      vectorCollection: "pdf_documents_vector",
    },
    mcp: {
      serverUrl: process.env.MCP_BAVARIA_URL || "https://cd-cucuta-service-280914661682.us-central1.run.app/api/mcp",
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
};

export const DEFAULT_CENTER = "default";

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