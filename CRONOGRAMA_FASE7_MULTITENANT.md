# Cronograma Fase 7: Multi-tenant con MCP

## Estado Actual: EN PROGRESO

**Iniciado**: 2025-01-15  
**Estimación**: 3 semanas  
**Progreso**: 67% completado

## Componentes Completados ✅

### 1. Sistema de Routing Multi-tenant ✅
**Completado**: 2025-01-15  
**Archivos creados**:
- `src/core/multitenant/interfaces.ts` - Interfaces para multi-tenant
- `src/core/multitenant/CenterConfig.ts` - Configuración de centros (Bogotá, Medellín, Cúcuta)
- `src/core/multitenant/CenterRouter.ts` - Sistema de identificación y routing
- `src/core/multitenant/MultiTenantManager.ts` - Manager principal multi-tenant

**Características implementadas**:
- Configuración de 3 centros con GCP projects separados
- Múltiples estrategias de identificación (header, JWT, geolocalización, query)
- Health monitoring por centro
- Billing limits por centro
- Fallback strategy

### 2. Conexiones Dinámicas a Firestore ✅
**Completado**: 2025-01-15  
**Archivos modificados**:
- `src/core/chat/ChatManager.ts` - Acepta Firestore como parámetro
- `src/core/chat/MessageManager.ts` - Acepta Firestore como parámetro
- `src/core/rag/VectorSearcher.ts` - Acepta Firestore como parámetro
- `src/core/rag/RAGPipeline.ts` - Pasa Firestore a VectorSearcher
- `src/core/conversation/ConversationOrchestrator.ts` - Coordina con Firestore dinámico
- `src/services/chatService.ts` - Usa Firestore temporal

**Beneficios logrados**:
- Arquitectura preparada para multi-tenant
- Billing separado por centro (cada centro = GCP project)
- Flexibilidad para diferentes configuraciones por centro
- Funcionalidad mantenida 100%

## Próxima Implementación: Gestión de Conexiones MCP 🔄

### 3. Implementación de Conexiones MCP por Centro
**Iniciando**: 2025-01-15  
**Estimación**: 1 semana  
**Prioridad**: ALTA

#### Objetivos Específicos:

**A. Adaptador MCP ↔ Google GenAI Function Declarations**
- Traducir herramientas MCP a formato Google GenAI
- Traducir resultados Google GenAI a formato MCP
- Mapeo bidireccional de tipos y schemas

**B. Sistema de Descubrimiento de Herramientas**
- Conexión dinámica a servidores MCP por centro
- Cache de herramientas por sesión
- Refresh automático de herramientas

**C. Fallback y Resilencia**
- Fallback cuando MCP server no disponible
- Timeout y retry logic
- Logging detallado de errores MCP

#### Archivos a Crear:

```
src/core/mcp/
├── MCPAdapter.ts           # Adaptador MCP ↔ Google GenAI
├── MCPConnectionManager.ts # Gestión de conexiones por centro
├── MCPToolCache.ts         # Cache de herramientas
├── MCPToolRegistry.ts      # Registro de herramientas disponibles
└── MCPFallbackHandler.ts   # Manejo de fallbacks
```

#### Especificaciones Técnicas:

**1. MCPAdapter.ts**
```typescript
interface MCPToGenAIAdapter {
  // Convierte herramientas MCP → Google GenAI FunctionDeclarations
  convertMCPToolsToGenAI(mcpTools: MCPTool[]): FunctionDeclaration[];
  
  // Convierte resultados Google GenAI → MCP format
  convertGenAIResultsToMCP(genAIResults: any): MCPToolResult[];
  
  // Maneja configuración automática de function calling
  setupAutomaticFunctionCalling(tools: MCPTool[]): AutomaticFunctionCallingConfig;
}
```

**2. MCPConnectionManager.ts**
```typescript
class MCPConnectionManager {
  // Establece conexión con servidor MCP del centro
  async connectToCenter(centerId: string): Promise<MCPConnection>;
  
  // Obtiene herramientas disponibles del centro
  async getAvailableTools(centerId: string): Promise<MCPTool[]>;
  
  // Ejecuta herramienta en servidor MCP
  async executeToolCall(centerId: string, toolCall: MCPToolCall): Promise<MCPToolResult>;
  
  // Health check de conexión MCP
  async checkMCPHealth(centerId: string): Promise<boolean>;
}
```

