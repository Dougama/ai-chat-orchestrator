import { ChatMessage } from "../../types";

export interface ChatRequest {
  prompt: string;
  history: ChatMessage[];
  chatId?: string;
}

export interface ChatData {
  title: string;
  createdAt: any; // Firestore Timestamp
  lastUpdatedAt?: any; // Firestore Timestamp
}

export interface MessageData {
  role: "user" | "assistant";
  content: string;
  timestamp: any; // Firestore Timestamp
}

export interface ChatWithMessages extends ChatMessage {
  chatId: string;
}