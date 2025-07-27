export * from "./vertex";
export * from "./genai";
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

export interface MCPToolResult {
  toolName: string;
  callId: string;
  success: boolean;
  data?: any;
  error?: string;
}

export interface ChatResponseWithData extends ChatMessage {
  chatId?: string;
  data?: MCPToolResult[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: object; // JSON Schema object
}
