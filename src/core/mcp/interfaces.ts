// Placeholder interfaces for future MCP integration

export interface MCPConnection {
  centerId: string;
  isConnected: boolean;
  lastPing?: Date;
}

export interface MCPTool {
  name: string;
  description: string;
  parameters: any; // JSON Schema
}

export interface MCPResult {
  success: boolean;
  data?: any;
  error?: string;
}

// Future implementation interfaces
export interface IMCPAdapter {
  translateToolsToGenAI(tools: MCPTool[]): any[];
  translateResultsFromGenAI(results: any): MCPResult;
}

export interface IMCPConnectionManager {
  connectToCenter(centerId: string): Promise<MCPConnection>;
  getAvailableTools(centerId: string): Promise<MCPTool[]>;
  disconnect(centerId: string): Promise<void>;
}

export interface IMCPToolCache {
  cacheTools(centerId: string, tools: MCPTool[]): void;
  getCachedTools(centerId: string): MCPTool[] | null;
  clearCache(centerId: string): void;
}