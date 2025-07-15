import { MCPTool, MCPToolCall, MCPToolResult } from './interfaces';

export class MCPFallbackHandler {
  private fallbackTools: Map<string, MCPTool> = new Map();
  private fallbackResponses: Map<string, any> = new Map();

  constructor() {
    this.initializeFallbackTools();
    this.initializeFallbackResponses();
  }

  /**
   * Verifica si una herramienta tiene fallback disponible
   */
  hasFallback(toolName: string): boolean {
    return this.fallbackTools.has(toolName);
  }

  /**
   * Obtiene herramientas de fallback cuando MCP no está disponible
   */
  getFallbackTools(): MCPTool[] {
    return Array.from(this.fallbackTools.values());
  }

  /**
   * Ejecuta una herramienta en modo fallback
   */
  async executeFallbackTool(toolCall: MCPToolCall): Promise<MCPToolResult> {
    console.log(`MCPFallbackHandler: Ejecutando fallback para ${toolCall.toolName}`);
    
    if (!this.hasFallback(toolCall.toolName)) {
      return {
        toolName: toolCall.toolName,
        callId: toolCall.callId,
        success: false,
        error: `No hay fallback disponible para la herramienta ${toolCall.toolName}`
      };
    }

    try {
      const result = await this.executeSpecificFallback(toolCall);
      
      console.log(`MCPFallbackHandler: Fallback exitoso para ${toolCall.toolName}`);
      return result;
    } catch (error) {
      console.error(`MCPFallbackHandler: Error en fallback para ${toolCall.toolName}:`, error);
      
      return {
        toolName: toolCall.toolName,
        callId: toolCall.callId,
        success: false,
        error: error instanceof Error ? error.message : 'Error en fallback'
      };
    }
  }

  /**
   * Genera respuesta de fallback cuando MCP no está disponible
   */
  generateFallbackResponse(centerId: string, originalPrompt: string): string {
    const centerName = this.getCenterName(centerId);
    
    return `Lo siento, actualmente no tengo acceso a las herramientas específicas del centro de ${centerName}. ` +
           `Puedo ayudarte con información general sobre procesos logísticos, pero para consultas específicas ` +
           `sobre inventario, programación de entregas o estados de pedidos, te recomiendo contactar directamente ` +
           `al centro de ${centerName} o intentar de nuevo en unos minutos.`;
  }

  /**
   * Verifica si debe usar fallback basado en el contexto
   */
  shouldUseFallback(centerId: string, isHealthy: boolean, lastFailureTime?: Date): boolean {
    if (isHealthy) {
      return false;
    }

    // Si no hay información de último fallo, usar fallback
    if (!lastFailureTime) {
      return true;
    }

    // Usar fallback si el último fallo fue hace menos de 5 minutos
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    return lastFailureTime.getTime() > fiveMinutesAgo;
  }

  /**
   * Obtiene herramientas combinadas (MCP + fallback)
   */
  combineToolsWithFallback(mcpTools: MCPTool[]): MCPTool[] {
    const combinedTools = [...mcpTools];
    const mcpToolNames = new Set(mcpTools.map(tool => tool.name));
    
    // Agregar herramientas de fallback que no estén en MCP
    this.fallbackTools.forEach((fallbackTool, toolName) => {
      if (!mcpToolNames.has(toolName)) {
        combinedTools.push(fallbackTool);
      }
    });
    
    return combinedTools;
  }

  /**
   * Inicializa herramientas de fallback básicas
   */
  private initializeFallbackTools(): void {
    const fallbackTools: MCPTool[] = [
      {
        name: 'general_info',
        description: 'Proporciona información general sobre procesos logísticos',
        parameters: {
          type: 'object',
          properties: {
            topic: { 
              type: 'string', 
              description: 'Tema sobre el que se necesita información' 
            }
          },
          required: ['topic']
        }
      },
      {
        name: 'contact_center',
        description: 'Proporciona información de contacto del centro específico',
        parameters: {
          type: 'object',
          properties: {
            center_id: { 
              type: 'string', 
              description: 'ID del centro de distribución' 
            }
          },
          required: ['center_id']
        }
      }
    ];

    fallbackTools.forEach(tool => {
      this.fallbackTools.set(tool.name, tool);
    });
  }

