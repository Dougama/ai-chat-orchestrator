# Plan de Refactoring de Arquitectura - AI Chat Orchestrator

## 1. Análisis del Estado Actual

### 1.1 Versión y Capacidades del SDK

**SDK Actual**: `@google/genai` versión `1.9.0`

**Métodos utilizados actualmente**:
```typescript
// En genaiService.ts
- ai.models.embedContent() // Para generar embeddings
- ai.models.generateContent() // Para generar respuestas

// Configuración actual
- Modelo generativo: gemini-2.0-flash-001
- Modelo embeddings: text-embedding-004
- Vertex AI: habilitado (vertexai: true)
```

**Capacidades del SDK identificadas**:
- ✅ Generación de texto
- ✅ Embeddings
- ✅ Function calling (CONFIRMADO)
- ✅ Streaming (CONFIRMADO)
- ✅ Multimodal (audio) (CONFIRMADO)
- ✅ Automatic Function Calling (con control de max calls)
- ✅ Live API para conversaciones en tiempo real

### 1.2 Flujo Actual del Sistema

```
1. Usuario envía mensaje → chatController
   ↓
2. handleChatPrompt (chatService.ts)
   ├─ Crear/obtener chat
   ├─ Guardar mensaje usuario
   ├─ Obtener historial (últimos 10)
   ├─ RAG Pipeline:
   │  ├─ searchSimilarEmbeddingsVector (vector search)
   │  └─ buildAugmentedPrompt (construir prompt)
   ├─ aiGenerateContent (generar respuesta)
   └─ Guardar respuesta
   ↓
3. Respuesta al usuario
```

**Tiempos actuales (aproximados)**:
- Vector search: ~200-300ms
- LLM generation: ~1-2s
- Total: ~2-3s por mensaje

### 1.3 Funcionalidades Actuales

**✅ Funcionando correctamente (NO TOCAR)**:
- Chat creation/management
- Message persistence
- History retrieval
- Vector search básico
- Prompt augmentation
- Response generation

**🔄 Candidatos para refactoring**:
- Separación de responsabilidades (todo en chatService)
- Configuración hardcodeada
- Sin abstracción para LLM provider
- Sin soporte para streaming
- Sin preparación para multimodal (voz)

**🆕 Nuevas features requeridas**:
- Soporte de voz (entrada/salida)
- Function calling
- Streaming responses
- Multi-tenant (MCP por centro)

## 2. Arquitectura Propuesta

### 2.1 Principios de Diseño

1. **No Breaking Changes**: Mantener funcionalidad actual
2. **Incremental Migration**: Cambios pequeños y validables
3. **Separation of Concerns**: Cada módulo con responsabilidad única
4. **Future Ready**: Preparado para voz y multi-tenant
5. **MCP First**: Diseñar para que cada centro tenga autonomía vía MCP
6. **Performance Oriented**: Optimizar para respuestas más rápidas

### 2.2 Estructura de Módulos

```
src/
├── core/
│   ├── chat/
│   │   ├── ChatManager.ts         # SOLO gestión de chats
│   │   ├── MessageManager.ts      # SOLO gestión de mensajes
│   │   └── interfaces.ts          # Interfaces compartidas
│   │
│   ├── conversation/
│   │   ├── ConversationOrchestrator.ts  # Orquestación principal
│   │   ├── HistoryManager.ts            # Gestión de historial
│   │   └── PromptBuilder.ts             # Construcción de prompts
│   │
│   ├── rag/
│   │   ├── RAGPipeline.ts         # Pipeline principal
│   │   ├── VectorSearcher.ts      # Búsqueda vectorial
│   │   └── ContextAugmenter.ts    # Augmentación de contexto
│   │
│   ├── llm/
│   │   ├── interfaces.ts          # ILLMProvider
│   │   ├── GoogleGenAIProvider.ts # Implementación actual
│   │   └── StreamingHandler.ts    # Para streaming futuro
│   │
│   ├── mcp/                       # NUEVO - Multi-tenant
│   │   ├── MCPAdapter.ts          # Adaptador MCP ↔ Google GenAI
│   │   ├── MCPConnectionManager.ts # Gestión de conexiones por centro
│   │   ├── MCPToolCache.ts        # Cache de herramientas
│   │   └── interfaces.ts          # Interfaces MCP
│   │
│   └── voice/                     # NUEVO - Preparación para voz
│       ├── VoiceProcessor.ts      # Procesamiento de voz
│       ├── AudioPipeline.ts       # Pipeline de audio
│       ├── interfaces.ts          # Interfaces de voz
│       └── providers/             # Diferentes providers de voz
```

