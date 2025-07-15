import { ChatMessage } from "../../types";
import { ChatRequest, ChatWithMessages } from "../chat/interfaces";
import { ChatManager } from "../chat/ChatManager";
import { MessageManager } from "../chat/MessageManager";
import { RAGPipeline } from "../rag/RAGPipeline";
import { GoogleGenAIProvider } from "../llm/GoogleGenAIProvider";
import { Firestore } from "@google-cloud/firestore";

export class ConversationOrchestrator {
  private static llmProvider = new GoogleGenAIProvider();

  /**
   * Maneja el flujo completo de conversación
   * @param firestore Instancia de Firestore del centro
   * @param request Request de conversación
   */
  static async handleChatPrompt(
    firestore: Firestore,
    request: ChatRequest
  ): Promise<ChatWithMessages> {
    console.log(
      `Recibido prompt: "${request.prompt}", para el chat ID: ${
        request.chatId || "Nuevo Chat"
      }`
    );

    let chatId = request.chatId;

    // 1. Si no hay chatId, creamos una nueva conversación
    if (!chatId) {
      chatId = await ChatManager.createChat(firestore, request.prompt);
      console.log(`Nuevo chat creado con ID: ${chatId}`);
    }

    // 2. Guardamos el nuevo mensaje del usuario
    await MessageManager.saveUserMessage(firestore, chatId, request.prompt);

    // 3. Recuperamos el historial reciente para el contexto
    const history = await MessageManager.getRecentHistory(firestore, chatId, 10);

    // 4. Ejecutamos el pipeline de RAG
    const augmentedPrompt = await RAGPipeline.executeRAGPipeline(
      firestore,
      request.prompt,
      history
    );

    // 5. Generamos la respuesta del asistente
    const response = await this.llmProvider.generateContent({ prompt: augmentedPrompt });
    const assistantText = response.text;

    // 6. Guardamos la respuesta del asistente
    const assistantDocId = await MessageManager.saveAssistantMessage(firestore, chatId, assistantText);

    // 7. Actualizamos la fecha del chat
    await ChatManager.updateChatTimestamp(firestore, chatId);

    // 8. Devolvemos la respuesta
    return {
      id: assistantDocId,
      role: "assistant",
      content: assistantText,
      timestamp: new Date(),
      chatId: chatId,
    };
  }
}