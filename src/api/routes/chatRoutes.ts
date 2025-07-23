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

// Chat endpoints
router.post("/:chatId?", postChatMessage);
router.delete("/:chatId", deleteChat);
router.get("/user/:userId", getUserChats);
router.get("/:chatId/messages", getChatMessages);

// Multi-tenant health check
router.get("/health/multitenant", getMultiTenantHealth);

export default router;
