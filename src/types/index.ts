export * from "./vertex";
export * from "./genai";
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

export interface ChatResponseWithData extends ChatMessage {
  chatId?: string;
  data?: {
    compensationData?: any;
    rendimientosData?: any;
    novedadesData?: any;
    novedadCreatedData?: any;
    [key: string]: any;
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: object; // JSON Schema object
}
