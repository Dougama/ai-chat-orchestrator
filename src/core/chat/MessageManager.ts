import { Firestore, Timestamp } from "@google-cloud/firestore";
import { ChatMessage } from "../../types";
import { MessageData } from "./interfaces";

// Firestore dinámico - se pasa desde el contexto del centro

export class MessageManager {
  /**
   * Obtiene los mensajes de un chat
   */
  static async getMessagesForChat(firestore: Firestore, chatId: string) {
    console.log(`Obteniendo mensajes para el chat: ${chatId}`);
    const messagesCollection = firestore
      .collection("chats")
      .doc(chatId)
      .collection("messages");
    const snapshot = await messagesCollection.orderBy("timestamp", "asc").get();

    if (snapshot.empty) {
      return [];
    }

    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  /**
   * Obtiene el historial reciente para contexto
   */
  static async getRecentHistory(firestore: Firestore, chatId: string, limit: number = 10): Promise<ChatMessage[]> {
    const messagesCollection = firestore
      .collection("chats")
      .doc(chatId)
      .collection("messages");
    
    const historySnapshot = await messagesCollection
      .orderBy("timestamp", "desc")
      .limit(limit)
      .get();
    
    return historySnapshot.docs
      .map((doc) => doc.data() as ChatMessage)
      .reverse();
  }

  /**
   * Guarda un mensaje del usuario
   */
  static async saveUserMessage(firestore: Firestore, chatId: string, content: string): Promise<void> {
    const messagesCollection = firestore
      .collection("chats")
      .doc(chatId)
      .collection("messages");

    const userMessageData: MessageData = {
      role: "user",
      content: content,
      timestamp: Timestamp.now(),
    };

    await messagesCollection.add(userMessageData);
  }

  /**
   * Guarda un mensaje del asistente
   */
  static async saveAssistantMessage(firestore: Firestore, chatId: string, content: string): Promise<string> {
    const messagesCollection = firestore
      .collection("chats")
      .doc(chatId)
      .collection("messages");

    const assistantMessageData: MessageData = {
      role: "assistant",
      content: content,
      timestamp: Timestamp.now(),
    };

    const assistantDocRef = await messagesCollection.add(assistantMessageData);
    return assistantDocRef.id;
  }
}