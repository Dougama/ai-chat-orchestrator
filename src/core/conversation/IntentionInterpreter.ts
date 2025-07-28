/**
 * Intérprete de intenciones que usa LLM para enriquecer prompts del usuario
 * cuando detecta necesidad de búsqueda operacional
 */
import { ChatMessage } from "../../types";
import { GoogleGenAIManager } from "../llm/GoogleGenAIManager";
import { Firestore } from "@google-cloud/firestore";

interface MCPTool {
  name: string;
  description: string;
  parameters?: any;
}

export class IntentionInterpreter {
  /**
   * Enriquece el prompt del usuario usando LLM para detectar intención de búsqueda
   * @param originalPrompt Prompt original del usuario
   * @param centerId ID del centro para LLM
   * @param availableMCPTools Lista de herramientas MCP disponibles
   * @param firestore Instancia de Firestore
   * @returns Objeto con prompt original, instrucción enriquecida y tipo de herramienta
   */
  static async enhanceUserPrompt(
    originalPrompt: string,
    centerId: string,
    availableTools: any[] = [], // Ahora recibe herramientas en formato GenAI
    history: ChatMessage[] = [],
    firestore?: Firestore
  ): Promise<{
    originalPrompt: string;
    enhancedInstruction?: string;
    toolType?: string;
  }> {
    try {
      // Detectar intención y determinar si requiere enriquecimiento
      const analysisResult = await this.detectAndEnhanceWithLLM(
        originalPrompt,
        centerId,
        availableTools,
        history,
        firestore
      );
      if (!analysisResult.requiresSearch) {
        console.log(
          `💬 IntentionInterpreter: Consulta directa - no requiere herramientas`
        );
        return { originalPrompt };
      }
      // Retornar objeto con toda la información
      console.log(
        `✅ IntentionInterpreter: Ejecutando ${analysisResult.toolType} - ${analysisResult.reasoning}`
      );

      return {
        originalPrompt,
        enhancedInstruction: analysisResult.enhancedInstruction,
        toolType: analysisResult.toolType,
      };
    } catch (error) {
      console.error(
        "❌ IntentionInterpreter: Error en análisis, usando prompt original:",
        error
      );
      return { originalPrompt };
    }
  }