**3. MCPToolCache.ts**
```typescript
class MCPToolCache {
  // Cache con TTL por centro
  private cache = new Map<string, { tools: MCPTool[], expiry: Date }>();
  
  // Obtiene herramientas cacheadas
  getCachedTools(centerId: string): MCPTool[] | null;
  
  // Actualiza cache de herramientas
  updateCache(centerId: string, tools: MCPTool[]): void;
  
  // Limpia cache por centro
  clearCache(centerId: string): void;
}
```

#### Integración con Sistema Existente:

**1. Actualizar ConversationOrchestrator**
- Integrar MCPConnectionManager
- Configurar Google GenAI con herramientas MCP
- Manejar function calling automático

**2. Actualizar MultiTenantManager**
- Incluir conexiones MCP en routing
- Health check de MCP servers
- Inicialización de conexiones MCP

**3. Actualizar chatController**
- Integrar MultiTenantManager
- Routing automático por centro
- Manejo de context centerContext

#### Estrategia de Implementación:

**Semana 1**:
- Día 1-2: MCPAdapter + MCPConnectionManager (mock)
- Día 3-4: MCPToolCache + MCPToolRegistry
- Día 5: Integración con ConversationOrchestrator
- Día 6-7: Testing y fallback logic

**Criterios de Éxito**:
- [ ] Conexión exitosa a servidor MCP mock
- [ ] Herramientas MCP traducidas a Google GenAI
- [ ] Function calling automático funcionando
- [ ] Cache de herramientas operativo
- [ ] Fallback sin MCP funcionando
- [ ] Tests end-to-end por centro

## Fases Restantes Después de MCP

### 4. Integración Completa Multi-tenant (Pendiente)
**Estimación**: 1 semana  
- Integrar MultiTenantManager en chatController
- Routing automático por centro
- Testing completo multi-tenant

### 5. Optimización y Monitoreo (Pendiente)
**Estimación**: 1 semana  
- Métricas por centro
- Logging distribuido
- Health dashboard
- Alertas automáticas

## Acuerdos Técnicos Establecidos

### Billing Separado ✅
- Cada centro = GCP project independiente
- Firestore separado por centro
- Billing y limits independientes

### Estrategias de Identificación ✅
- Header `x-center-id` (explícito)
- JWT claims (futuro)
- Geolocalización IP (futuro)
- Query parameter `?center=` (desarrollo)
- Fallback: centro por defecto (Bogotá)

### Arquitectura de Datos ✅
- Cada centro mantiene su Firestore
- Orchestrator centralizado sin datos
- Conexiones dinámicas por request

### Diseño MCP 🔄
- Un servidor MCP por centro
- Herramientas específicas por centro
- Fallback cuando MCP no disponible
- Cache de herramientas por sesión

---

## Estado Actual - 2025-01-15

### **Implementación MCP COMPLETADA ✅**
- MCPAdapter: Traducción herramientas MCP ↔ Google GenAI Function Declarations
- MCPConnectionManager: Conexión real a servidor `https://cd-cucuta-service-280914661682.us-central1.run.app/api/mcp`
- MCPToolCache: Cache inteligente con TTL 5 minutos
- MCPFallbackHandler: Manejo de fallbacks cuando MCP no disponible

### **Problema Crítico Detectado 🔴**
**Function Calling no se activa** - Google GenAI recibe herramientas MCP correctamente pero no las ejecuta.

**Diagnóstico:**
- ✅ MCP conecta exitosamente (4 herramientas: `create_novedad`, `list_novedades`, `get_compensacion_variable`, `get_rendimientos`)
- ✅ Herramientas se convierten correctamente a formato Google GenAI
- ✅ Configuración se envía al LLM con `FunctionCallingConfigMode.ANY`
- ❌ **Google GenAI responde con texto en lugar de function calls**

**Causa Identificada:**
Al revisar los tipos en `node_modules/@google/genai`, se descubrió que `tools` y `toolConfig` deben ir **dentro de `config`**, no al nivel raíz de `generateConfig`.

**Corrección Aplicada:**
```typescript
// ANTES (incorrecto):
generateConfig.tools = request.tools;
generateConfig.toolConfig = request.toolConfig;

// AHORA (correcto según tipos):
config: {
  ...otherConfig,
  tools: request.tools,
  toolConfig: request.toolConfig
}
```

### **Próxima Acción Inmediata**
**Probar la estructura corregida** para verificar si Google GenAI ahora activa function calling correctamente y ejecuta las herramientas MCP del servidor de Cúcuta.

**Fecha**: 2025-01-15  
**Prioridad**: CRÍTICA  
**Estado**: READY TO TEST