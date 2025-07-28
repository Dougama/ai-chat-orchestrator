/**
 * Intérprete de intenciones que usa LLM para enriquecer prompts del usuario
 * cuando detecta necesidad de búsqueda operacional
 */

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
   * @returns Prompt enriquecido o original
   */
  static async enhanceUserPrompt(
    originalPrompt: string, 
    centerId: string,
    availableMCPTools: MCPTool[] = [],
    firestore?: Firestore
  ): Promise<string> {
    try {
      console.log(`🧠 IntentionInterpreter: Analizando intención para "${originalPrompt}"`);
      
      // Usar LLM para detectar y enriquecer
      const needsSearch = await this.detectAndEnhanceWithLLM(originalPrompt, centerId, availableMCPTools, firestore);
      
      if (needsSearch.requiresSearch) {
        console.log(`✅ IntentionInterpreter: Enriqueciendo prompt - ${needsSearch.reasoning}`);
        
        return `INSTRUCCIÓN OPERACIONAL: ${needsSearch.enhancedInstruction}

CONSULTA ORIGINAL DEL USUARIO: ${originalPrompt}`;
      }
      
      console.log(`💬 IntentionInterpreter: Prompt casual - no requiere enriquecimiento`);
      return originalPrompt;
      
    } catch (error) {
      console.error("❌ IntentionInterpreter: Error en análisis, usando prompt original:", error);
      return originalPrompt;
    }
  }
  
  /**
   * Usa LLM para detectar intención y generar instrucción enriquecida
   */
  private static async detectAndEnhanceWithLLM(
    prompt: string, 
    centerId: string,
    availableMCPTools: MCPTool[],
    firestore?: Firestore
  ): Promise<{
    requiresSearch: boolean;
    enhancedInstruction?: string;
    reasoning: string;
  }> {
    // Construir lista de herramientas disponibles
    const mcpToolsList = availableMCPTools.length > 0 
      ? availableMCPTools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')
      : 'No hay herramientas MCP disponibles';

    const analysisPrompt = `
Analiza esta consulta de usuario y determina qué tipo de herramienta necesita ejecutar.

CONSULTA: "${prompt}"

HERRAMIENTAS MCP DISPONIBLES:
${mcpToolsList}

HERRAMIENTA INTERNA DISPONIBLE:
- buscar_informacion_operacional: Busca información en manuales, protocolos, políticas, procedimientos y documentación operacional de la empresa

CRITERIOS DE CLASIFICACIÓN:

1. HERRAMIENTA MCP ESPECÍFICA (consultas de datos dinámicos):
   - Rendimientos de conductores, compensaciones, novedades
   - Consultas con cédulas, códigos de cliente, fechas específicas
   - Datos que cambian durante el día
   - Si identifica una herramienta MCP específica, genera instrucción para usarla

2. HERRAMIENTA INTERNA (información en documentos):
   - Procesos, procedimientos, normativas, políticas
   - "¿Cómo hacer algo?", "¿Qué requisitos necesito?"
   - Información técnica en manuales
   - Protocolos de seguridad, operacionales

3. NO REQUIERE HERRAMIENTAS:
   - Saludos, despedidas, cortesías
   - Conversación casual sobre el estado
   - Preguntas sobre el asistente mismo

IMPORTANTE - CONSULTAS REPETITIVAS:
- Si la misma consulta fue hecha antes, AÚN ASÍ debe ejecutar la herramienta
- Los datos operacionales cambian constantemente durante el día
- Es normal que los usuarios repitan consultas para datos actualizados

RESPONDE EN FORMATO JSON:
{
  "requiresSearch": true/false,
  "enhancedInstruction": "Si requiresSearch=true, genera una instrucción específica para buscar la información operacional necesaria",
  "reasoning": "Breve explicación de por qué sí o no requiere búsqueda"
}

EJEMPLOS:

EJEMPLO 1 - Herramienta MCP:
Consulta: "Consulta los rendimientos de la cédula 1140845095 para julio"
Respuesta: {
  "requiresSearch": true,
  "enhancedInstruction": "Ejecuta la herramienta MCP correspondiente para consultar rendimientos específicos de la cédula 1140845095 en el período de julio",
  "reasoning": "Consulta de datos dinámicos con cédula específica - requiere herramienta MCP"
}

EJEMPLO 2 - Herramienta interna:
Consulta: "¿Qué sabes sobre el alquiler de ocasionales?"
Respuesta: {
  "requiresSearch": true,
  "enhancedInstruction": "Busca información operacional sobre procesos y requisitos para alquiler de vehículos ocasionales usando la herramienta interna",
  "reasoning": "Pregunta sobre proceso operacional que requiere información en documentos"
}

EJEMPLO 3 - Sin herramientas:
Consulta: "Hola, ¿cómo estás?"
Respuesta: {
  "requiresSearch": false,
  "reasoning": "Saludo casual que no requiere herramientas"
}
`;

    const llmProvider = GoogleGenAIManager.getProvider(centerId, firestore);
    
    const response = await llmProvider.generateContent({
      prompt: analysisPrompt,
      trackTokens: false, // No trackear tokens para análisis interno
      config: {
        temperature: 0.1, // Baja temperatura para respuestas consistentes
        maxOutputTokens: 200
      }
    });
    
    try {
      // Extraer JSON de la respuesta
      const jsonMatch = response.text?.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No se encontró JSON válido en respuesta");
      }
      
      const analysis = JSON.parse(jsonMatch[0]);
      
      return {
        requiresSearch: analysis.requiresSearch || false,
        enhancedInstruction: analysis.enhancedInstruction || undefined,
        reasoning: analysis.reasoning || "Sin razón especificada"
      };
      
    } catch (parseError) {
      console.error("❌ IntentionInterpreter: Error parseando respuesta LLM:", parseError);
      
      // Fallback simple si falla el parsing
      const isObviousCasual = /^(hola|hi|buenos días|buenas tardes|gracias|ok|bien|mal)$/i.test(prompt.trim());
      
      return {
        requiresSearch: !isObviousCasual,
        enhancedInstruction: isObviousCasual ? undefined : `Busca información operacional relacionada con: ${prompt}`,
        reasoning: "Fallback por error de parsing"
      };
    }
  }
}