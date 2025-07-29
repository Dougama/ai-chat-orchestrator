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
    console.log(`📝 Usuario: "${request.prompt}"`);

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

    // 2. Guardamos el nuevo mensaje del usuario
    await MessageManager.saveUserMessage(firestore, chatId, request.prompt);

    // 3. Recuperamos el historial reciente para el contexto (aumentado para mejor continuidad)
    const history = await MessageManager.getRecentHistory(
      firestore,
      chatId,
      20
    );
    const setupTime = Date.now() - setupStartTime;
    console.log(`⚙️ Setup (Chat/Message/History): ${setupTime}ms`);

    // 4. Preparamos TODAS las herramientas (internas + MCP) antes del análisis
    const toolsStartTime = Date.now();
    let tools: any[] = [];
    let mcpConnection: MCPConnection | null = null;

    // Agregar herramientas internas
    const internalTools = this.getInternalTools();
    tools.push(...internalTools);

    // Agregar herramientas MCP
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
            const mcpGenAITools =
              this.mcpAdapter.convertMCPToolsToGenAI(validTools);
            tools.push(...mcpGenAITools);
          }
        }
      } catch (error) {
        // Continuar sin herramientas MCP
      }
    }
    const toolsTime = Date.now() - toolsStartTime;
    console.log(
      `🔧 Preparación herramientas (${tools.length} total): ${toolsTime}ms`
    );

    // 5. ARQUITECTURA KISS: Doble intérprete paralelo SIMPLE

    const interpretersStartTime = Date.now();
    const [toolResult, intentionResult] = await Promise.allSettled([
      // 1. Intérprete de herramientas - EJECUTA herramientas y retorna datos
      this.executeToolInterpreter(
        request.prompt,
        tools,
        history,
        centerId || "bogota",
        firestore,
        chatId,
        mcpConnection
      ),

      // 2. Intérprete de intención - RETORNA texto explicativo
      this.executeIntentionInterpreter(
        request.prompt,
        tools, // Agregar herramientas disponibles
        history,
        centerId || "bogota",
        firestore
      ),
    ]);

    const interpretersTime = Date.now() - interpretersStartTime;
    console.log(`⚡ Intérpretes paralelos: ${interpretersTime}ms`);

    // Extraer resultados
    const toolData =
      toolResult.status === "fulfilled"
        ? toolResult.value
        : { data: "Sin datos", results: [] };
    const intentionText =
      intentionResult.status === "fulfilled"
        ? intentionResult.value
        : "Respuesta estándar";

    // 6. LLM Final - Combina datos + texto → respuesta final
    const finalPrompt = `
      ## HISTORIAL CONVERSACIONAL COMPLETO
      ${MessageManager.formatHistoryForLLM(history.slice(-15))}

      ## HERRAMIENTAS DISPONIBLES EN EL SISTEMA
      ${tools.map((t) => `- ${t.name}: ${t.description}`).join("\n")}

      ## DATOS OBTENIDOS DE HERRAMIENTAS EJECUTADAS
      ${toolData.data}

      ## ANÁLISIS DE INTENCIÓN DEL USUARIO
      ${intentionText}

      ## Fecha y hora actual
      ${new Date().toISOString()}

      BASADO EN LA INTENCION DEL USUARIO Y LOS DATOS OBTENIDOS, RESPONDE DE MANERA CONCISA Y DIRECTA.
      RESPUESTA, HACIENDO UN BREVE ANALISIS DE LA DATA DE LAS HERRAMIENTAS

      OJO: SI NO HAY INTENCION DEBES DECIRLE AL USUARIO QUE TE BRINDE UN POCO MAS DE CLARIDAD, PUDES BASARTE EN EL HISTORIAL PARA CONTRAPREGUNTAR
      `;

    const llmProvider = GoogleGenAIManager.getProvider(
      centerId || "default",
      firestore
    );

    // Usar modelo PREMIUM para respuesta final - SOLO TEXTO, NO HERRAMIENTAS
    const finalLLMStartTime = Date.now();
    const finalResponse = await llmProvider.generateContent({
      prompt: finalPrompt,
      trackTokens: true,
      chatId: chatId,
      config: {
        temperature: 0.7,
        maxOutputTokens: 3500,
        topK: 40,
        topP: 0.95,
      },
    });
    const finalLLMTime = Date.now() - finalLLMStartTime;
    console.log(`🎯 LLM Final: ${finalLLMTime}ms`);

    const assistantText =
      finalResponse.text || "No se pudo generar respuesta final.";

    // 7. Preparar datos MCP
    const mcpData: MCPToolResult[] = toolData.results
      .filter((result: any) => result.name !== "buscar_informacion_operacional") // Excluir RAG
      .map((result: any) => {
        const toolResult: MCPToolResult = {
          toolName: result.name,
          callId: `call_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`,
          success: !!result.response && !result.response.error,
          data: {
            params: result.response?.params || {},
            totalRegistros:
              result.response?.totalCount ||
              result.response?.totalRegistros ||
              0,
          },
        };

        // Solo agregar error si existe
        if (result.response?.error) {
          toolResult.error = result.response.error;
        }

        return toolResult;
      });

    // 10. Guardamos la respuesta del asistente con data si existe
    const saveStartTime = Date.now();
    const assistantDocId = await MessageManager.saveAssistantMessage(
      firestore,
      chatId,
      assistantText,
      mcpData.length > 0 ? mcpData : undefined
    );

    // 11. Actualizamos la fecha del chat
    await ChatManager.updateChatTimestamp(firestore, chatId);
    const saveTime = Date.now() - saveStartTime;
    console.log(`💾 Guardar respuesta: ${saveTime}ms`);

    // 12. Tiempo total de la función
    const totalTime = Date.now() - totalStartTime;
    console.log(
      `⏱️ TIEMPO TOTAL handleChatPrompt: ${totalTime}ms (${(
        totalTime / 1000
      ).toFixed(2)}s)`
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
      console.log(`ConversationOrchestrator: MCP tool result:`, {
        toolName: functionCall.name,
        success: toolResult.success,
        hasData: !!toolResult.data,
      });

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
    Si algun parametro requerido para una herramienta falta, no debes ejecutarla.
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

    ROTUNDAMENTE PROHIBIDO EJECTURAR HERRAMIENTAS SI PARAMETROS REQUERIDOS FALTAN. 
    SI EL USUARIO NO LOS PROPORCIONA, NO SE DEBE EJECUTAR LA HERRAMIENTA.
    
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
}
