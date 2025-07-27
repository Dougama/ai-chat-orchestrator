import { ChatMessage, MCPToolResult, ChatResponseWithData } from "../../types";
import { ChatRequest, ChatWithMessages, ToolCall } from "../chat/interfaces";
import { ChatManager } from "../chat/ChatManager";
import { MessageManager } from "../chat/MessageManager";
import { RAGPipeline } from "../rag/RAGPipeline";
import { GoogleGenAIManager } from "../llm/GoogleGenAIManager";
import { MCPConnectionManager } from "../mcp/MCPConnectionManager";
import { MCPAdapter } from "../mcp/MCPAdapter";
import { MCPFallbackHandler } from "../mcp/MCPFallbackHandler";
import { MCPConnection } from "../mcp/interfaces";
import { Firestore, Timestamp, FieldValue } from "@google-cloud/firestore";
import { FunctionCallingConfigMode } from "@google/genai";
import { toolRegistry } from "../../tools/definitions/tool_registry";

export class ConversationOrchestrator {
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
  ): Promise<ChatResponseWithData> {
    console.log(
      `Recibido prompt: "${request.prompt}", para el chat ID: ${
        request.chatId || "Nuevo Chat"
      }`
    );

    let chatId = request.chatId;

    // 1. Si no hay chatId, creamos una nueva conversación
    if (!chatId) {
      console.log(
        `🔍 DEBUG ConversationOrchestrator - request.userId:`,
        request.userId
      );
      chatId = await ChatManager.createChat(
        firestore,
        request.prompt,
        request.userId || "anonymous"
      );
      console.log(
        `Nuevo chat creado con ID: ${chatId} para userId: ${
          request.userId || "anonymous"
        }`
      );
    }

    // 2. Guardamos el nuevo mensaje del usuario
    await MessageManager.saveUserMessage(firestore, chatId, request.prompt);

    // 3. Recuperamos el historial reciente para el contexto
    const history = await MessageManager.getRecentHistory(
      firestore,
      chatId,
      10
    );

    // 4. Ejecutamos el pipeline de RAG
    const augmentedPrompt = await RAGPipeline.executeRAGPipeline(
      firestore,
      request.prompt,
      history,
      centerId || "bogota"
    );

    // 5. Preparamos herramientas (internas + MCP)
    let tools: any[] = [];
    let mcpConnection: MCPConnection | null = null;

    // Agregar herramientas internas
    const internalTools = this.getInternalTools();
    tools.push(...internalTools);
    console.log(`ConversationOrchestrator: ${internalTools.length} herramientas internas agregadas`);

    if (centerId) {
      try {
        // Intentar conectar a MCP del centro
        mcpConnection = await this.mcpConnectionManager.connectToCenter(
          centerId
        );

        if (mcpConnection.isConnected) {
          // Obtener herramientas disponibles del centro
          const mcpTools = await this.mcpConnectionManager.getAvailableTools(
            centerId
          );
          const validTools = this.mcpAdapter.filterValidMCPTools(mcpTools);

          if (validTools.length > 0) {
            // Convertir herramientas MCP a formato Google GenAI
            const mcpGenAITools = this.mcpAdapter.convertMCPToolsToGenAI(validTools);
            tools.push(...mcpGenAITools);
            console.log(
              `ConversationOrchestrator: ${mcpGenAITools.length} herramientas MCP configuradas para ${centerId}`
            );
          }
        }
      } catch (error) {
        console.warn(
          `ConversationOrchestrator: Error conectando MCP para ${centerId}:`,
          error
        );
        // Continuar sin herramientas MCP
      }
    }

    // 6. Generamos la respuesta del asistente (con herramientas MCP si están disponibles)
    const llmProvider = GoogleGenAIManager.getProvider(centerId || 'default');

    const generationConfig = {
      prompt: augmentedPrompt,
      ...(tools.length > 0 && {
        tools: [{ functionDeclarations: tools }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: tools.map((t) => t.name),
          },
        },
      }),
    };

    // console.log('DEBUG: Configuración enviada a LLM:', JSON.stringify(generationConfig, null, 2));

    const response = await llmProvider.generateContent(generationConfig);
    let assistantText = response.text || "";

    // console.log("DEBUG: Respuesta LLM:", {
    //   text: assistantText?.substring(0, 100) + "...",
    //   hasFunctionCalls: !!(
    //     response.functionCalls && response.functionCalls.length > 0
    //   ),
    //   functionCallsCount: response.functionCalls?.length || 0,
    // });

    // 7. Procesar function calls si existen
    let functionCallResults: any[] = [];
    if (response.functionCalls && response.functionCalls.length > 0) {
      functionCallResults = await this.processFunctionCalls(
        firestore,
        chatId,
        centerId || 'default',
        response.functionCalls,
        mcpConnection
      );

      if (functionCallResults.length > 0) {
        // Generar respuesta final con resultados de herramientas
        const finalResponse = await this.generateFinalResponse(
          augmentedPrompt,
          functionCallResults,
          tools,
          centerId || "default"
        );
        assistantText = finalResponse.text || assistantText;
      }
    }

    // 8. Guardamos la respuesta del asistente
    const assistantDocId = await MessageManager.saveAssistantMessage(
      firestore,
      chatId,
      assistantText
    );

    // 9. Actualizamos la fecha del chat
    await ChatManager.updateChatTimestamp(firestore, chatId);

    // 10. Preparar datos MCP en formato simplificado
    const mcpData: MCPToolResult[] = functionCallResults.map((result: any) => ({
      toolName: result.name,
      callId: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      success: !!result.response && !result.response.error,
      data: result.response,
      error: result.response?.error
    }));

    console.log("DEBUG ConversationOrchestrator: MCP data preparada:", {
      toolCallsCount: mcpData.length,
      tools: mcpData.map(d => ({ toolName: d.toolName, success: d.success }))
    });

    // 11. Devolvemos la respuesta con campo data[] si hay resultados MCP
    const responseData: ChatResponseWithData = {
      id: assistantDocId,
      role: "assistant" as const,
      content: assistantText,
      timestamp: new Date(),
      chatId: chatId,
      ...(mcpData.length > 0 && { data: mcpData })
    };

    return responseData;
  }

  /**
   * Procesa function calls ejecutándolas (internas o MCP)
   */
  private static async processFunctionCalls(
    firestore: Firestore,
    chatId: string,
    centerId: string,
    functionCalls: any[],
    mcpConnection: MCPConnection | null
  ): Promise<any[]> {
    const results: any[] = [];

    for (const functionCall of functionCalls) {
      try {
        const toolName = functionCall.name;
        const callParams = this.extractToolCallParams(functionCall);
        
        console.log(`ConversationOrchestrator: Procesando function call: ${toolName}`);
        
        // Verificar si es herramienta interna
        const isInternalTool = Object.values(toolRegistry).some(
          tool => tool.type === "LOCAL" && tool.definition.name === toolName
        );
        
        if (isInternalTool) {
          // Ejecutar herramienta interna
          const result = await this.executeInternalTool(firestore, chatId, toolName, callParams);
          if (result) {
            results.push(result);
          }
        } else {
          // Verificar caché antes de ejecutar herramienta MCP
          const cachedResult = await this.checkToolCallCache(firestore, chatId, toolName, callParams);
          
          if (cachedResult) {
            console.log(`ConversationOrchestrator: Usando caché para ${toolName}`);
            results.push({
              name: toolName,
              response: {
                fromCache: true,
                params: callParams
              }
            });
          } else {
            // Ejecutar herramienta MCP
            const mcpToolCalls = this.mcpAdapter.convertGenAIResultsToMCP([functionCall]);

            if (mcpToolCalls.length > 0) {
              const mcpToolCall = mcpToolCalls[0];

              let toolResult;
              if (mcpConnection?.isConnected) {
                toolResult = await this.mcpConnectionManager.executeToolCall(
                  centerId,
                  mcpToolCall
                );
              } else {
                toolResult = await this.mcpFallbackHandler.executeFallbackTool(
                  mcpToolCall
                );
              }

              // Convertir resultado de vuelta a formato GenAI
              const genAIResult = this.mcpAdapter.convertMCPResultsToGenAI([toolResult]);
              if (genAIResult.length > 0) {
                // Modificar resultado para incluir solo params
                const modifiedResult = {
                  ...genAIResult[0],
                  response: {
                    params: callParams,
                    totalRegistros: toolResult.data?.totalRegistros || toolResult.data?.length || 0
                  }
                };
                results.push(modifiedResult);
                
                // Guardar llamada MCP exitosa en historial
                console.log(`ConversationOrchestrator: MCP tool result - toolName: ${toolName}, success: ${toolResult.success}`);
                if (toolResult.success) {
                  console.log(`ConversationOrchestrator: Guardando toolCall exitoso: ${toolName}`);
                  await this.saveToolCall(firestore, chatId, toolName, callParams, true);
                } else {
                  console.log(`ConversationOrchestrator: No guardando toolCall fallido: ${toolName}, error: ${toolResult.error}`);
                }
              }
            }
          }
        }
      } catch (error) {
        console.error(
          `ConversationOrchestrator: Error procesando function call:`,
          error
        );
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
    tools: any[],
    centerId: string
  ): Promise<any> {
    const llmProvider = GoogleGenAIManager.getProvider(centerId);

    // Crear prompt enriquecido con resultados de herramientas
    const toolResultsText = functionCallResults
      .map(
        (result) =>
          `Resultado de ${result.name}: ${JSON.stringify(result.response)}`
      )
      .join("\n");

    const enhancedPrompt = `
      ${originalPrompt}
      
      DATOS DE HERRAMIENTAS EJECUTADAS:
      ${toolResultsText}
      
      INSTRUCCIONES PARA LA RESPUESTA:
      - Los datos detallados arriba se mostrarán VISUALMENTE al usuario en una interfaz separada
      - NO enumeres/listes todos los datos individualmente en tu respuesta
      - Haz un ANÁLISIS/RESUMEN de los datos: totales, patrones, insights importantes
      - Menciona qué tipo de información encontraste y los principales hallazgos
      - Sé conciso pero informativo y útil
      - Enfócate en interpretar los datos más que en mostrarlos
    `;

    return await llmProvider.generateContent({
      prompt: enhancedPrompt,
      tools: tools.length > 0 ? [{ functionDeclarations: tools }] : undefined,
    });
  }

  /**
   * Versión simplificada para compatibilidad con código existente
   */
  static async handleChatPromptSimple(
    firestore: Firestore,
    request: ChatRequest
  ): Promise<ChatResponseWithData> {
    return await this.handleChatPrompt(firestore, request);
  }

  /**
   * Obtiene herramientas internas disponibles en formato Google GenAI
   */
  private static getInternalTools(): any[] {
    const internalTools: any[] = [];
    
    // Iterar sobre herramientas locales del registry
    Object.values(toolRegistry).forEach(tool => {
      if (tool.type === "LOCAL") {
        // Convertir definición a formato Google GenAI
        internalTools.push({
          name: tool.definition.name,
          description: tool.definition.description,
          parameters: tool.definition.parameters
        });
      }
    });
    
    return internalTools;
  }

  /**
   * Extrae parámetros de una llamada de función para guardar en toolCalls
   */
  private static extractToolCallParams(functionCall: any): any {
    return functionCall.args || functionCall.parameters || {};
  }

  /**
   * Ejecuta una herramienta interna
   */
  private static async executeInternalTool(
    firestore: Firestore,
    chatId: string,
    toolName: string,
    callParams: any
  ): Promise<any> {
    console.log(`ConversationOrchestrator: Ejecutando herramienta interna: ${toolName}`);
    
    try {
      // Agregar más herramientas internas aquí en el futuro
      console.warn(`ConversationOrchestrator: Herramienta interna no implementada: ${toolName}`);
      return null;
      
    } catch (error) {
      console.error(`ConversationOrchestrator: Error ejecutando herramienta interna ${toolName}:`, error);
      return {
        name: toolName,
        response: {
          error: error instanceof Error ? error.message : 'Error desconocido'
        }
      };
    }
  }

  /**
   * Verifica si existe una llamada previa con los mismos parámetros en el caché
   */
  private static async checkToolCallCache(
    firestore: Firestore,
    chatId: string,
    toolName: string,
    callParams: any
  ): Promise<any | null> {
    try {
      const chatDoc = await firestore.collection("chats").doc(chatId).get();
      
      if (!chatDoc.exists) {
        return null;
      }
      
      const chatData = chatDoc.data();
      const toolCalls: ToolCall[] = chatData?.toolCalls || [];
      
      // Buscar llamada previa con mismos parámetros
      const cachedCall = toolCalls.find(call => 
        call.toolName === toolName &&
        call.success &&
        this.deepEqual(call.callParams, callParams)
      );
      
      if (cachedCall) {
        console.log(`ConversationOrchestrator: Encontrada llamada en caché para ${toolName}`);
        return cachedCall;
      }
      
      return null;
    } catch (error) {
      console.error(`ConversationOrchestrator: Error verificando caché:`, error);
      return null;
    }
  }

  /**
   * Compara dos objetos profundamente para verificar igualdad
   */
  private static deepEqual(obj1: any, obj2: any): boolean {
    if (obj1 === obj2) return true;
    
    if (obj1 == null || obj2 == null) return false;
    
    if (typeof obj1 !== typeof obj2) return false;
    
    if (typeof obj1 !== 'object') return obj1 === obj2;
    
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    
    if (keys1.length !== keys2.length) return false;
    
    for (let key of keys1) {
      if (!keys2.includes(key)) return false;
      if (!this.deepEqual(obj1[key], obj2[key])) return false;
    }
    
    return true;
  }

  /**
   * Guarda una llamada de herramienta en el historial del chat
   */
  private static async saveToolCall(
    firestore: Firestore,
    chatId: string,
    toolName: string,
    callParams: any,
    success: boolean
  ): Promise<void> {
    try {
      const toolCall: ToolCall = {
        toolName,
        callParams,
        timestamp: Timestamp.now(),
        success
      };
      
      const chatRef = firestore.collection("chats").doc(chatId);
      
      await chatRef.update({
        toolCalls: FieldValue.arrayUnion(toolCall)
      });
      
      console.log(`ConversationOrchestrator: Llamada de herramienta guardada: ${toolName}`);
    } catch (error) {
      console.error(`ConversationOrchestrator: Error guardando llamada de herramienta:`, error);
      // No lanzamos error para no interrumpir el flujo principal
    }
  }
}
