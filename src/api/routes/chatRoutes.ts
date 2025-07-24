// packages/orchestrator-api/src/api/routes/chatRoutes.ts

import { Router } from "express";
import { 
  deleteChat, 
  postChatMessage, 
  getChatMessages, 
  getUserChats,
  getMultiTenantHealth 
} from "../controllers/chatController";

const router = Router();

// Chat endpoints con userId en path para ownership validation
router.post("/users/:userId", postChatMessage); // Crear nuevo chat
router.post("/users/:userId/chats/:chatId", postChatMessage); // Continuar chat existente
router.delete("/users/:userId/chats/:chatId", deleteChat); // Eliminar chat
router.get("/users/:userId", getUserChats); // Listar chats del usuario
router.get("/users/:userId/chats/:chatId/messages", getChatMessages); // Mensajes del chat

// Multi-tenant health check
router.get("/health/multitenant", getMultiTenantHealth);

export default router;