  /**
   * Inicializa respuestas de fallback predefinidas
   */
  private initializeFallbackResponses(): void {
    this.fallbackResponses.set('general_info', {
      delivery_process: 'El proceso de entrega incluye verificación de pedidos, carga del vehículo, seguimiento de ruta y confirmación de entrega.',
      inventory_management: 'El manejo de inventario se basa en sistemas de control de stock, rotación FIFO y reportes de disponibilidad.',
      route_optimization: 'La optimización de rutas considera factores como distancia, tráfico, capacidad del vehículo y ventanas de tiempo de clientes.'
    });

    this.fallbackResponses.set('contact_center', {
      bogota: {
        phone: '+57 1 234-5678',
        address: 'Calle 123 #45-67, Bogotá',
        hours: 'Lunes a Viernes: 6:00 AM - 6:00 PM'
      },
      medellin: {
        phone: '+57 4 234-5678',
        address: 'Carrera 45 #12-34, Medellín',
        hours: 'Lunes a Viernes: 6:00 AM - 6:00 PM'
      },
      cucuta: {
        phone: '+57 7 234-5678',
        address: 'Avenida 12 #34-56, Cúcuta',
        hours: 'Lunes a Viernes: 6:00 AM - 6:00 PM'
      }
    });
  }

  /**
   * Ejecuta fallback específico según la herramienta
   */
  private async executeSpecificFallback(toolCall: MCPToolCall): Promise<MCPToolResult> {
    const { toolName, parameters, callId } = toolCall;
    
    switch (toolName) {
      case 'general_info':
        return this.executeFallbackGeneralInfo(parameters, callId);
      
      case 'contact_center':
        return this.executeFallbackContactCenter(parameters, callId);
      
      default:
        return {
          toolName,
          callId,
          success: false,
          error: `Fallback no implementado para ${toolName}`
        };
    }
  }

  /**
   * Ejecuta fallback para información general
   */
  private async executeFallbackGeneralInfo(parameters: any, callId: string): Promise<MCPToolResult> {
    const topic = parameters.topic?.toLowerCase() || '';
    const responses = this.fallbackResponses.get('general_info');
    
    let response = 'Información general no disponible para este tema.';
    
    if (topic.includes('entrega') || topic.includes('delivery')) {
      response = responses.delivery_process;
    } else if (topic.includes('inventario') || topic.includes('inventory')) {
      response = responses.inventory_management;
    } else if (topic.includes('ruta') || topic.includes('route')) {
      response = responses.route_optimization;
    }
    
    return {
      toolName: 'general_info',
      callId,
      success: true,
      data: { topic, response }
    };
  }

  /**
   * Ejecuta fallback para contacto de centro
   */
  private async executeFallbackContactCenter(parameters: any, callId: string): Promise<MCPToolResult> {
    const centerId = parameters.center_id?.toLowerCase() || '';
    const contacts = this.fallbackResponses.get('contact_center');
    
    const contact = contacts[centerId];
    
    if (!contact) {
      return {
        toolName: 'contact_center',
        callId,
        success: false,
        error: `Información de contacto no disponible para centro ${centerId}`
      };
    }
    
    return {
      toolName: 'contact_center',
      callId,
      success: true,
      data: { center_id: centerId, contact }
    };
  }

  /**
   * Obtiene nombre legible del centro
   */
  private getCenterName(centerId: string): string {
    const centerNames = {
      'bogota': 'Bogotá',
      'medellin': 'Medellín',
      'cucuta': 'Cúcuta'
    };
    
    return centerNames[centerId as keyof typeof centerNames] || centerId;
  }
}