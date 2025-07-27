import { Firestore, FieldValue } from "@google-cloud/firestore";
import { ToolCall } from "../../../core/chat/interfaces";

interface ToolCallsCacheParams {
  toolName: string;
  callParams: any;
}

interface ToolCallsCacheResult {
  found: boolean;
  previousCall?: ToolCall;
  shouldUseCache: boolean;
}

/**
 * Implementación de la herramienta interna get_previous_tool_calls
 * Busca llamadas previas de herramientas en el historial del chat
 */
export class ToolCallsCache {
  
  /**
   * Ejecuta la búsqueda de llamadas previas de herramientas
   */
  static async execute(
    firestore: Firestore,
    chatId: string,
    params: ToolCallsCacheParams
  ): Promise<ToolCallsCacheResult> {
    try {
      console.log(`ToolCallsCache: Buscando llamadas previas de ${params.toolName} en chat ${chatId}`);
      
      // Obtener el documento del chat
      const chatDoc = await firestore.collection("chats").doc(chatId).get();
      
      if (!chatDoc.exists) {
        return {
          found: false,
          shouldUseCache: false
        };
      }
      
      const chatData = chatDoc.data();
      const toolCalls: ToolCall[] = chatData?.toolCalls || [];
      
      // Buscar llamada previa con mismos parámetros
      const previousCall = toolCalls.find(call => 
        call.toolName === params.toolName &&
        call.success &&
        this.deepEqual(call.callParams, params.callParams)
      );
      
      if (previousCall) {
        console.log(`ToolCallsCache: Encontrada llamada previa:`, {
          toolName: previousCall.toolName,
          timestamp: previousCall.timestamp
        });
        
        return {
          found: true,
          previousCall,
          shouldUseCache: true
        };
      }
      
      console.log(`ToolCallsCache: No se encontraron llamadas previas para ${params.toolName}`);
      return {
        found: false,
        shouldUseCache: false
      };
      
    } catch (error) {
      console.error(`ToolCallsCache: Error buscando llamadas previas:`, error);
      return {
        found: false,
        shouldUseCache: false
      };
    }
  }
  
  /**
   * Guarda una nueva llamada de herramienta en el historial del chat
   */
  static async saveToolCall(
    firestore: Firestore,
    chatId: string,
    toolCall: ToolCall
  ): Promise<void> {
    try {
      console.log(`ToolCallsCache: Guardando llamada de herramienta:`, {
        toolName: toolCall.toolName,
        chatId
      });
      
      const chatRef = firestore.collection("chats").doc(chatId);
      
      await chatRef.update({
        toolCalls: FieldValue.arrayUnion(toolCall)
      });
      
      console.log(`ToolCallsCache: Llamada guardada exitosamente`);
    } catch (error) {
      console.error(`ToolCallsCache: Error guardando llamada:`, error);
      // No lanzamos error para no interrumpir el flujo principal
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
}