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
      MessageManager.getRecentHistory(firestore, chatId, 20)
    ]);

    // Extraer historial del resultado
    const history = historyResult.status === 'fulfilled' 
      ? historyResult.value 
      : [];

    // Log errores si los hay
    if (saveUserMessageResult.status === 'rejected') {
      console.error(new Date().toISOString(), '❌ Error guardando mensaje usuario:', saveUserMessageResult.reason);
    }
    if (historyResult.status === 'rejected') {
      console.error(new Date().toISOString(), '❌ Error obteniendo historial:', historyResult.reason);
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
      Promise.resolve(this.getInternalTools().filter(
        (tool) => tool.name !== "buscar_informacion_operacional"
      )),
      // Herramientas MCP (asíncronas)
      centerId ? this.prepareMCPTools(centerId) : Promise.resolve({ tools: [], connection: null })
    ]);

    // Agregar herramientas internas
    if (internalToolsResult.status === 'fulfilled') {
      tools.push(...internalToolsResult.value);
    }

    // Agregar herramientas MCP si están disponibles
    if (mcpResult.status === 'fulfilled' && mcpResult.value.tools.length > 0) {
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

    // 5. LLM1: Análisis RAG especializado
    const ragStartTime = Date.now();
    const ragResults = await this.executeRAGAnalysis(
      request.prompt,
      history,
      centerId || "bogota",
      firestore,
      chatId
    );
    const ragTime = Date.now() - ragStartTime;
    const ragDelta = ((Date.now() - lastLogTime) / 1000).toFixed(2);
    lastLogTime = Date.now();
    console.log(
      new Date().toISOString(),
      `🔍 Análisis RAG: ${ragTime}ms${
        ragResults.executed ? " (ejecutado)" : " (no necesario)"
      } | +${ragDelta}s`
    );

    // 6. MODO NATIVO: LLM2 con herramientas MCP + contexto RAG
    const nativeStartTime = Date.now();

    // Convertir historial a formato nativo del SDK, incluyendo resultados RAG si existen
    const contents = this.formatHistoryForNativeSDK(
      history,
      request.prompt,
      ragResults
    );

    const llmProvider = GoogleGenAIManager.getProvider(
      centerId || "default",
      firestore
    );

    const nativeResponse = await llmProvider.generateContent({
      contents,
      trackTokens: true,
      chatId: chatId,
      tools: tools.length > 0 ? [{ functionDeclarations: tools }] : undefined,
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.AUTO,
        },
      },
      config: {
        temperature: 0.7,
        maxOutputTokens: 3500,
        topK: 40,
        topP: 0.95,
        systemInstruction: `
        Fecha y hora actual: ${new Date().toISOString()}

        Eres Chelita, una asistente inteligente, amable y eficiente. Servicial y muy dispuesta a ayudar.
        Sabes explicar muy bien las cosas y siempre buscas la mejor solución.
        Tu objetivo es ayudar al usuario a resolver su consulta de la mejor manera posible en un lenguajo no muy tecnico.
        Olvida codigo o nombres de funciones o parametros, usa un lenguaje natural y amigable.
        las herramientas son tus capacidades y no algo a lo que te debas referir como ajeno.

        las herramientas tienen descripciones que te ayudan a entender para que sirven. Analiza cuales parametros son requerido y cuales son opcionales..
        no inventes datos ni uses valores genéricos, usa los datos que te dan las herramientas
        no solicites al usuario parametros exactos brindale una solicitud intepretada por ti de lo que se requiere

        Analiza los resultados de las erramientas asegurate de tener todos los parametros necesarios para decidir ejecutar una herramienta.
        Si no los tienes pregunta o validalos con el usuario.
        
        ${
          ragResults?.executed && ragResults.result
            ? `
        # BASE DEL CONOCIMIENTO:
        ${JSON.stringify(ragResults.result.response, null, 2)}
        
        INSTRUCCIÓN IMPORTANTE: Si existe la base del conocimiento arriba y tiene relación con lo que pregunta el usuario según el historial y su último mensaje, entonces responde basado en esa información. Si no tiene relación o no existe, continúa decidiendo lo que consideres apropiado, ya sea ejecutar herramientas o responder de otra manera.
        `
            : ""
        }
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

    // Procesar function calls si existen
    let functionCallResults: any[] = [];
    if (
      nativeResponse.functionCalls &&
      nativeResponse.functionCalls.length > 0
    ) {
      const funcCallsDelta = ((Date.now() - lastLogTime) / 1000).toFixed(2);
      lastLogTime = Date.now();
      console.log(
        new Date().toISOString(),
        `🔧 Function calls ejecutadas: ${nativeResponse.functionCalls
          .map((f) => f.name)
          .join(", ")} | +${funcCallsDelta}s`
      );
      functionCallResults = await this.processFunctionCalls(
        firestore,
        chatId,
        centerId || "bogota",
        nativeResponse.functionCalls,
        mcpConnection
      );
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
    const mcpData: MCPToolResult[] = functionCallResults
      .filter((result: any) => result.name !== "buscar_informacion_operacional") // Excluir RAG
      .map((result: any) => {
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
    const toolDataForHistory = functionCallResults
      .filter((result: any) => result.name !== "buscar_informacion_operacional") // Excluir RAG
      .reduce((acc, result) => {
        acc[result.name] = result.response || {}; // Solo datos/resultados de la respuesta MCP
        return acc;
      }, {} as { [toolName: string]: any });

    // 9. Guardamos la respuesta del asistente y actualizamos timestamp en paralelo
    const saveStartTime = Date.now();
    const [saveAssistantMessageResult, updateTimestampResult] = await Promise.allSettled(
      [
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
      ]
    );

    // Extraer assistantDocId del resultado exitoso
    const assistantDocId =
      saveAssistantMessageResult.status === "fulfilled"
        ? saveAssistantMessageResult.value
        : `fallback_${Date.now()}`;

    // Log de errores si los hay
    if (saveAssistantMessageResult.status === "rejected") {
      console.error("❌ Error guardando mensaje:", saveAssistantMessageResult.reason);
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
   * KISS: Intérprete de herramientas simple - EJECUTA herramientas y retorna datos
   */
  private static async executeToolInterpreter(
    prompt: string,
    tools: any[],
    history: any[],
    centerId: string,
    firestore: Firestore,
    chatId: string,
    mcpConnection: any
  ): Promise<{ data: string; results: any[] }> {
    const toolInterpreterStartTime = Date.now();
    const toolPrompt = `
    Eres un interprete en una conversacion (chat) entre un asistente y un usuario
    Tu trabajo es analizar el mensaje del usuario para entender su relación con el historial
    y las herramientas disponibles segun su descripción para determinar la intención mas probable y definir con criterio
    lo que el usuario quiere lograr. y si una herramienta es necesaria o no.
    

    Ejecuta las herramientas necesarias considerando el contexto temporal y conversacional.
    por favor analiza profundamente Si algun parametro requerido para una herramienta falta, no debes ejecutarla.
    La unica condicion para ejecutar una herramienta es que exista una relacion semantica entre el mensaje del usuario
    las herramientas disponibles y el historial reciente de la conversacion.
    <HISTORIAL_RECIENTE_DE_CONVERSACION>
      ${MessageManager.formatHistoryForLLM(history.slice(-5))}
    </HISTORIAL_RECIENTE_DE_CONVERSACION>
    <MENSAJE_DEL_USUARIO>
    "${prompt}"
    </MENSAJE_DEL_USUARIO>
    <HERRAMIENTAS> 
      ${tools.map((t) => `- ${t.name}: ${t.description}`).join("\n")}
    </HERRAMIENTAS>


   SOLO ejecutar herramientas si TODOS los parámetros requeridos están disponibles
   Si falta algún parámetro requerido, NO ejecutar la herramienta
    NO inventar datos ni usar valores genéricos
    
`;

    // Usar modelo LITE (Flash)
    const llmProvider = GoogleGenAIManager.getProvider(centerId, firestore);
    const response = await llmProvider.generateContent({
      prompt: toolPrompt,
      trackTokens: true,
      chatId: chatId + "_tools",
      tools: [{ functionDeclarations: tools }],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.ANY,
        },
      },
      config: {
        temperature: 0.1, // Muy determinístico
        maxOutputTokens: 2000,
        topK: 10,
        topP: 0.7,
      },
    });

    // Procesar herramientas ejecutadas
    let results: any[] = [];
    if (response.functionCalls && response.functionCalls.length > 0) {
      console.log(
        new Date().toISOString(),
        `🔧 ToolInterpreter FUNCTIONS: ${response.functionCalls
          .map((f) => f.name)
          .join(", ")} herramientas ejecutadas`
      );
      // Procesar cada llamada de función
      results = await this.processFunctionCalls(
        firestore,
        chatId,
        centerId,
        response.functionCalls,
        mcpConnection
      );
    }

    const data =
      results.length > 0
        ? results
            .map((r) => `${r.name}: ${JSON.stringify(r.response)}`)
            .join("\n")
        : "No se ejecutaron herramientas";

    return { data, results };
  }

  /**
   * LLM1: Análisis especializado para decidir si ejecutar RAG
   */
  private static async executeRAGAnalysis(
    prompt: string,
    history: any[],
    centerId: string,
    firestore: Firestore,
    chatId: string
  ): Promise<{ executed: boolean; data?: string; result?: any }> {
    // Obtener solo la herramienta RAG
    const ragTool = this.getInternalTools().find(
      (tool) => tool.name === "buscar_informacion_operacional"
    );
    if (!ragTool) {
      return { executed: false };
    }

    // Crear contenido nativo para análisis RAG (sin recursión)
    const ragContents: any[] = [];

    // Agregar historial básico
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

    const ragResponse = await llmProvider.generateContent({
      contents: ragContents,
      trackTokens: true,
      chatId: chatId + "_rag",
      tools: [{ functionDeclarations: [ragTool] }],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.AUTO,
        },
      },
      config: {
        temperature: 0.2, // Más determinístico para decisiones
        maxOutputTokens: 1500,
        topK: 20,
        topP: 0.8,
        systemInstruction: `Eres un revisor que analiza si para responder a según el mensaje más reciente del usuario necesitas buscar información técnica específica sobre procesos, procedimientos, documentación o datos que no están en tu conocimiento base.

IMPORTANTE: Solo usa la herramienta de búsqueda si:
- El usuario pregunta sobre procesos específicos de la empresa
- Necesitas documentación técnica actual
- Requieres datos operacionales específicos
- La pregunta es sobre procedimientos internos

NO uses la herramienta si:
- Es conversación casual
- Preguntas generales que puedes responder

Si decides buscar, hazlo. Si no, responde normalmente.`,
      },
    });

    // Si ejecutó la herramienta RAG
    if (ragResponse.functionCalls && ragResponse.functionCalls.length > 0) {
      const ragFunctionCall = ragResponse.functionCalls[0];
      const ragResult = await this.executeInternalTool(
        firestore,
        chatId,
        centerId,
        ragFunctionCall.name,
        ragFunctionCall.args || ragFunctionCall.parameters || {}
      );

      return {
        executed: true,
        data: ragResult?.response
          ? JSON.stringify(ragResult.response)
          : "Sin datos RAG",
        result: ragResult,
      };
    }

    return { executed: false };
  }

  /**
   * Convierte historial a formato nativo del SDK con contexto de herramientas y RAG
   */
  private static formatHistoryForNativeSDK(
    history: any[],
    currentPrompt: string,
    ragResults?: { executed: boolean; data?: string; result?: any }
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

    // 3. Prompt actual del usuario (limpio, sin modificaciones)
    contents.push({
      role: "user",
      parts: [{ text: currentPrompt }],
    });

    return contents;
  }

  /**
   * KISS: Intérprete de intención simple - RETORNA texto explicativo
   */
  private static async executeIntentionInterpreter(
    prompt: string,
    tools: any[],
    history: any[],
    centerId: string,
    firestore: Firestore
  ): Promise<string> {
    const intentionPrompt = `
    Eres un interprete en una conversacion (chat) entre un asistente y un usuario Tu trabajo es analizar el mensaje del usuario para entender su relación con el historial
    y las herramientas disponibles segun su descripción para determinar la intención mas probable y definir con criterio
    lo que el usuario quiere lograr. y si una herramienta es necesaria o no.
    tu respuesta debe ser siempre en el mismo formato
    por favor analiza profundamente Si algun parametro requerido para una herramienta falta, sugiere pedir el dato.
    En caso del que no tengas claro la intencion del usuario, mira si el mensaje, revisa similitudes entre palabras claves entre las herramientas y lo que pide el usuario. 

    breve explicacion en una lista aparte una lista tipo
    - Herramienta A
    - Herramienta B
    etc de las que consideres que son necesarias para resolver la consulta del usuario.
    y listo. Eres un experto en esto tu volmen de fallos es casi 0.
    <HISTORIAL_RECIENTE_DE_CONVERSACION>
      ${MessageManager.formatHistoryForLLM(history.slice(-5))}
    </HISTORIAL_RECIENTE_DE_CONVERSACION>
    <MENSAJE_DEL_USUARIO>
    "${prompt}"
    </MENSAJE_DEL_USUARIO>
    <HERRAMIENTAS> 
      ${tools.map((t) => `- ${t.name}: ${t.description}`).join("\n")}
    </HERRAMIENTAS>

 
    hora y fecha actual
    ${new Date().toISOString()}
    

`;
    const llmProvider = GoogleGenAIManager.getProvider(centerId, firestore);
    const response = await llmProvider.generateContent({
      prompt: intentionPrompt,
      trackTokens: false,
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.NONE,
        },
      },
      config: {
        temperature: 0.3,
        maxOutputTokens: 1000,
        topK: 20,
        topP: 0.8,
      },
    });
    // console.log("RESPONSE INTENTION INTERPRETER:", response);
    return response.text;
  }

  /**
   * Prepara herramientas MCP de forma asíncrona
   */
  private static async prepareMCPTools(centerId: string): Promise<{ 
    tools: any[], 
    connection: MCPConnection | null 
  }> {
    try {
      // Intentar conectar a MCP del centro
      const mcpConnection = await this.mcpConnectionManager.connectToCenter(centerId);

      if (mcpConnection.isConnected) {
        // Obtener herramientas disponibles del centro
        const mcpTools = await this.mcpConnectionManager.getAvailableTools(centerId);
        const validTools = this.mcpAdapter.filterValidMCPTools(mcpTools);

        if (validTools.length > 0) {
          // Convertir herramientas MCP a formato Google GenAI
          const mcpGenAITools = this.mcpAdapter.convertMCPToolsToGenAI(validTools);
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
