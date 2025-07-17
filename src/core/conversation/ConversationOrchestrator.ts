import { ChatMessage } from "../../types";
import { ChatRequest, ChatWithMessages } from "../chat/interfaces";
import { ChatManager } from "../chat/ChatManager";
import { MessageManager } from "../chat/MessageManager";
import { RAGPipeline } from "../rag/RAGPipeline";
import { GoogleGenAIProvider } from "../llm/GoogleGenAIProvider";
import { MCPConnectionManager } from "../mcp/MCPConnectionManager";
import { MCPAdapter } from "../mcp/MCPAdapter";
import { MCPFallbackHandler } from "../mcp/MCPFallbackHandler";
import { MCPConnection } from "../mcp/interfaces";
import { Firestore } from "@google-cloud/firestore";
import { FunctionCallingConfigMode } from "@google/genai";

export class ConversationOrchestrator {
  private static llmProvider = new GoogleGenAIProvider();
  private static mcpConnectionManager = new MCPConnectionManager();
  private static mcpAdapter = new MCPAdapter();
  private static mcpFallbackHandler = new MCPFallbackHandler();

  /**
   * Maneja el flujo completo de conversación con soporte MCP
   * @param firestore Instancia de Firestore del centro
   * @param request Request de conversación
   * @param centerId ID del centro para conexión MCP
   */
  static async handleChatPrompt(
    firestore: Firestore,
    request: ChatRequest,
    centerId?: string
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

    // 5. Preparamos herramientas MCP si tenemos centerId
    let tools: any[] = [];
    let mcpConnection: MCPConnection | null = null;
    
    if (centerId) {
      try {
        // Intentar conectar a MCP del centro
        mcpConnection = await this.mcpConnectionManager.connectToCenter(centerId);
        
        if (mcpConnection.isConnected) {
          // Obtener herramientas disponibles del centro
          const mcpTools = await this.mcpConnectionManager.getAvailableTools(centerId);
          const validTools = this.mcpAdapter.filterValidMCPTools(mcpTools);
          
          if (validTools.length > 0) {
            // Convertir herramientas MCP a formato Google GenAI
            tools = this.mcpAdapter.convertMCPToolsToGenAI(validTools);
            console.log(`ConversationOrchestrator: ${tools.length} herramientas MCP configuradas para ${centerId}`);
            console.log('DEBUG: Herramientas MCP convertidas:', JSON.stringify(tools, null, 2));
          }
        }
      } catch (error) {
        console.warn(`ConversationOrchestrator: Error conectando MCP para ${centerId}:`, error);
        // Continuar sin herramientas MCP
      }
    }

    // 6. Generamos la respuesta del asistente (con herramientas MCP si están disponibles)
    const generationConfig = {
      prompt: augmentedPrompt,
      ...(tools.length > 0 && {
        tools: [{ functionDeclarations: tools }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: tools.map(t => t.name)
          }
        }
      })
    };

    console.log('DEBUG: Configuración enviada a LLM:', JSON.stringify(generationConfig, null, 2));
    
    const response = await this.llmProvider.generateContent(generationConfig);
    let assistantText = response.text || '';

    console.log('DEBUG: Respuesta LLM:', {
      text: assistantText?.substring(0, 100) + '...',
      hasFunctionCalls: !!(response.functionCalls && response.functionCalls.length > 0),
      functionCallsCount: response.functionCalls?.length || 0
    });

    // 7. Procesar function calls si existen
    let functionCallResults: any[] = [];
    if (response.functionCalls && response.functionCalls.length > 0 && centerId) {
      functionCallResults = await this.processFunctionCalls(
        centerId,
        response.functionCalls,
        mcpConnection
      );
      
      if (functionCallResults.length > 0) {
        // Generar respuesta final con resultados de herramientas
        const finalResponse = await this.generateFinalResponse(
          augmentedPrompt,
          functionCallResults,
          tools
        );
        assistantText = finalResponse.text || assistantText;
      }
    }

