// packages/orchestrator-api/src/api/controllers/chatController.ts

import { Request, Response } from "express";
import {
  deleteUserChat,
  getMessagesForChat,
  handleChatPrompt,
  listUserChats,
} from "../../services/chatService";
import { MultiTenantManager } from "../../core/multitenant/MultiTenantManager";
import { UserContext } from "../../core/multitenant/interfaces";

// Singleton MultiTenantManager - se inicializa una vez
const multiTenantManager = new MultiTenantManager();

// Inicializar conexiones a todos los centros al startup
let isInitialized = false;
const initializeMultiTenant = async () => {
  if (!isInitialized) {
    console.log("🚀 Inicializando sistema multi-tenant...");
    await multiTenantManager.initializeCenters();
    isInitialized = true;
    console.log("✅ Sistema multi-tenant inicializado");
  }
};

/**
 * Extrae el contexto del usuario desde el request
 */
const extractUserContext = (req: Request): UserContext => {
  // Prioridad: 1) URL params, 2) body, 3) query params
  return {
    userId: req.params.userId || req.body.userId || req.query.userId || 'anonymous',
    centerId: req.headers['x-center-id'] as string || req.query.center as string,
    // Futuro: extraer de JWT, geolocalización, etc.
  };
};

/**
 * Valida que el usuario del path coincida con el contexto del request
 */
const validateUserOwnership = (pathUserId: string, contextUserId: string): boolean => {
  if (pathUserId !== contextUserId && contextUserId !== 'anonymous') {
    return false;
  }
  return true;
};

export const postChatMessage = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // Inicializar multi-tenant si no está listo
    await initializeMultiTenant();

    const { prompt, history = [] } = req.body;
    if (!prompt) {
      res.status(400).json({ error: 'El campo "prompt" es requerido.' });
      return;
    }

    // Extraer contexto del usuario
    const userContext = extractUserContext(req);
    const pathUserId = req.params.userId;
    
    // TODO: Validación de ownership comentada temporalmente
    // if (!validateUserOwnership(pathUserId, userContext.userId)) {
    //   res.status(403).json({ error: 'No tienes permisos para acceder a este recurso.' });
    //   return;
    // }
    
    console.log(`🔍 DEBUG chatController - pathUserId: ${pathUserId}, contextUserId: ${userContext.userId}`);
    
    // Enriquecer request con centerContext
    const enrichedRequest = await multiTenantManager.handleRequest(req, userContext);
    
    const chatId = req.params.chatId;
    const assistantResponse = await handleChatPrompt({
      prompt,
      chatId,
      history,
      userId: pathUserId, // ✅ Usar userId del path (validado)
      centerContext: enrichedRequest.centerContext, // ✅ Agregar centerContext
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
    // Inicializar multi-tenant si no está listo
    await initializeMultiTenant();

    const pathUserId = req.params.userId;
    // Leemos el cursor 'lastSeen' de los query params de la URL
    const { lastSeen } = req.query;

    // Extraer contexto del usuario
    const userContext = extractUserContext(req);
    
    // TODO: Validación de ownership comentada temporalmente
    // if (!validateUserOwnership(pathUserId, userContext.userId)) {
    //   res.status(403).json({ error: 'No tienes permisos para acceder a este recurso.' });
    //   return;
    // }
    
    // Enriquecer request con centerContext
    const enrichedRequest = await multiTenantManager.handleRequest(req, userContext);

    const chats = await listUserChats(pathUserId, lastSeen as string | undefined, enrichedRequest.centerContext);
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
    // Inicializar multi-tenant si no está listo
    await initializeMultiTenant();

    const { chatId, userId: pathUserId } = req.params;
    
    // Extraer contexto del usuario
    const userContext = extractUserContext(req);
    
    // TODO: Validación de ownership comentada temporalmente
    // if (!validateUserOwnership(pathUserId, userContext.userId)) {
    //   res.status(403).json({ error: 'No tienes permisos para acceder a este recurso.' });
    //   return;
    // }
    
    // Enriquecer request con centerContext
    const enrichedRequest = await multiTenantManager.handleRequest(req, userContext);

    const messages = await getMessagesForChat(chatId, enrichedRequest.centerContext);
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
    // Inicializar multi-tenant si no está listo
    await initializeMultiTenant();

    const { chatId, userId: pathUserId } = req.params;
    
    // Extraer contexto del usuario
    const userContext = extractUserContext(req);
    
    // TODO: Validación de ownership comentada temporalmente
    // if (!validateUserOwnership(pathUserId, userContext.userId)) {
    //   res.status(403).json({ error: 'No tienes permisos para acceder a este recurso.' });
    //   return;
    // }
    
    // Enriquecer request con centerContext
    const enrichedRequest = await multiTenantManager.handleRequest(req, userContext);

    await deleteUserChat(chatId, pathUserId, enrichedRequest.centerContext);
    res.status(204).send();
  } catch (error) {
    console.error("Error al eliminar el chat:", error);
    res.status(500).json({ error: "Error interno del servidor." });
  }
};

/**
 * Health check endpoint para sistema multi-tenant
 */
export const getMultiTenantHealth = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // Inicializar multi-tenant si no está listo
    await initializeMultiTenant();

    // Verificar estado de todos los centros
    const centerHealth = await multiTenantManager.healthCheck();
    
    // Verificar GoogleGenAI singletons
    const { GoogleGenAIManager } = await import("../../core/llm/GoogleGenAIManager");
    const genAIHealth = await GoogleGenAIManager.healthCheck();

    const overallHealth = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      centers: centerHealth,
      googleGenAI: genAIHealth,
      availableCenters: multiTenantManager.getAvailableCenters(),
    };

    // Determinar status general
    const hasUnhealthyCenter = Object.values(centerHealth).some(healthy => !healthy);
    const hasUnhealthyGenAI = Object.values(genAIHealth).some(healthy => !healthy);
    
    if (hasUnhealthyCenter || hasUnhealthyGenAI) {
      overallHealth.status = "degraded";
    }

    res.status(200).json(overallHealth);
  } catch (error) {
    console.error("Error en health check multi-tenant:", error);
    res.status(503).json({ 
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: "Multi-tenant system not available" 
    });
  }
};
