export interface CenterConfig {
  id: string;                    // "bogota", "medellin", "cucuta"
  name: string;                  // "Centro Bogotá", "Centro Medellín"
  region: string;                // "co-central", "co-northwest", "co-northeast"
  
  // GCP Project Configuration
  gcpProject: {
    projectId: string;           // "logistica-bogota"
    location: string;            // "us-central1", "southamerica-east1"
    serviceAccountPath?: string; // Path to service account key
  };
  
  // Firestore Configuration
  firestore: {
    chatsCollection: string;     // "chats"
    vectorCollection: string;    // "pdf_documents_vector"
  };
  
  // MCP Server Configuration
  mcp: {
    serverUrl: string;           // "https://mcp-bogota.run.app"
    isEnabled: boolean;
    fallbackEnabled: boolean;
  };
  
  // Billing and Limits
  billing: {
    enabled: boolean;
    maxChatsPerDay?: number;
    maxTokensPerMonth?: number;
  };
  
  // Status
  status: "active" | "maintenance" | "offline";
}

export interface UserContext {
  userId: string;
  centerId?: string;               // Opcional - se puede determinar automáticamente
  sessionId?: string;
  metadata?: Record<string, any>;
}

export interface CenterRoutingResult {
  center: CenterConfig;
  firestoreConnection: any;      // Firestore instance
  mcpConnection?: any;           // MCP connection
  fallbackAvailable: boolean;
}

export interface ICenterRouter {
  identifyCenter(request: any): Promise<string>;
  getCenter(centerId: string): Promise<CenterConfig>;
  routeToCenter(centerId: string): Promise<CenterRoutingResult>;
  getCenterStatus(centerId: string): Promise<"active" | "maintenance" | "offline">;
}

export interface IMultiTenantManager {
  initializeCenters(): Promise<void>;
  getAvailableCenters(): string[];
  handleRequest(request: any, userContext: UserContext): Promise<any>;
  healthCheck(): Promise<Record<string, boolean>>;
}