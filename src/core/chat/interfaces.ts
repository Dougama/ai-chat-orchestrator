import { ChatMessage } from "../../types";

export interface ChatRequest {
  prompt: string;
  history: ChatMessage[];
  chatId?: string;
  userId?: string;
}

export interface ToolCall {
  toolName: string;
  callParams: any;
  timestamp: any; // Firestore Timestamp
  success: boolean;
}

export interface ChatData {
  title: string;
  createdAt: any; // Firestore Timestamp
  lastUpdatedAt?: any; // Firestore Timestamp
  toolCalls?: ToolCall[];
}

export interface MessageData {
  role: "user" | "assistant";
  content: string;
  timestamp: any; // Firestore Timestamp
  data?: any[]; // Para compatibilidad con MCPToolResult[]
  toolData?: { [toolName: string]: any }; // Para contexto nativo del historial
}

export interface ChatWithMessages extends ChatMessage {
  chatId: string;
}