### 2.3 Fases de Implementación

#### Fase 1: Análisis y Preparación (1 semana)
- [ ] Documentar SDK capabilities completas
- [ ] Crear tests de integración actuales (baseline)
- [ ] Medir performance actual
- [ ] Identificar dependencias exactas

#### Fase 2: Abstracción LLM (1 semana)
- [ ] Crear interface ILLMProvider
- [ ] Implementar GoogleGenAIProvider
- [ ] Migrar genaiService a nuevo provider
- [ ] Validar que todo sigue funcionando

#### Fase 3: Separación de Chat Logic (2 semanas)
- [ ] Extraer ChatManager
- [ ] Extraer MessageManager
- [ ] Crear ConversationOrchestrator
- [ ] Migrar chatService paso a paso

#### Fase 4: RAG Module (1 semana)
- [ ] Extraer RAGPipeline
- [ ] Separar VectorSearcher
- [ ] Implementar estrategias de búsqueda

#### Fase 5: Voice Preparation (2 semanas)
- [ ] Diseñar interfaces de voz
- [ ] Crear VoiceProcessor básico
- [ ] Integrar con ConversationOrchestrator
- [ ] Tests con audio samples

#### Fase 6: Performance & Streaming (2 semanas)
- [ ] Implementar streaming en LLMProvider
- [ ] Optimizar vector search
- [ ] Caching strategy
- [ ] Response chunking

#### Fase 7: Multi-tenant con MCP (3 semanas)
- [ ] Diseñar adaptador MCP ↔ Google GenAI
- [ ] Sistema de descubrimiento de servidores MCP por centro
- [ ] Gestión de conexiones MCP dinámicas
- [ ] Fallback cuando MCP no disponible
- [ ] Cache de herramientas por sesión
- [ ] Traducción bidireccional de formatos

## 3. Próximos Pasos Inmediatos

### 3.1 Investigación SDK (COMPLETADO) ✅

**Hallazgos principales**:

#### Function Calling
```typescript
// SDK soporta function calling nativo
interface FunctionDeclaration {
  name: string;
  description?: string;
  parameters?: Schema;
  behavior?: Behavior; // NON_BLOCKING, etc.
}

// Automatic Function Calling
interface AutomaticFunctionCallingConfig {
  disable?: boolean;
  maximumRemoteCalls?: number; // Default: 10
  ignoreCallHistory?: boolean;
}

// Uso en config
config: {
  tools: [{ functionDeclarations: [myFunction] }],
  toolConfig: {
    functionCallingConfig: {
      mode: FunctionCallingConfigMode.AUTO, // AUTO, ANY, NONE
      allowedFunctionNames: ['function1', 'function2']
    }
  }
}
```

#### Streaming
```typescript
// Métodos disponibles
chat.sendMessageStream() // Para chat streaming
models.generateContentStream() // Para generación streaming
apiClient.requestStream() // Para requests streaming
apiClient.processStreamResponse() // Para procesar responses
```

#### Audio/Multimodal
```typescript
// Interfaces para audio
interface AudioChunk {
  data?: string; // Base64 encoded
  mimeType?: string; // audio/mpeg, etc.
}

interface AudioTranscriptionConfig { }

// Live API para conversaciones en tiempo real
interface LiveConnectConfig {
  tools?: ToolListUnion;
  realtimeInputConfig?: RealtimeInputConfig;
}

// Soporte para audio en Parts
Part = {
  audioChunk?: AudioChunk;
  // ... otros tipos
}
```

### 3.2 Proof of Concepts Requeridos
1. **PoC Streaming**: Generar respuesta con streaming
2. **PoC Function Calling**: Llamar una función simple
3. **PoC Voice**: Procesar audio básico
4. **PoC Live API**: Conversación en tiempo real con voz

### 3.3 Arquitectura Multi-tenant con MCP

#### Intención General
Cada centro de distribución tendrá su propio servidor MCP que expondrá las herramientas y recursos específicos de ese centro. El sistema de chat actuará como orquestador, conectándose al servidor MCP correspondiente según el centro del usuario.

