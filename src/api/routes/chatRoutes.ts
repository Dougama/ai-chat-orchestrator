// packages/orchestrator-api/src/api/routes/chatRoutes.ts

import { Router } from "express";
import { 
  deleteChat, 
  postChatMessage, 
  getChatMessages, 
  getUserChats,
  getMultiTenantHealth 
} from "../controllers/chatController";
import { authMiddleware, publicRoute } from "../middleware/authMiddleware";

const router = Router();

// Chat endpoints con userId en path para ownership validation - REQUIEREN AUTENTICACIÓN
router.post("/users/:userId", authMiddleware, postChatMessage); // Crear nuevo chat
router.post("/users/:userId/chats/:chatId", authMiddleware, postChatMessage); // Continuar chat existente
router.delete("/users/:userId/chats/:chatId", authMiddleware, deleteChat); // Eliminar chat
router.get("/users/:userId", authMiddleware, getUserChats); // Listar chats del usuario
router.get("/users/:userId/chats/:chatId/messages", authMiddleware, getChatMessages); // Mensajes del chat

// Multi-tenant health check - PÚBLICO
router.get("/health/multitenant", publicRoute, getMultiTenantHealth);

export default router;
