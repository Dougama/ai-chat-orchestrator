// MCP (Model Context Protocol) interfaces for multi-tenant integration

export interface MCPConnection {
  centerId: string;
  isConnected: boolean;
  lastPing?: Date;
  serverUrl?: string;
  serverStatus?: 'connected' | 'disconnected' | 'error';
}

export interface MCPTool {
  name: string;
  description: string;
  parameters: any; // JSON Schema
}

export interface MCPToolCall {
  toolName: string;
  parameters: any;
  callId: string;
}

export interface MCPToolResult {
  toolName: string;
  callId: string;
  success: boolean;
  data?: any;
  mcpData?: any;
  dataType?: string;
  error?: string;
}

export interface MCPResult {
  success: boolean;
  data?: any;
  error?: string;
}

// Implementation interfaces
export interface IMCPAdapter {
  convertMCPToolsToGenAI(tools: MCPTool[]): any[];
  convertGenAIResultsToMCP(results: any[]): MCPToolCall[];
  convertMCPResultsToGenAI(results: MCPToolResult[]): any[];
  setupAutomaticFunctionCalling(tools: MCPTool[]): any;
  validateMCPTool(tool: MCPTool): boolean;
  filterValidMCPTools(tools: MCPTool[]): MCPTool[];
}

export interface IMCPConnectionManager {
  connectToCenter(centerId: string): Promise<MCPConnection>;
  getAvailableTools(centerId: string): Promise<MCPTool[]>;
  executeToolCall(centerId: string, toolCall: MCPToolCall): Promise<MCPToolResult>;
  checkMCPHealth(centerId: string): Promise<boolean>;
  disconnect(centerId: string): Promise<void>;
}

export interface IMCPToolCache {
  cacheTools(centerId: string, tools: MCPTool[]): void;
  getCachedTools(centerId: string): MCPTool[] | null;
  clearCache(centerId: string): void;
  clearAllCache(): void;
}