    // 8. Guardamos la respuesta del asistente
    const assistantDocId = await MessageManager.saveAssistantMessage(firestore, chatId, assistantText);

    // 9. Actualizamos la fecha del chat
    await ChatManager.updateChatTimestamp(firestore, chatId);

    // 10. Extraer datos MCP válidos para el campo data
    const mcpDataByType: { [key: string]: any } = {};
    let hasMcpData = false;

    console.log('DEBUG ConversationOrchestrator: Function call results:', functionCallResults.map(r => ({
      name: r.name,
      hasResponse: !!r.response,
      hasMcpData: !!r.response?.mcpData,
      dataType: r.response?.dataType
    })));

    functionCallResults.forEach((result: any) => {
      if (result.response?.mcpData && result.response?.dataType) {
        mcpDataByType[result.response.dataType] = result.response.mcpData;
        hasMcpData = true;
        console.log('DEBUG ConversationOrchestrator: Agregando datos MCP:', {
          dataType: result.response.dataType,
          keys: Object.keys(result.response.mcpData)
        });
      }
    });

    console.log('DEBUG ConversationOrchestrator: Resultado final mcpData:', {
      hasMcpData,
      dataTypes: Object.keys(mcpDataByType)
    });

    // 11. Devolvemos la respuesta con campo data si hay datos MCP
    const responseData: any = {
      id: assistantDocId,
      role: "assistant" as const,
      content: assistantText,
      timestamp: new Date(),
      chatId: chatId
    };

    if (hasMcpData) {
      responseData.data = mcpDataByType;
    }

    return responseData;
  }

  /**
   * Procesa function calls ejecutándolas en el servidor MCP
   */
  private static async processFunctionCalls(
    centerId: string,
    functionCalls: any[],
    mcpConnection: MCPConnection | null
  ): Promise<any[]> {
    const results: any[] = [];
    
    for (const functionCall of functionCalls) {
      try {
        // Convertir function call a formato MCP
        const mcpToolCalls = this.mcpAdapter.convertGenAIResultsToMCP([functionCall]);
        
        if (mcpToolCalls.length > 0) {
          const mcpToolCall = mcpToolCalls[0];
          
          // Ejecutar herramienta MCP
          let toolResult;
          if (mcpConnection?.isConnected) {
            toolResult = await this.mcpConnectionManager.executeToolCall(centerId, mcpToolCall);
          } else {
            // Usar fallback si MCP no está disponible
            toolResult = await this.mcpFallbackHandler.executeFallbackTool(mcpToolCall);
          }
          
          // Convertir resultado de vuelta a formato GenAI
          const genAIResult = this.mcpAdapter.convertMCPResultsToGenAI([toolResult]);
          if (genAIResult.length > 0) {
            results.push(genAIResult[0]);
          }
        }
      } catch (error) {
        console.error(`ConversationOrchestrator: Error procesando function call:`, error);
        // Continuar con otros function calls
      }
    }
    
    return results;
  }

  /**
   * Genera respuesta final incorporando resultados de herramientas
   */
  private static async generateFinalResponse(
    originalPrompt: string,
    functionCallResults: any[],
    tools: any[]
  ): Promise<any> {
    // Crear prompt enriquecido con resultados de herramientas
    const toolResultsText = functionCallResults
      .map(result => `Resultado de ${result.name}: ${JSON.stringify(result.response)}`)
      .join('\n');
    
    const enhancedPrompt = `
      ${originalPrompt}
      
      RESULTADOS DE HERRAMIENTAS:
      ${toolResultsText}
      
      Incorpora estos resultados en tu respuesta de manera natural y útil para el usuario.
    `;
    
    return await this.llmProvider.generateContent({
      prompt: enhancedPrompt,
      tools: tools.length > 0 ? [{ functionDeclarations: tools }] : undefined
    });
  }

  /**
   * Versión simplificada para compatibilidad con código existente
   */
  static async handleChatPromptSimple(
    firestore: Firestore,
    request: ChatRequest
  ): Promise<ChatWithMessages> {
    return await this.handleChatPrompt(firestore, request);
  }
}