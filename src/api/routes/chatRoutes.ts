// packages/orchestrator-api/src/api/routes/chatRoutes.ts

import { Router } from "express";
import { deleteChat, postChatMessage } from "../controllers/chatController";
import { getChatMessages, getUserChats } from "../controllers/chatController";

const router = Router();
router.post("/:chatId?", postChatMessage);
router.delete("/:chatId", deleteChat);
router.get("/user/:userId", getUserChats);
router.get("/:chatId/messages", getChatMessages);
export default router;
