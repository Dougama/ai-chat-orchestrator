import { FunctionDeclaration, AutomaticFunctionCallingConfig, Schema, Type } from '@google/genai';
import { MCPTool, MCPToolCall, MCPToolResult } from './interfaces';

export class MCPAdapter {
  /**
   * Convierte herramientas MCP al formato Google GenAI FunctionDeclaration
   */
  convertMCPToolsToGenAI(mcpTools: MCPTool[]): FunctionDeclaration[] {
    return mcpTools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: this.convertMCPParametersToGenAI(tool.parameters)
    }));
  }

  /**
   * Convierte parámetros MCP (JSON Schema) al formato Google GenAI Schema
   */
  private convertMCPParametersToGenAI(mcpParameters: any): Schema {
    if (!mcpParameters || typeof mcpParameters !== 'object') {
      return {
        type: Type.OBJECT,
        properties: {},
        required: []
      };
    }

    // Limpiar properties para que sean compatibles con Google GenAI
    const cleanProperties = this.cleanPropertiesForGenAI(mcpParameters.properties || {});

    return {
      type: Type.OBJECT,
      properties: cleanProperties,
      required: mcpParameters.required || []
      // Filtrar campos no soportados como examples, additionalProperties, etc.
    };
  }

  /**
   * Limpia las propiedades de un schema para que sean compatibles con Google GenAI
   * Filtra campos no soportados como enumDescriptions, examples, etc.
   */
  private cleanPropertiesForGenAI(properties: any): any {
    const cleanedProperties: any = {};

    for (const [key, value] of Object.entries(properties)) {
      if (typeof value === 'object' && value !== null) {
        const cleanedValue: any = {};
        const valueObj = value as any;
        
        // Campos permitidos por Google GenAI
        const allowedFields = [
          'type', 'description', 'enum', 'pattern', 'minimum', 'maximum',
          'minLength', 'maxLength', 'items', 'properties', 'required',
          'additionalProperties', 'default'
        ];

        // Copiar solo campos permitidos
        for (const field of allowedFields) {
          if (field in valueObj) {
            cleanedValue[field] = valueObj[field];
          }
        }

        // Si tiene enumDescriptions, incorporar en description
        if (valueObj.enumDescriptions && valueObj.enum) {
          const enumDescs = Object.entries(valueObj.enumDescriptions)
            .map(([key, desc]) => `• ${key}: ${desc}`)
            .join('\n');
          
          cleanedValue.description = cleanedValue.description 
            ? `${cleanedValue.description}\n\nOpciones disponibles:\n${enumDescs}`
            : `Opciones disponibles:\n${enumDescs}`;
        }

        cleanedProperties[key] = cleanedValue;
      } else {
        cleanedProperties[key] = value;
      }
    }

    return cleanedProperties;
  }

  /**
   * Convierte resultados Google GenAI function calls de vuelta al formato MCP
   */
  convertGenAIResultsToMCP(genAIResults: any[]): MCPToolCall[] {
    if (!genAIResults || !Array.isArray(genAIResults)) {
      return [];
    }

    return genAIResults.map(result => ({
      toolName: result.name,
      parameters: result.args || {},
      callId: result.id || this.generateCallId()
    }));
  }

  /**
   * Convierte resultados MCP de vuelta al formato esperado por Google GenAI
   */
  convertMCPResultsToGenAI(mcpResults: MCPToolResult[]): any[] {
    return mcpResults.map(result => ({
      name: result.toolName,
      response: result.success ? {
        ...result.data,
        mcpData: result.mcpData,
        dataType: result.dataType
      } : { error: result.error }
    }));
  }

  /**
   * Configura automatic function calling con herramientas MCP
   */
  setupAutomaticFunctionCalling(tools: MCPTool[]): AutomaticFunctionCallingConfig {
    return {
      disable: false,
      maximumRemoteCalls: 5, // Límite conservador para evitar loops
      ignoreCallHistory: false
    };
  }

  /**
   * Genera un ID único para llamadas de función
   */
  private generateCallId(): string {
    return `mcp_call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Valida que una herramienta MCP sea compatible con Google GenAI
   */
  validateMCPTool(tool: MCPTool): boolean {
    if (!tool.name || typeof tool.name !== 'string') {
      console.warn(`MCPAdapter: Tool sin nombre válido:`, tool);
      return false;
    }

    if (!tool.description || typeof tool.description !== 'string') {
      console.warn(`MCPAdapter: Tool '${tool.name}' sin descripción válida`);
      return false;
    }

    // Validar que el nombre no contenga caracteres especiales
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tool.name)) {
      console.warn(`MCPAdapter: Tool '${tool.name}' tiene nombre inválido para Google GenAI`);
      return false;
    }

    return true;
  }

  /**
   * Filtra herramientas MCP válidas para Google GenAI
   */
  filterValidMCPTools(tools: MCPTool[]): MCPTool[] {
    return tools.filter(tool => this.validateMCPTool(tool));
  }
}