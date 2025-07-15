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
    // URL real del servidor MCP (temporal: todos apuntan a Cúcuta)
    // TODO: Definir URLs específicas por centro cuando se implemente caracterización de usuarios
    const MCP_SERVER_URL = 'https://cd-cucuta-service-280914661682.us-central1.run.app/api/mcp';
    
    const serverUrls = {
      'bogota': MCP_SERVER_URL,
      'medellin': MCP_SERVER_URL, 
      'cucuta': MCP_SERVER_URL
    };
    return serverUrls[centerId as keyof typeof serverUrls] || MCP_SERVER_URL;
  }

  private async establishConnection(connection: MCPConnection): Promise<boolean> {
    try {
      // Hacer ping al servidor MCP real
      const response = await fetch(`${connection.serverUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok) {
        console.log(`MCPConnectionManager: Conexión exitosa a ${connection.serverUrl}`);
        return true;
      } else {
        console.warn(`MCPConnectionManager: Servidor MCP respondió con status ${response.status}`);
        return false;
      }
    } catch (error) {
      console.error(`MCPConnectionManager: Error conectando a ${connection.serverUrl}:`, error);
      return false;
    }
  }

  private async fetchToolsFromMCPServer(centerId: string): Promise<MCPTool[]> {
    try {
      const serverUrl = this.getMCPServerUrl(centerId);
      
      // Llamar al endpoint de tools del servidor MCP
      const response = await fetch(`${serverUrl}/tools`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000)
      });
      
      if (!response.ok) {
        console.error(`MCPConnectionManager: Error obteniendo tools: ${response.status}`);
        return [];
      }
      
      const toolsData = await response.json() as any;
      
      // Procesar y normalizar las herramientas del servidor MCP
      const tools: MCPTool[] = toolsData.tools ? toolsData.tools.map((tool: any) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema || tool.parameters || {
          type: 'object',
          properties: {},
          required: []
        }
      })) : [];
      
      console.log(`MCPConnectionManager: Obtenidas ${tools.length} herramientas desde ${serverUrl}`);
      return tools;
      
    } catch (error) {
      console.error(`MCPConnectionManager: Error obteniendo herramientas para ${centerId}:`, error);
      return [];
    }
  }

  private async executeMCPTool(centerId: string, toolCall: MCPToolCall): Promise<MCPToolResult> {
    try {
      const serverUrl = this.getMCPServerUrl(centerId);
      
      // Crear request MCP válido
      const mcpRequest = {
        jsonrpc: '2.0',
        id: `tool_call_${Date.now()}`,
        method: 'tools/call',
        params: {
          name: toolCall.toolName,
          arguments: toolCall.parameters
        }
      };
      
      // Ejecutar la herramienta en el servidor MCP usando el endpoint correcto
      const response = await fetch(`${serverUrl}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mcpRequest),
        signal: AbortSignal.timeout(30000)
      });
      
      if (!response.ok) {
        return {
          toolName: toolCall.toolName,
          callId: toolCall.callId,
          success: false,
          error: `Error HTTP ${response.status}: ${response.statusText}`
        };
      }
      
      const result = await response.json() as any;
      
      // Procesar respuesta del servidor MCP
      if (result.error) {
        return {
          toolName: toolCall.toolName,
          callId: toolCall.callId,
          success: false,
          error: result.error.message || 'Error desconocido del servidor MCP'
        };
      }
      
      // Extraer datos del formato MCP
      let data: any = result.result;
      
      // Si el resultado tiene content (formato MCP), extraer el texto y parsearlo
      if (result.result && result.result.content && Array.isArray(result.result.content)) {
        const textContent = result.result.content.find((c: any) => c.type === 'text');
        if (textContent && textContent.text) {
          try {
            data = JSON.parse(textContent.text);
          } catch (parseError) {
            console.warn('MCPConnectionManager: No se pudo parsear JSON del contenido MCP:', parseError);
            data = { content: textContent.text };
          }
        }
      }
      
      return {
        toolName: toolCall.toolName,
        callId: toolCall.callId,
        success: true,
        data: data
      };
      
    } catch (error) {
      console.error(`MCPConnectionManager: Error ejecutando ${toolCall.toolName}:`, error);
      
      return {
        toolName: toolCall.toolName,
        callId: toolCall.callId,
        success: false,
        error: error instanceof Error ? error.message : 'Error de conexión MCP'
      };
    }
  }

  private async pingMCPServer(centerId: string): Promise<boolean> {
    try {
      const serverUrl = this.getMCPServerUrl(centerId);
      
      const response = await fetch(`${serverUrl}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000)
      });
      
      return response.ok;
    } catch (error) {
      console.error(`MCPConnectionManager: Ping failed for ${centerId}:`, error);
      return false;
    }
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