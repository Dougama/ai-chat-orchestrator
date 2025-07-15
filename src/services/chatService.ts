import { ChatMessage } from "../types";
import { ConversationOrchestrator } from "../core/conversation/ConversationOrchestrator";
import { ChatManager } from "../core/chat/ChatManager";
import { MessageManager } from "../core/chat/MessageManager";
import { Firestore } from "@google-cloud/firestore";

// Firestore temporal - será reemplazado por multi-tenant
const firestore = new Firestore({
  projectId: "backend-developer-446300",
});

interface ChatRequest {
  prompt: string;
  history: ChatMessage[];
  chatId?: string;
}

export const handleChatPrompt = async (
  request: ChatRequest
): Promise<ChatMessage & { chatId: string }> => {
  // Por defecto usar 'cucuta' hasta definir caracterización del usuario
  const defaultCenterId = 'cucuta';
  return await ConversationOrchestrator.handleChatPrompt(firestore, request, defaultCenterId);
};

export const listUserChats = async (
  userId: string,
  lastChatTimestamp?: string
) => {
  return await ChatManager.listUserChats(firestore, userId, lastChatTimestamp);
};

export const getMessagesForChat = async (chatId: string) => {
  return await MessageManager.getMessagesForChat(firestore, chatId);
};
export const deleteUserChat = async (chatId: string): Promise<void> => {
  return await ChatManager.deleteUserChat(firestore, chatId);
};
