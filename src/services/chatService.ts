import { ChatMessage } from "../types";
import { ConversationOrchestrator } from "../core/conversation/ConversationOrchestrator";
import { ChatManager } from "../core/chat/ChatManager";
import { MessageManager } from "../core/chat/MessageManager";
import { Firestore } from "@google-cloud/firestore";

// Firestore temporal - fallback cuando no hay centerContext
const fallbackFirestore = new Firestore({
  projectId: "backend-developer-446300",
});

interface ChatRequest {
  prompt: string;
  history: ChatMessage[];
  chatId?: string;
  centerContext?: {
    centerId: string;
    firestore: Firestore;
    [key: string]: any;
  };
}

interface CenterContext {
  centerId: string;
  firestore: Firestore;
  [key: string]: any;
}

export const handleChatPrompt = async (
  request: ChatRequest
): Promise<ChatMessage & { chatId: string }> => {
  // Usar centerContext si está disponible, sino fallback
  const firestore = request.centerContext?.firestore || fallbackFirestore;
  const centerId = request.centerContext?.centerId || 'default';
  
  console.log(`💬 HandleChatPrompt: Usando centro ${centerId}`);
  
  return await ConversationOrchestrator.handleChatPrompt(firestore, request, centerId);
};

export const listUserChats = async (
  userId: string,
  lastChatTimestamp?: string,
  centerContext?: CenterContext
) => {
  // Usar centerContext si está disponible, sino fallback
  const firestore = centerContext?.firestore || fallbackFirestore;
  
  console.log(`📋 ListUserChats: Usando centro ${centerContext?.centerId || 'fallback'}`);
  
  return await ChatManager.listUserChats(firestore, userId, lastChatTimestamp);
};

export const getMessagesForChat = async (
  chatId: string,
  centerContext?: CenterContext
) => {
  // Usar centerContext si está disponible, sino fallback
  const firestore = centerContext?.firestore || fallbackFirestore;
  
  console.log(`💾 GetMessagesForChat: Usando centro ${centerContext?.centerId || 'fallback'}`);
  
  return await MessageManager.getMessagesForChat(firestore, chatId);
};

export const deleteUserChat = async (
  chatId: string,
  centerContext?: CenterContext
): Promise<void> => {
  // Usar centerContext si está disponible, sino fallback
  const firestore = centerContext?.firestore || fallbackFirestore;
  
  console.log(`🗑️ DeleteUserChat: Usando centro ${centerContext?.centerId || 'fallback'}`);
  
  return await ChatManager.deleteUserChat(firestore, chatId);
};
