import { IMCPConnectionManager, MCPConnection, MCPTool, MCPToolCall, MCPToolResult } from './interfaces';
import { MCPToolCache } from './MCPToolCache';

export class MCPConnectionManager implements IMCPConnectionManager {
  private connections: Map<string, MCPConnection> = new Map();
  private toolCache: MCPToolCache;
  private connectionTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.toolCache = new MCPToolCache();
  }

  /**
   * Establece conexión con servidor MCP del centro
   */
  async connectToCenter(centerId: string): Promise<MCPConnection> {
    console.log(`MCPConnectionManager: Conectando a centro ${centerId}`);
    
    try {
      // Verificar si ya existe conexión activa
      const existingConnection = this.connections.get(centerId);
      if (existingConnection && existingConnection.isConnected) {
        console.log(`MCPConnectionManager: Conexión existente para ${centerId}`);
        return existingConnection;
      }

      // Crear nueva conexión (mock por ahora)
      const connection: MCPConnection = {
        centerId,
        isConnected: false,
        lastPing: new Date(),
        serverUrl: this.getMCPServerUrl(centerId),
        serverStatus: 'disconnected'
      };

      // Simular conexión a servidor MCP
      const connected = await this.establishConnection(connection);
      
      if (connected) {
        connection.isConnected = true;
        connection.serverStatus = 'connected';
        connection.lastPing = new Date();
        
        this.connections.set(centerId, connection);
        this.startHealthCheck(centerId);
        
        console.log(`MCPConnectionManager: Conexión exitosa a ${centerId}`);
        return connection;
      } else {
        connection.serverStatus = 'error';
        throw new Error(`No se pudo conectar al servidor MCP del centro ${centerId}`);
      }
    } catch (error) {
      console.error(`MCPConnectionManager: Error conectando a ${centerId}:`, error);
      throw error;
    }
  }

  /**
   * Obtiene herramientas disponibles del centro
   */
  async getAvailableTools(centerId: string): Promise<MCPTool[]> {
    console.log(`MCPConnectionManager: Obteniendo herramientas para ${centerId}`);
    
    // Intentar obtener desde cache
    const cachedTools = this.toolCache.getCachedTools(centerId);
    if (cachedTools) {
      console.log(`MCPConnectionManager: Herramientas obtenidas desde cache para ${centerId}`);
      return cachedTools;
    }

    // Verificar conexión
    const connection = this.connections.get(centerId);
    if (!connection || !connection.isConnected) {
      await this.connectToCenter(centerId);
    }

    // Obtener herramientas del servidor MCP (mock)
    const tools = await this.fetchToolsFromMCPServer(centerId);
    
    // Cachear herramientas
    this.toolCache.cacheTools(centerId, tools);
    
    console.log(`MCPConnectionManager: ${tools.length} herramientas obtenidas para ${centerId}`);
    return tools;
  }

  /**
   * Ejecuta herramienta en servidor MCP
   */
  async executeToolCall(centerId: string, toolCall: MCPToolCall): Promise<MCPToolResult> {
    console.log(`MCPConnectionManager: Ejecutando ${toolCall.toolName} en ${centerId}`);
    
    try {
      // Verificar conexión
      const connection = this.connections.get(centerId);
      if (!connection || !connection.isConnected) {
        throw new Error(`No hay conexión MCP activa para centro ${centerId}`);
      }

      // Simular ejecución de herramienta
      const result = await this.executeMCPTool(centerId, toolCall);
      
      console.log(`MCPConnectionManager: Herramienta ${toolCall.toolName} ejecutada exitosamente`);
      return result;
    } catch (error) {
      console.error(`MCPConnectionManager: Error ejecutando ${toolCall.toolName}:`, error);
      
      return {
        toolName: toolCall.toolName,
        callId: toolCall.callId,
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido'
      };
    }
  }

  /**
   * Verifica salud de conexión MCP
   */
  async checkMCPHealth(centerId: string): Promise<boolean> {
    const connection = this.connections.get(centerId);
    if (!connection) {
      return false;
    }

    try {
      // Simular ping al servidor MCP
      const isHealthy = await this.pingMCPServer(centerId);
      
      if (isHealthy) {
        connection.lastPing = new Date();
        connection.serverStatus = 'connected';
      } else {
        connection.serverStatus = 'error';
        connection.isConnected = false;
      }
      
      return isHealthy;
    } catch (error) {
      console.error(`MCPConnectionManager: Health check failed for ${centerId}:`, error);
      connection.serverStatus = 'error';
      connection.isConnected = false;
      return false;
    }
  }

  /**
   * Desconecta del servidor MCP
   */
  async disconnect(centerId: string): Promise<void> {
    console.log(`MCPConnectionManager: Desconectando de ${centerId}`);
    
    const connection = this.connections.get(centerId);
    if (connection) {
      connection.isConnected = false;
      connection.serverStatus = 'disconnected';
      
      // Limpiar timeout de health check
      const timeout = this.connectionTimeouts.get(centerId);
      if (timeout) {
        clearInterval(timeout);
        this.connectionTimeouts.delete(centerId);
      }
      
      // Limpiar cache de herramientas
      this.toolCache.clearCache(centerId);
      
      this.connections.delete(centerId);
    }
  }

  /**
   * Obtiene todas las conexiones activas
   */
  getActiveConnections(): MCPConnection[] {
    return Array.from(this.connections.values()).filter(conn => conn.isConnected);
  }

  // Métodos privados para simulación

  private getMCPServerUrl(centerId: string): string {
    // URLs mock para servidores MCP por centro
    const serverUrls = {
      'bogota': 'ws://localhost:8081/mcp',
      'medellin': 'ws://localhost:8082/mcp',
      'cucuta': 'ws://localhost:8083/mcp'
    };
    return serverUrls[centerId as keyof typeof serverUrls] || 'ws://localhost:8080/mcp';
  }

  private async establishConnection(connection: MCPConnection): Promise<boolean> {
    // Simular tiempo de conexión
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Simular éxito/fallo de conexión (95% éxito)
    return Math.random() > 0.05;
  }

  private async fetchToolsFromMCPServer(centerId: string): Promise<MCPTool[]> {
    // Simular herramientas específicas por centro
    const centerTools = {
      'bogota': [
        {
          name: 'check_inventory',
          description: 'Verificar inventario en el centro de Bogotá',
          parameters: {
            type: 'object',
            properties: {
              product_id: { type: 'string', description: 'ID del producto' },
              quantity: { type: 'number', description: 'Cantidad a verificar' }
            },
            required: ['product_id']
          }
        },
        {
          name: 'schedule_delivery',
          description: 'Programar entrega desde centro Bogotá',
          parameters: {
            type: 'object',
            properties: {
              client_id: { type: 'string', description: 'ID del cliente' },
              delivery_date: { type: 'string', description: 'Fecha de entrega' }
            },
            required: ['client_id', 'delivery_date']
          }
        }
      ],
      'medellin': [
        {
          name: 'check_inventory',
          description: 'Verificar inventario en el centro de Medellín',
          parameters: {
            type: 'object',
            properties: {
              product_id: { type: 'string', description: 'ID del producto' },
              quantity: { type: 'number', description: 'Cantidad a verificar' }
            },
            required: ['product_id']
          }
        }
      ],
      'cucuta': [
        {
          name: 'check_inventory',
          description: 'Verificar inventario en el centro de Cúcuta',
          parameters: {
            type: 'object',
            properties: {
              product_id: { type: 'string', description: 'ID del producto' },
              quantity: { type: 'number', description: 'Cantidad a verificar' }
            },
            required: ['product_id']
          }
        }
      ]
    };

    // Simular tiempo de fetch
    await new Promise(resolve => setTimeout(resolve, 50));
    
    return centerTools[centerId as keyof typeof centerTools] || [];
  }

  private async executeMCPTool(centerId: string, toolCall: MCPToolCall): Promise<MCPToolResult> {
    // Simular ejecución de herramienta
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Simular resultados diferentes según la herramienta
    if (toolCall.toolName === 'check_inventory') {
      return {
        toolName: toolCall.toolName,
        callId: toolCall.callId,
        success: true,
        data: {
          product_id: toolCall.parameters.product_id,
          available_quantity: Math.floor(Math.random() * 1000),
          center: centerId
        }
      };
    }
    
    if (toolCall.toolName === 'schedule_delivery') {
      return {
        toolName: toolCall.toolName,
        callId: toolCall.callId,
        success: true,
        data: {
          delivery_id: `DEL_${Date.now()}`,
          client_id: toolCall.parameters.client_id,
          delivery_date: toolCall.parameters.delivery_date,
          center: centerId
        }
      };
    }

    // Resultado por defecto
    return {
      toolName: toolCall.toolName,
      callId: toolCall.callId,
      success: true,
      data: { message: `Herramienta ${toolCall.toolName} ejecutada en ${centerId}` }
    };
  }

  private async pingMCPServer(centerId: string): Promise<boolean> {
    // Simular ping
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Simular éxito de ping (98% éxito)
    return Math.random() > 0.02;
  }

  private startHealthCheck(centerId: string): void {
    // Limpiar timeout existente
    const existingTimeout = this.connectionTimeouts.get(centerId);
    if (existingTimeout) {
      clearInterval(existingTimeout);
    }

    // Configurar health check cada 30 segundos
    const timeout = setInterval(async () => {
      const healthy = await this.checkMCPHealth(centerId);
      if (!healthy) {
        console.warn(`MCPConnectionManager: Health check failed for ${centerId}`);
        // Intentar reconectar
        try {
          await this.connectToCenter(centerId);
        } catch (error) {
          console.error(`MCPConnectionManager: Reconexión fallida para ${centerId}:`, error);
        }
      }
    }, 30000);

    this.connectionTimeouts.set(centerId, timeout);
  }
}