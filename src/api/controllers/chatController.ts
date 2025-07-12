// packages/orchestrator-api/src/api/controllers/chatController.ts

import { Request, Response } from "express";
import {
  deleteUserChat,
  getMessagesForChat,
  handleChatPrompt,
  listUserChats,
} from "../../services/chatService";

export const postChatMessage = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { prompt, history = [] } = req.body;
    if (!prompt) {
      res.status(400).json({ error: 'El campo "prompt" es requerido.' });
      return;
    }
    const chatId = req.params.chatId;
    const assistantResponse = await handleChatPrompt({
      prompt,
      chatId,
      history,
    });
    res.status(200).json(assistantResponse);
  } catch (error) {
    console.error("Error en el controlador de chat:", error);
    res
      .status(500)
      .json({ error: "Ha ocurrido un error interno en el servidor." });
  }
};

// en chatController.ts

export const getUserChats = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { userId } = req.params;
    // Leemos el cursor 'lastSeen' de los query params de la URL
    // ej: /chat/user/user123?lastSeen=1718361...
    const { lastSeen } = req.query;

    const chats = await listUserChats(userId, lastSeen as string | undefined);
    res.status(200).json(chats);
  } catch (error) {
    console.error("Error al obtener los chats del usuario:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
};

// Nuevo controlador para obtener los mensajes de un chat
export const getChatMessages = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { chatId } = req.params;
    const messages = await getMessagesForChat(chatId); // Otra nueva función de servicio
    res.status(200).json(messages);
  } catch (error) {
    console.error("Error al obtener los mensajes del chat:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
};

export const deleteChat = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { chatId } = req.params;
    await deleteUserChat(chatId); // Implementa esta función en tu servicio
    res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar el chat:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
};
