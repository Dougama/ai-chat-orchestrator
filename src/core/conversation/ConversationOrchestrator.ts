import { ChatMessage, MCPToolResult, ChatResponseWithData } from "../../types";
import { ChatRequest, ChatWithMessages } from "../chat/interfaces";
import { ChatManager } from "../chat/ChatManager";
import { MessageManager } from "../chat/MessageManager";
import { buildAugmentedPrompt } from "./PromptBuilder";
import { IntentionInterpreter } from "./IntentionInterpreter";
import { GoogleGenAIManager } from "../llm/GoogleGenAIManager";
import { MCPConnectionManager } from "../mcp/MCPConnectionManager";
import { MCPAdapter } from "../mcp/MCPAdapter";
import { MCPFallbackHandler } from "../mcp/MCPFallbackHandler";
import { MCPConnection } from "../mcp/interfaces";
import { Firestore } from "@google-cloud/firestore";
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

    // 3. Recuperamos el historial reciente para el contexto (aumentado para mejor continuidad)
    const history = await MessageManager.getRecentHistory(
      firestore,
      chatId,
      80  // Aumentado a 80 para mantener contexto completo de conversaciones largas
    );

    // 4. Obtener herramientas MCP disponibles para el IntentionInterpreter
    let availableMCPTools: any[] = [];
    if (centerId) {
      try {
        const mcpTools = await this.mcpConnectionManager.getAvailableTools(centerId);
        availableMCPTools = this.mcpAdapter.filterValidMCPTools(mcpTools).map(tool => ({
          name: tool.name,
          description: tool.description
        }));
      } catch (error) {
        console.warn(`Error obteniendo herramientas MCP para IntentionInterpreter:`, error);
      }
    }

    // 5. Enriquecer prompt con IntentionInterpreter si es necesario
    console.log(`🧠 Analizando intención del usuario con LLM`);
    const enhancedPrompt = await IntentionInterpreter.enhanceUserPrompt(
      request.prompt, 
      centerId || "bogota",
      availableMCPTools,
      firestore
    );
    
    // 6. Construir prompt augmentado con historial (sin RAG automático)
    console.log(`📝 Construyendo prompt final`);
    const augmentedPrompt = buildAugmentedPrompt(enhancedPrompt, history, []);

    // 7. Preparamos herramientas (internas + MCP)
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

    // 8. Generamos la respuesta del asistente (con herramientas MCP si están disponibles)
    const llmProvider = GoogleGenAIManager.getProvider(centerId || 'default', firestore);

    const generationConfig = {
      prompt: augmentedPrompt,
      trackTokens: true,
      chatId: chatId,
      ...(tools.length > 0 && {
        tools: [{ functionDeclarations: tools }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.AUTO,
          },
        },
      }),
    };

    console.log('DEBUG: Configuración enviada a LLM:', {
      hasPrompt: !!generationConfig.prompt,
      promptLength: generationConfig.prompt?.length,
      hasTools: !!generationConfig.tools,
      toolsCount: generationConfig.tools?.[0]?.functionDeclarations?.length || 0
    });

    const response = await llmProvider.generateContent(generationConfig);
    let assistantText = response.text || "";
    
    console.log("DEBUG: Respuesta del LLM:", {
      hasText: !!response.text,
      text: response.text,
      textLength: response.text?.length,
      hasFunctionCalls: !!(response.functionCalls && response.functionCalls.length > 0),
      functionCallsLength: response.functionCalls?.length || 0
    });

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

    // 8. SOLUCIÓN CRÍTICA: Si no hay texto Y no hay function calls, generar respuesta sin herramientas
    if (!assistantText && (!response.functionCalls || response.functionCalls.length === 0)) {
      console.log("DEBUG: Regenerando respuesta sin herramientas para mensaje simple");
      
      const fallbackResponse = await llmProvider.generateContent({
        prompt: augmentedPrompt,
        trackTokens: true,
        chatId: chatId,
        // No incluir herramientas para forzar respuesta de conversación normal
      });
      
      assistantText = fallbackResponse.text || "Lo siento, no pude generar una respuesta en este momento.";
      
      console.log("DEBUG: Respuesta fallback generada:", {
        hasText: !!fallbackResponse.text,
        textLength: fallbackResponse.text?.length
      });
    }

    // 9. Preparar datos MCP en formato simplificado ANTES de guardar el mensaje
    const mcpData: MCPToolResult[] = functionCallResults.map((result: any) => {
      const toolResult: MCPToolResult = {
        toolName: result.name,
        callId: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        success: !!result.response && !result.response.error,
        data: {
          params: result.response?.params || {},
          totalRegistros: result.response?.totalCount || result.response?.totalRegistros || 0
        }
      };
      
      // Solo agregar error si existe
      if (result.response?.error) {
        toolResult.error = result.response.error;
      }
      
      return toolResult;
    });

    // 10. Guardamos la respuesta del asistente con data si existe
    const assistantDocId = await MessageManager.saveAssistantMessage(
      firestore,
      chatId,
      assistantText,
      mcpData.length > 0 ? mcpData : undefined
    );

    // 11. Actualizamos la fecha del chat
    await ChatManager.updateChatTimestamp(firestore, chatId);

    console.log("DEBUG ConversationOrchestrator: MCP data preparada:", {
      toolCallsCount: mcpData.length,
      tools: mcpData.map(d => ({ toolName: d.toolName, success: d.success }))
    });

    // 12. Devolvemos la respuesta con campo data[] si hay resultados MCP
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
          const result = await this.executeInternalTool(firestore, chatId, centerId, toolName, callParams);
          if (result) {
            results.push(result);
          }
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
              console.log(`ConversationOrchestrator: Tool result data:`, {
                toolName,
                hasData: !!toolResult.data,
                dataKeys: toolResult.data ? Object.keys(toolResult.data) : [],
                totalCount: toolResult.data?.totalCount,
                totalRegistros: toolResult.data?.totalRegistros
              });
              
              // IMPORTANTE: Mantener el resultado original para que el LLM pueda verlo
              // pero agregar el campo params para el frontend
              results.push({
                ...genAIResult[0],
                response: {
                  ...genAIResult[0].response,
                  params: callParams
                }
              });
              
              // Log del resultado
              console.log(`ConversationOrchestrator: MCP tool result - toolName: ${toolName}, success: ${toolResult.success}`);
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
      - Los datos detallados arriba se mostrarán VISUALMENTE al usuario en tarjetas informativas debajo de tu respuesta
      - NO reproduzcas/copies los datos en crudo (JSON, arrays, objetos, códigos, IDs, fechas exactas, etc.)
      - NO enumeres/listes todos los registros o items individualmente 
      - NO menciones parámetros técnicos como "params", "totalRegistros", "callId", etc.
      - Haz un ANÁLISIS/RESUMEN conciso de los datos: totales, patrones, insights importantes, tendencias
      - Menciona qué tipo de información encontraste y los principales hallazgos de negocio
      - Interpreta los datos desde una perspectiva operacional/gerencial útil para el usuario
      - SIEMPRE termina tu respuesta indicando al usuario que vea los detalles completos en las tarjetas de abajo
      - Usa frases como: "Puedes ver todos los detalles en las tarjetas de información a continuación" o "Revisa los detalles completos en las tarjetas de abajo"
      - Sé conciso pero informativo y útil
      - Enfócate en interpretar los datos más que en mostrarlos
    `;

    return await llmProvider.generateContent({
      prompt: enhancedPrompt,
      trackTokens: true,
      chatId: "final_response", // Identificador especial para respuestas finales
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
    centerId: string,
    toolName: string,
    callParams: any
  ): Promise<any> {
    console.log(`ConversationOrchestrator: Ejecutando herramienta interna: ${toolName}`);
    
    try {
      // Importar dinámicamente el handler RAG
      if (toolName === 'buscar_informacion_operacional') {
        const { executeRAGSearch } = await import('../../tools/implementations/local/ragSearch');
        
        // Usar centerId del parámetro
        
        const result = await executeRAGSearch(firestore, chatId, centerId, callParams);
        
        return {
          name: toolName,
          response: result
        };
      }
      
      console.warn(`ConversationOrchestrator: Herramienta interna no implementada: ${toolName}`);
      return null;
      
    } catch (error) {
      console.error(`ConversationOrchestrator: Error ejecutando herramienta interna ${toolName}:`, error);
      return {
        name: toolName,
        response: {
          success: false,
          error: error instanceof Error ? error.message : 'Error desconocido'
        }
      };
    }
  }



}