#### Arquitectura de Proyectos GCP

**Separación por Proyectos**:
- Cada centro de distribución será un proyecto GCP independiente
- Un proyecto GCP central único para el Chat Orchestrator
- Separación completa de recursos, datos y servicios por centro

**Lo que queremos en cada proyecto de CD**:
- Base de datos Firestore propia (historiales de chat, datos del negocio)
- Servidor MCP en Cloud Run (Node.js)
- Servicios de indexación propios
- Frontend propio (React o Pug engine)
- Embeddings y vectores locales al centro
- Integraciones específicas del centro

**Lo que queremos en el proyecto Orchestrator**:
- Un único servicio de chat centralizado
- Gestión de routing hacia los diferentes centros
- Identificación automática del centro según el usuario
- Conexiones dinámicas a Firestore de cada CD
- Adaptador universal MCP ↔ Google GenAI

#### Lo que queremos lograr:

**1. Autonomía por Centro de Distribución**
- Cada centro mantiene y evoluciona sus propias herramientas
- Los centros pueden agregar, modificar o eliminar funcionalidades sin afectar a otros
- Cada centro decide qué integraciones necesita (SAP, sistemas locales, APIs específicas)
- Datos completamente aislados por proyecto GCP

**2. Integración MCP ↔ Google GenAI SDK**
- El chat orchestrator debe poder descubrir herramientas disponibles desde cualquier servidor MCP
- Las herramientas MCP deben ser traducidas al formato que espera Google GenAI (FunctionDeclaration)
- Los resultados de Google GenAI deben ser traducidos de vuelta al formato MCP

**3. Gestión Dinámica de Conexiones**
- El sistema debe identificar el centro del usuario automáticamente
- Debe establecer conexión con el servidor MCP correcto
- Debe conectarse a la Firestore del proyecto GCP correspondiente
- Debe manejar casos donde el servidor MCP no esté disponible

**4. Experiencia de Usuario Consistente**
- El usuario no debe notar diferencias técnicas entre centros
- Las respuestas deben mantener el mismo tono y calidad
- Los tiempos de respuesta deben ser consistentes
- Un único punto de entrada (orchestrator) para todos los usuarios

#### Flujo Conceptual Deseado:

1. **Usuario envía mensaje** → Sistema identifica centro del usuario
2. **Sistema conecta con MCP del centro** → Obtiene herramientas disponibles
3. **Sistema adapta herramientas MCP** → Formato compatible con Google GenAI
4. **LLM procesa con herramientas del centro** → Decide si usar alguna
5. **Sistema ejecuta herramientas vía MCP** → El centro maneja la lógica
6. **Sistema recibe resultados** → Los formatea para el usuario

#### Beneficios Esperados:

- **Escalabilidad organizacional**: Nuevos centros = nuevo proyecto GCP + MCP server
- **Mantenimiento distribuido**: Cada centro mantiene sus herramientas
- **Evolución independiente**: Centros pueden innovar sin coordinación central
- **Reducción de complejidad central**: Chat orchestrator permanece simple
- **Aislamiento de datos**: Cumplimiento normativo y seguridad por diseño
- **Billing separado**: Cada centro ve y gestiona sus propios costos
- **Un único servicio de chat**: Sin duplicación de código ni mantenimiento N veces

## 4. Riesgos y Mitigaciones

### Riesgo 1: Breaking changes
**Mitigación**: 
- Tests exhaustivos antes de cada cambio
- Feature flags para rollback rápido
- Validación en staging primero

### Riesgo 2: Performance degradation
**Mitigación**:
- Benchmarks antes/después
- Profiling de cada módulo
- Optimización incremental

### Riesgo 3: SDK limitations
**Mitigación**:
- Investigación profunda primero
- Plan B para cada feature
- Abstracción que permita cambiar provider

## 5. Criterios de Éxito

1. **Funcionalidad**: 100% feature parity con actual
2. **Performance**: ≤ latencia actual (idealmente -20%)
3. **Mantenibilidad**: Código modular y testeable
4. **Extensibilidad**: Fácil agregar voz y multi-tenant

---

**Estado**: BORRADOR - Pendiente validación
**Última actualización**: 2025-01-13