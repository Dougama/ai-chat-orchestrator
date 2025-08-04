import { ChatMessage, MCPToolResult, ChatResponseWithData } from "../../types";
import { ChatRequest, ChatWithMessages } from "../chat/interfaces";
import { ChatManager } from "../chat/ChatManager";
import { MessageManager } from "../chat/MessageManager";
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
    const totalStartTime = Date.now();
    let lastLogTime = totalStartTime;
    console.log(
      new Date().toISOString(),
      `📝 Usuario: "${request.prompt}" | +0.00s`
    );

    let chatId = request.chatId;

    // 1. Si no hay chatId, creamos una nueva conversación
    let setupStartTime = Date.now();
    if (!chatId) {
      chatId = await ChatManager.createChat(
        firestore,
        request.prompt,
        request.userId || "anonymous"
      );
    }

    // 2. Guardamos mensaje del usuario y recuperamos historial en paralelo
    const [saveUserMessageResult, historyResult] = await Promise.allSettled([
      MessageManager.saveUserMessage(firestore, chatId, request.prompt),
      MessageManager.getRecentHistory(firestore, chatId, 20),
    ]);

    // Extraer historial del resultado
    const history =
      historyResult.status === "fulfilled" ? historyResult.value : [];

    // Log errores si los hay
    if (saveUserMessageResult.status === "rejected") {
      console.error(
        new Date().toISOString(),
        "❌ Error guardando mensaje usuario:",
        saveUserMessageResult.reason
      );
    }
    if (historyResult.status === "rejected") {
      console.error(
        new Date().toISOString(),
        "❌ Error obteniendo historial:",
        historyResult.reason
      );
    }
    const setupTime = Date.now() - setupStartTime;
    const setupDelta = ((Date.now() - lastLogTime) / 1000).toFixed(2);
    lastLogTime = Date.now();
    console.log(
      new Date().toISOString(),
      `⚙️ Setup (Chat/Message/History): ${setupTime}ms | +${setupDelta}s`
    );

    // 4. Preparamos TODAS las herramientas (internas + MCP) en paralelo
    const toolsStartTime = Date.now();
    let tools: any[] = [];
    let mcpConnection: MCPConnection | null = null;

    // Paralelizar preparación de herramientas internas y MCP
    const [internalToolsResult, mcpResult] = await Promise.allSettled([
      // Herramientas internas (síncronas)
      Promise.resolve(this.getInternalTools()),
      // Herramientas MCP (asíncronas)
      centerId
        ? this.prepareMCPTools(centerId)
        : Promise.resolve({ tools: [], connection: null }),
    ]);

    // Agregar herramientas internas
    if (internalToolsResult.status === "fulfilled") {
      tools.push(...internalToolsResult.value);
    }

    // Agregar herramientas MCP si están disponibles
    if (mcpResult.status === "fulfilled" && mcpResult.value.tools.length > 0) {
      tools.push(...mcpResult.value.tools);
      mcpConnection = mcpResult.value.connection;
    }
    const toolsTime = Date.now() - toolsStartTime;
    const toolsDelta = ((Date.now() - lastLogTime) / 1000).toFixed(2);
    lastLogTime = Date.now();
    console.log(
      new Date().toISOString(),
      `🔧 Preparación herramientas (${tools.length} total): ${toolsTime}ms | +${toolsDelta}s`
    );

    // 5. LLM1: Análisis de herramientas especializado
    const toolAnalysisStartTime = Date.now();
    const toolResults = await this.executeToolAnalysis(
      request.prompt,
      history,
      centerId || "bogota",
      firestore,
      chatId,
      tools,
      mcpConnection
    );
    const toolAnalysisTime = Date.now() - toolAnalysisStartTime;
    const toolAnalysisDelta = ((Date.now() - lastLogTime) / 1000).toFixed(2);
    lastLogTime = Date.now();
    console.log(
      new Date().toISOString(),
      `🔍 Análisis de herramientas: ${toolAnalysisTime}ms${
        toolResults.executed ? " (ejecutado)" : " (no necesario)"
      } | +${toolAnalysisDelta}s`
    );

    // 6. MODO NATIVO: LLM2 con herramientas MCP + contexto RAG
    const nativeStartTime = Date.now();

    // Convertir historial a formato nativo del SDK, incluyendo resultados de herramientas si existen
    const contents = this.formatHistoryForNativeSDK(
      history,
      request.prompt,
      toolResults
    );

    const llmProvider = GoogleGenAIManager.getProvider(
      centerId || "default",
      firestore
    );
    const nativeResponse = await llmProvider.generateContent({
      contents,
      trackTokens: true,
      chatId: chatId,
      // tools: tools.length > 0 ? [{ functionDeclarations: tools }] : undefined,
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.NONE,
        },
      },
      config: {
        temperature: 0.85,
        maxOutputTokens: 3500,
        topK: 40,
        topP: 0.95,
        systemInstruction: `

        # HERRAMIENTAS DISPONIBLES:
        ${tools
          .map(
            (tool) => `
        - ${tool.name}: ${tool.description}
          Parámetros: ${JSON.stringify(tool.parameters, null, 2)}
        `
          )
          .join("")}

        ${
          toolResults?.executed &&
          toolResults.results &&
          toolResults.results.length > 0
            ? `
        # RESULTADOS DE HERRAMIENTAS EJECUTADAS:
        ${toolResults.results
          .map(
            (r) => `
        - ${r.name}: ${JSON.stringify(r.response, null, 2)}
        `
          )
          .join("")}
        `
            : ""
        }
    

        Fecha y hora actual: ${new Date().toISOString()}

        Eres Chelita, una asistente inteligente, amable y eficiente. Servicial y muy dispuesta a ayudar.
        Sabes explicar muy bien las cosas y siempre buscas la mejor solución. antes de ti hay agente que ejecuta herramienta y te las pasa
        en el apartado de herramientas ejecutadas. "RESULTADOS DE HERRAMIENTAS EJECUTADAS: " en caso tal de que el agente no haya ejecutado herramientas,
        y tu creas que si debió hacerlo, intenta obtner los datos necesarios para el usuario.
        Tu objetivo es ayudar al usuario a resolver su consulta de la mejor manera posible en un lenguajo no muy tecnico.
        Olvida codigo o nombres de funciones o parametros, usa un lenguaje natural y amigable.
        las herramientas son tus capacidades y no algo a lo que te debas referir como ajeno.

        las herramientas tienen descripciones que te ayudan a entender para que sirven. Analiza cuales parametros son requerido y cuales son opcionales..
        no inventes datos ni uses valores genéricos, usa los datos que te dan las herramientas
        no solicites al usuario parametros exactos brindale una solicitud intepretada por ti de lo que se requiere
        Analiza los resultados de las herramientas asegurate de tener todos los parametros necesarios para decidir ejecutar una herramienta.
        Si no los tienes pregunta o validalos con el usuario.
        Analiza los datos, de los resultados y entrega un comentario de no mas de 450 caracteres si en la data de las herramientaas hay informacion para complementar o proponer consejos
        usala. 
        importante: hace parte de tu trabajo entender los parametros de las herramientas y ayudar al usuario proporcionartelos servicialmente
    
        si por alguna razon necesitas informacion de algunas de las herramientas, y no te llego informacion de alguna, 
        pidele confirmacion al usuario sobre tu sospecha 
        `,
      },
    });

    const nativeTime = Date.now() - nativeStartTime;
    const nativeDelta = ((Date.now() - lastLogTime) / 1000).toFixed(2);
    lastLogTime = Date.now();
    console.log(
      new Date().toISOString(),
      `🚀 Modo Nativo (todo integrado): ${nativeTime}ms | +${nativeDelta}s`
    );

    // Usar los resultados de herramientas del LLM1 como functionCallResults
    let functionCallResults: any[] = [];
    if (
      toolResults?.executed &&
      toolResults.results &&
      toolResults.results.length > 0
    ) {
      const funcCallsDelta = ((Date.now() - lastLogTime) / 1000).toFixed(2);
      lastLogTime = Date.now();
      console.log(
        new Date().toISOString(),
        `🔧 Herramientas ejecutadas por LLM1: ${toolResults.results
          .map((r) => r.name)
          .join(", ")} | +${funcCallsDelta}s`
      );
      functionCallResults = toolResults.results;
    }

    const assistantText =
      nativeResponse.text || "Echale un vistazo y dime si necesitas algo más.";

    // 7. Preparar datos MCP desde function calls
    const mcpPrepDelta = ((Date.now() - lastLogTime) / 1000).toFixed(2);
    lastLogTime = Date.now();
    console.log(
      new Date().toISOString(),
      `🔧 Procesando resultados de herramientas... | +${mcpPrepDelta}s`
    );
    const mcpData: MCPToolResult[] = functionCallResults.map((result: any) => {
      const toolResult: MCPToolResult = {
        toolName: result.name,
        callId:
          result.callId ||
          `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        success: result.success !== false && !result.error,
        data: {
          params: result.response?.params || {},
          totalRegistros:
            result.response?.total_registros ||
            result.response?.totalCount ||
            result.response?.totalRegistros ||
            0,
        },
      };

      // Agregar error si existe
      if (result.error) {
        toolResult.error = result.error;
        toolResult.success = false;
      }

      return toolResult;
    });

    // 8. Preparar toolData para contexto nativo del historial (excluyendo RAG)
    const toolDataDelta = ((Date.now() - lastLogTime) / 1000).toFixed(2);
    lastLogTime = Date.now();
    console.log(
      new Date().toISOString(),
      `🔧 Procesando toolData para historial... | +${toolDataDelta}s`
    );
    const toolDataForHistory = functionCallResults.reduce((acc, result) => {
      acc[result.name] = result.response || {}; // Solo datos/resultados de la respuesta MCP
      return acc;
    }, {} as { [toolName: string]: any });

    // 9. Guardamos la respuesta del asistente y actualizamos timestamp en paralelo
    const saveStartTime = Date.now();
    const [saveAssistantMessageResult, updateTimestampResult] =
      await Promise.allSettled([
        MessageManager.saveAssistantMessage(
          firestore,
          chatId,
          assistantText,
          mcpData.length > 0 ? mcpData : undefined,
          Object.keys(toolDataForHistory).length > 0
            ? toolDataForHistory
            : undefined
        ),
        ChatManager.updateChatTimestamp(firestore, chatId),
      ]);

    // Extraer assistantDocId del resultado exitoso
    const assistantDocId =
      saveAssistantMessageResult.status === "fulfilled"
        ? saveAssistantMessageResult.value
        : `fallback_${Date.now()}`;

    // Log de errores si los hay
    if (saveAssistantMessageResult.status === "rejected") {
      console.error(
        "❌ Error guardando mensaje:",
        saveAssistantMessageResult.reason
      );
    }
    if (updateTimestampResult.status === "rejected") {
      console.error(
        "❌ Error actualizando timestamp:",
        updateTimestampResult.reason
      );
    }

    const saveTime = Date.now() - saveStartTime;
    const saveDelta = ((Date.now() - lastLogTime) / 1000).toFixed(2);
    lastLogTime = Date.now();
    console.log(
      new Date().toISOString(),
      `💾 Guardar respuesta (paralelo): ${saveTime}ms | +${saveDelta}s`
    );

    // 12. Tiempo total de la función
    const totalTime = Date.now() - totalStartTime;
    const totalDelta = ((Date.now() - lastLogTime) / 1000).toFixed(2);
    console.log(
      new Date().toISOString(),
      `⏱️ TIEMPO TOTAL handleChatPrompt: ${totalTime}ms (${(
        totalTime / 1000
      ).toFixed(2)}s) | +${totalDelta}s`
    );

    // 13. Devolvemos la respuesta con campo data[] si hay resultados MCP
    const responseData: ChatResponseWithData = {
      id: assistantDocId,
      role: "assistant" as const,
      content: assistantText,
      timestamp: new Date(),
      chatId: chatId,
      ...(mcpData.length > 0 && { data: mcpData }),
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

        // Verificar tipo de herramienta y procesar según corresponda
        const isInternalTool = this.isInternalTool(toolName);

        if (isInternalTool) {
          const result = await this.processInternalToolCall(
            firestore,
            chatId,
            centerId,
            functionCall,
            callParams
          );
          if (result) results.push(result);
        } else {
          const result = await this.processMCPToolCall(
            centerId,
            functionCall,
            callParams,
            mcpConnection
          );
          if (result) results.push(result);
        }
      } catch (error) {
        // Continuar con otros function calls
      }
    }

    return results;
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
    Object.values(toolRegistry).forEach((tool) => {
      if (tool.type === "LOCAL") {
        // Convertir definición a formato Google GenAI
        internalTools.push({
          name: tool.definition.name,
          description: tool.definition.description,
          parameters: tool.definition.parameters,
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
    try {
      // Importar dinámicamente el handler RAG
      if (toolName === "buscar_informacion_operacional") {
        const { executeRAGSearch } = await import(
          "../../tools/implementations/local/ragSearch"
        );

        // Usar centerId del parámetro

        const result = await executeRAGSearch(
          firestore,
          chatId,
          centerId,
          callParams
        );

        return {
          name: toolName,
          response: {
            ...result,
            params: callParams,
          },
        };
      }

      return null;
    } catch (error) {
      return {
        name: toolName,
        response: {
          success: false,
          error: error instanceof Error ? error.message : "Error desconocido",
        },
      };
    }
  }

  /**
   * Verifica si una herramienta es interna
   */
  private static isInternalTool(toolName: string): boolean {
    return Object.values(toolRegistry).some(
      (tool) => tool.type === "LOCAL" && tool.definition.name === toolName
    );
  }

  /**
   * Procesa una herramienta interna
   */
  private static async processInternalToolCall(
    firestore: Firestore,
    chatId: string,
    centerId: string,
    functionCall: any,
    callParams: any
  ): Promise<any> {
    return await this.executeInternalTool(
      firestore,
      chatId,
      centerId,
      functionCall.name,
      callParams
    );
  }

  /**
   * Procesa una herramienta MCP
   */
  private static async processMCPToolCall(
    centerId: string,
    functionCall: any,
    callParams: any,
    mcpConnection: MCPConnection | null
  ): Promise<any> {
    // Convertir function call a formato MCP
    const mcpToolCalls = this.mcpAdapter.convertGenAIResultsToMCP([
      functionCall,
    ]);

    if (mcpToolCalls.length === 0) return null;

    const mcpToolCall = mcpToolCalls[0];
    let toolResult;

    // Ejecutar herramienta MCP
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
      console.log(
        new Date().toISOString(),
        `ConversationOrchestrator: MCP tool result: ${
          functionCall.name
        } | success: ${toolResult.success} | hasData: ${!!toolResult.data}`
      );

      return {
        ...genAIResult[0],
        response: {
          ...genAIResult[0].response,
          params: callParams,
        },
      };
    }

    return null;
  }

  /**
   * LLM1: Análisis especializado para decidir qué herramientas ejecutar
   */
  private static async executeToolAnalysis(
    prompt: string,
    history: any[],
    centerId: string,
    firestore: Firestore,
    chatId: string,
    availableTools: any[],
    mcpConnection: MCPConnection | null
  ): Promise<{ executed: boolean; data?: string; results?: any[] }> {
    // Si no hay herramientas disponibles, no ejecutar análisis
    if (!availableTools || availableTools.length === 0) {
      return { executed: false };
    }

    // Crear contenido nativo para análisis RAG (sin recursión)
    const ragContents: any[] = [];

    // // Agregar historial básico
    history.slice(-10).forEach((message) => {
      if (message.role === "user" || message.role === "assistant") {
        ragContents.push({
          role: message.role === "assistant" ? "model" : message.role,
          parts: [{ text: message.content }],
        });
      }
    });

    // IMPORTANTE: Siempre agregar el prompt actual al final
    ragContents.push({
      role: "user",
      parts: [{ text: prompt }],
    });

    const llmProvider = GoogleGenAIManager.getProvider(centerId, firestore);

    const toolResponse = await llmProvider.generateContent({
      contents: ragContents,
      trackTokens: true,
      chatId: chatId + "_tool_analysis",
      tools: [{ functionDeclarations: availableTools }],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.AUTO,
        },
      },
      config: {
        temperature: 0.8, // Más determinístico para decisiones
        maxOutputTokens: 1500,
        topK: 30,
        topP: 0.95,
        systemInstruction: `
          Haces parte de un equipo de agentes permiten asistir a un operatio
          eres el agente 1 las herramientas que ejecutes serán usadas por el agente 2 
          tu trabajo es muy importante y delicado hazlo con exactitud y precision.
          tu trabajo es Decidir ejecutar alguna herramienta segun la descripción de las mismas 
          y la intencion del usuario segun su pregunta, mensaje o solicitud actual: ${prompt}
          y su relacion con el historial.
          Si decides ejecutar alguna herramienta cualquiera  utiliza  la herramienta buscar_informacion_operacional para buscar informacion que ayude a complementar los datos ya sea para mejorar los resultados o algun consejo. tu decides el parametro de busqueda basado en la descripción de la herramienta que decidiste ejecutar.

          NO EJECTUAR: saludos, conversación general
          Ejecuta inmediatamente si corresponde.`,
      },
    });
    // Si ejecutó herramientas
    if (toolResponse.functionCalls && toolResponse.functionCalls.length > 0) {
      const toolResults: any[] = [];

      // Procesar todas las function calls usando el método completo
      const allToolResults = await this.processFunctionCalls(
        firestore,
        chatId,
        centerId,
        toolResponse.functionCalls,
        mcpConnection // Pasar la conexión MCP activa
      );

      toolResults.push(...allToolResults);

      return {
        executed: toolResults.length > 0,
        data:
          toolResults.length > 0
            ? JSON.stringify(toolResults.map((r) => r.response))
            : "Sin resultados de herramientas",
        results: toolResults,
      };
    }

    return { executed: false };
  }

  /**
   * Convierte historial a formato nativo del SDK con contexto de herramientas
   */
  private static formatHistoryForNativeSDK(
    history: any[],
    currentPrompt: string,
    toolResults?: { executed: boolean; data?: string; results?: any[] }
  ): any[] {
    const contents: any[] = [];

    // Reconstruir el historial manteniendo la secuencia correcta (sin mensajes system)
    history.slice(-15).forEach((message) => {
      // Saltar mensajes system - Google GenAI no los acepta
      if (message.role === "system") return;

      // Agregar mensaje del usuario
      if (message.role === "user") {
        contents.push({
          role: "user",
          parts: [{ text: message.content }],
        });
      }

      // Para mensajes del asistente
      if (message.role === "assistant") {
        // Si usó herramientas, reconstruir la secuencia completa
        if (message.toolData && Object.keys(message.toolData).length > 0) {
          // Optimización: una sola iteración sobre toolData
          const functionCalls: any[] = [];
          const functionResponses: any[] = [];

          // Una sola iteración para construir ambos arrays
          for (const [toolName, data] of Object.entries(message.toolData)) {
            const toolData = data as any; // Type assertion para toolData
            functionCalls.push({
              functionCall: {
                name: toolName,
                args: toolData.params || toolData.args || {},
              },
            });

            functionResponses.push({
              functionResponse: {
                name: toolName,
                response: toolData.result || toolData,
              },
            });
          }

          // 1. Agregar los function calls del modelo
          contents.push({
            role: "model",
            parts: functionCalls,
          });

          // 2. Agregar los resultados de las funciones
          contents.push({
            role: "function",
            parts: functionResponses,
          });
        }

        // 3. Siempre agregar la respuesta final del modelo
        contents.push({
          role: "model",
          parts: [{ text: message.content }],
        });
      }
    });

    // 3. Inyectar herramientas ejecutadas por LLM1 antes del prompt actual
    if (
      toolResults?.executed &&
      toolResults.results &&
      toolResults.results.length > 0
    ) {
      // 3a. Function calls del LLM1
      contents.push({
        role: "model",
        parts: toolResults.results.map((r) => ({
          functionCall: {
            name: r.name,
            args: r.response?.params || {},
          },
        })),
      });

      // 3b. Resultados de las funciones
      contents.push({
        role: "function",
        parts: toolResults.results.map((r) => ({
          functionResponse: {
            name: r.name,
            response: r.response,
          },
        })),
      });
    }

    // 4. Prompt actual del usuario (limpio, sin modificaciones)
    contents.push({
      role: "user",
      parts: [{ text: currentPrompt }],
    });

    return contents;
  }

  /**
   * Prepara herramientas MCP de forma asíncrona
   */
  private static async prepareMCPTools(centerId: string): Promise<{
    tools: any[];
    connection: MCPConnection | null;
  }> {
    try {
      // Intentar conectar a MCP del centro
      const mcpConnection = await this.mcpConnectionManager.connectToCenter(
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
          const mcpGenAITools =
            this.mcpAdapter.convertMCPToolsToGenAI(validTools);
          return { tools: mcpGenAITools, connection: mcpConnection };
        }
      }

      return { tools: [], connection: mcpConnection };
    } catch (error) {
      // Continuar sin herramientas MCP
      return { tools: [], connection: null };
    }
  }
}
