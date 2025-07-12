export * from "./vertex";
export * from "./genai";
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: object; // JSON Schema object
}