  /**
   * Usa LLM para detectar intención y generar instrucción enriquecida
   */
  private static async detectAndEnhanceWithLLM(
    prompt: string,
    centerId: string,
    availableTools: any[],
    history: ChatMessage[],
    firestore?: Firestore
  ): Promise<{
    toolType: any;
    requiresSearch: boolean;
    enhancedInstruction?: string;
    reasoning: string;
  }> {
    // Construir lista de herramientas disponibles
    const recentContext =
      history
        ?.slice(-7)
        .map(
          (msg) =>
            `${msg.role === "user" ? "Usuario" : "Asistente"}: ${msg.content}`
        )
        .join("\n") || "Sin historial previo";

    const mcpTools = availableTools;

    const mcpToolsList =
      mcpTools.length > 0
        ? mcpTools
            .map((tool) => `- ${tool.name}: ${tool.description}`)
            .join("\n")
        : "No hay herramientas MCP disponibles";
    console.log(
      `🧠 IntentionInterpreter: Analizando intención para "${prompt} en detectAndEnhanceWithLLM"`,
      `Herramientas disponibles: ${availableTools
        .map((tool) => tool.name)
        .join(", ")}`
    );
    const analysisPrompt = `
Eres un ANALIZADOR DE INTENCIONES especializado en clasificar consultas de usuarios y determinar la herramienta más apropiada para responder.

## CONTEXTO CONVERSACIONAL RECIENTE
${recentContext}
## IMPORTANTE: ANÁLISIS CONTEXTUAL
- Si la consulta contiene referencias deícticas ("este", "eso", "y"), DEBES usar el contexto previo
- Si la consulta es ambigua sin contexto, indica que necesitas más información
- NO asumas herramientas basándote solo en palabras sueltas

## CONTEXTO
Tienes acceso a herramientas MCP dinámicas y una herramienta interna de búsqueda documental. Tu tarea es analizar cada consulta y decidir qué herramienta usar (o si no necesita ninguna).

## CONSULTA A ANALIZAR
"${prompt}"

## HERRAMIENTAS DISPONIBLES

### HERRAMIENTAS MCP (Datos Dinámicos)
${mcpToolsList}

### HERRAMIENTA INTERNA (Búsqueda Documental)
- **buscar_informacion_operacional**: Accede a manuales, protocolos, políticas, procedimientos y documentación operacional empresarial

## REGLAS DE CLASIFICACIÓN

### 1. USA HERRAMIENTA MCP cuando:
- La consulta requiere datos específicos en tiempo real
- Se mencionan identificadores concretos (cédulas, IDs, fechas)
- Se solicitan métricas, rendimientos o estadísticas actuales
- La consulta implica operaciones con datos dinámicos

### 2. USA HERRAMIENTA INTERNA cuando:
- Se pregunta "¿Cómo hacer...?" o "¿Qué requisitos...?"
- Se solicita información sobre procesos o procedimientos
- Se necesitan políticas, normativas o protocolos
- Se busca información técnica de manuales operacionales

### 3. NO USES HERRAMIENTAS cuando:
- Son saludos, despedidas o expresiones de cortesía
- Conversación casual sin solicitud de información
- Preguntas sobre el asistente o sus capacidades

## POLÍTICA DE CONSULTAS REPETIDAS
⚠️ IMPORTANTE: Siempre ejecuta la herramienta aunque la consulta sea repetida
- Los datos operacionales cambian constantemente
- Los usuarios frecuentemente necesitan información actualizada
- Cada consulta debe tratarse como nueva

## FORMATO DE RESPUESTA REQUERIDO
Responde ÚNICAMENTE con este JSON estructurado:

{
  "requiresSearch": true/false,
  "toolType": "MCP" | "INTERNAL" | "NONE",
  "enhancedInstruction": "Instrucción detallada y específica para ejecutar la herramienta correcta (solo si requiresSearch=true)",
  "reasoning": "Explicación concisa de la decisión tomada"
}

## EJEMPLOS DE REFERENCIA

### Ejemplo MCP - Consulta de datos específicos:
Input: "Consulta los rendimientos de la cédula 1140845095 para julio"
Output: {
  "requiresSearch": true,
  "toolType": "MCP",
  "enhancedInstruction": "Utiliza la herramienta MCP de consulta de rendimientos para obtener los datos específicos de la cédula 1140845095 correspondientes al período de julio del año actual",
  "reasoning": "Solicitud de datos dinámicos con identificador específico (cédula) y período temporal definido"
}

### Ejemplo INTERNAL - Información procedimental:
Input: "¿Qué sabes sobre el alquiler de ocasionales?"
Output: {
  "requiresSearch": true,
  "toolType": "INTERNAL",
  "enhancedInstruction": "Busca en la documentación operacional toda la información disponible sobre el proceso de alquiler de vehículos ocasionales, incluyendo requisitos, procedimientos y políticas aplicables",
  "reasoning": "Consulta sobre proceso operacional que requiere acceso a documentación interna de políticas y procedimientos"
}

### Ejemplo NONE - Interacción social:
Input: "Hola, ¿cómo estás?"
Output: {
  "requiresSearch": false,
  "toolType": "NONE",
  "enhancedInstruction": "",
  "reasoning": "Saludo social que no requiere búsqueda de información ni uso de herramientas"
}

## INSTRUCCIONES FINALES
1. Analiza cuidadosamente cada palabra clave en la consulta
2. Identifica el tipo de información solicitada
3. Selecciona la herramienta más apropiada según las reglas
4. Genera instrucciones específicas y accionables
5. Mantén el reasoning breve pero informativo

## CRITICO
- RESPONDER EN EL FORMATO JSON EXACTAMENTE COMO SE INDICA
- NO PUEDES OMITIR CARACTERES IMPORTANTE DEL FORMATO, COMO LAS LLAVES {} ' ,

Ahora analiza la consulta proporcionada y responde con el JSON estructurado.
`;

    const llmProvider = GoogleGenAIManager.getProvider(centerId, firestore);

    const response = await llmProvider.generateContent({
      prompt: analysisPrompt,
      config: {
        temperature: 0.3, // Más flexibilidad para generar respuestas
        maxOutputTokens: 500, // Más espacio para JSON y explicación
        topK: 40,
        topP: 0.8,
      },
    });

    try {
      // Extraer JSON de la respuesta
      const jsonMatch = response.text?.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No se encontró JSON válido en respuesta");
      }
      const analysis = JSON.parse(jsonMatch[0]);
      console.log(
        `🔍 Análisis de intención: ${JSON.stringify(analysis, null, 2)}`
      );
      return {
        requiresSearch: analysis.requiresSearch || false,
        toolType: analysis.toolType || "NONE",
        enhancedInstruction: analysis.enhancedInstruction || undefined,
        reasoning: analysis.reasoning || "Sin razón especificada",
      };
    } catch (parseError) {
      console.error(
        "❌ IntentionInterpreter: Error parseando respuesta LLM:",
        parseError
      );
      // Fallback simple si falla el parsing
      const isObviousCasual =
        /^(hola|hi|buenos días|buenas tardes|gracias|ok|bien|mal)$/i.test(
          prompt.trim()
        );
      return {
        requiresSearch: !isObviousCasual,
        toolType: isObviousCasual ? "NONE" : "INTERNAL",
        enhancedInstruction: isObviousCasual
          ? undefined
          : `Busca información operacional relacionada con: ${prompt}`,
        reasoning: "Fallback por error de parsing",
      };
    }
  }

  /**
   * Traduce y perfecciona el prompt del usuario actuando como intermediario inteligente
   * @param originalPrompt Prompt original del usuario
   * @param centerId ID del centro para LLM
   * @param availableTools Todas las herramientas disponibles (internas + MCP)
   * @param history Historial de conversación
   * @param firestore Instancia de Firestore
   * @returns Prompt perfeccionado listo para el LLM
   */
  static async translateAndPerfect(
    originalPrompt: string,
    centerId: string,
    availableTools: any[] = [],
    history: ChatMessage[] = [],
    firestore?: Firestore
  ): Promise<string> {
    try {
      console.log(
        `🔄 IntentionInterpreter: Traduciendo y perfeccionando "${originalPrompt}"`
      );

      const translatedPrompt = await this.performTranslation(
        originalPrompt,
        centerId,
        availableTools,
        history,
        firestore
      );

      console.log(
        `✅ IntentionInterpreter: Prompt perfeccionado generado`
      );

      return translatedPrompt;
    } catch (error) {
      console.error(
        `❌ IntentionInterpreter: Error en traducción, usando prompt original:`,
        error
      );
      // Fallback: devolver el prompt original con instrucciones básicas
      return `${originalPrompt}

## ROL Y CONTEXTO
Eres un asistente especializado en logística de reparto. Responde de manera clara y útil basándote en tu conocimiento y las herramientas disponibles.

Consulta del usuario: ${originalPrompt}`;
    }
  }

  /**
   * Realiza la traducción inteligente del prompt usando LLM
   */
  private static async performTranslation(
    originalPrompt: string,
    centerId: string,
    availableTools: any[],
    history: ChatMessage[],
    firestore?: Firestore
  ): Promise<string> {
    // Construir contexto conversacional
    const recentContext = history
      ?.slice(-5)
      .map(
        (msg) =>
          `${msg.role === "user" ? "Usuario" : "Asistente"}: ${msg.content}`
      )
      .join("\n") || "Sin historial previo";

    // Separar herramientas por tipo
    const internalTools = availableTools.filter(tool => tool.name === "buscar_informacion_operacional");
    const mcpTools = availableTools.filter(tool => tool.name !== "buscar_informacion_operacional");

    // Construir lista de herramientas disponibles
    const toolsList = [
      ...internalTools.map(tool => `- ${tool.name}: ${tool.description} (INTERNA)`),
      ...mcpTools.map(tool => `- ${tool.name}: ${tool.description} (MCP)`)
    ].join("\n") || "No hay herramientas disponibles";

    const translationPrompt = `
Eres un TRADUCTOR INTELIGENTE especializado en convertir consultas de usuarios en prompts perfectos para un LLM de logística.

## CONTEXTO CONVERSACIONAL RECIENTE
${recentContext}

## HERRAMIENTAS DISPONIBLES
${toolsList}

## TU MISIÓN
Toma la consulta del usuario y créa un prompt perfeccionado que:
1. **Interprete la intención real** considerando el contexto conversacional
2. **Identifique qué herramientas usar** y cómo usarlas
3. **Proporcione instrucciones claras** al LLM sobre cómo responder
4. **Maneje la continuidad conversacional** (referencias como "ahora", "también", etc.)

## CONSULTA DEL USUARIO A TRADUCIR
"${originalPrompt}"

## REGLAS DE TRADUCCIÓN

### PARA HERRAMIENTAS INTERNAS (Documentación):
- Si la consulta requiere información de procesos, políticas o procedimientos
- Instrúyele que use "buscar_informacion_operacional" 
- Pídele una respuesta COMPLETA y DETALLADA
- NO mencionar tarjetas

### PARA HERRAMIENTAS MCP (Datos dinámicos):
- Si la consulta requiere datos específicos, métricas o rendimientos
- Instrúyele qué herramienta MCP usar con qué parámetros
- Pídele un ANÁLISIS conciso 
- Que termine invitando a ver las tarjetas

### PARA CONSULTAS CONVERSACIONALES:
- Si son saludos, agradecimientos o conversación casual
- Instrúyele que responda naturalmente sin herramientas

## FORMATO DE RESPUESTA
Devuelve ÚNICAMENTE el prompt perfeccionado listo para ser usado por el LLM, sin explicaciones adicionales.

El prompt debe incluir:
- Rol y contexto del LLM
- La acción específica a realizar
- Instrucciones sobre herramientas si aplica
- Guía sobre el tipo de respuesta esperada
`;

    const llmProvider = GoogleGenAIManager.getProvider(centerId, firestore);
    const response = await llmProvider.generateContent({
      prompt: translationPrompt,
      trackTokens: false,
      config: {
        temperature: 0.4,
        maxOutputTokens: 800,
        topK: 30,
        topP: 0.9,
      },
    });

    return response.text || `${originalPrompt}

Eres un asistente de logística. Responde útilmente.`;
  }
}
