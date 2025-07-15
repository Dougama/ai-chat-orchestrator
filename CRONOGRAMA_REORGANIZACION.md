# Cronograma de Reorganización - AI Chat Orchestrator

## Regla Principal
**NO TOCAR LÓGICA DE CÓDIGO**
- ❌ No cambiar nombres de variables
- ❌ No modificar lógica existente  
- ❌ No proponer mejoras de código
- ❌ No refactoring interno
- ✅ Solo mover archivos y reorganizar estructura
- ✅ Mantener 100% compatibilidad funcional

## Objetivo
Reorganizar el código según la arquitectura propuesta en `PLAN_REFACTORING_ARQUITECTURA.md` sin alterar el comportamiento actual del sistema.

## Estructura Objetivo

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
│
├── api/                           # Mantener estructura actual
│   ├── controllers/
│   └── routes/
│
├── config/                        # Mantener actual
└── types/                         # Mantener actual
```

## Cronograma de Actividades

### Día 1: Preparación y Análisis ✅ COMPLETADO
**Duración**: 2-3 horas

#### Actividades:
1. **Backup del código actual** ✅
   - Crear branch `backup-before-reorganization`
   - Commit estado actual

2. **Análisis de dependencias**
   - Mapear todas las importaciones entre archivos
   - Identificar qué código va a cada módulo core
   - Documentar dependencias circulares si existen

3. **Crear estructura de carpetas**
   - Crear todas las carpetas core según estructura objetivo
   - No mover archivos aún, solo crear estructura vacía

#### Entregables:
- [x] Branch backup creado ✅
- [x] Mapa de dependencias documentado ✅
- [x] Estructura de carpetas core creada ✅

### Día 2: Extracción de Código RAG ✅ COMPLETADO Y VERIFICADO
**Duración**: 4-5 horas

#### Actividades:
1. **Extraer lógica RAG de chatService.ts**
   - Identificar funciones relacionadas con vector search
   - Crear `VectorSearcher.ts` con código extraído exacto
   - Crear `ContextAugmenter.ts` con lógica de prompt augmentation
   - Crear `RAGPipeline.ts` como orquestador

2. **Actualizar imports**
   - Modificar imports en archivos que usan RAG
   - Mantener mismas interfaces y nombres

#### Archivos afectados:
- `src/services/chatService.ts` (extraer código)
- `src/core/rag/VectorSearcher.ts` (nuevo)
- `src/core/rag/ContextAugmenter.ts` (nuevo)
- `src/core/rag/RAGPipeline.ts` (nuevo)

#### Entregables:
- [x] Módulo RAG extraído y funcionando ✅
- [x] Tests pasando sin cambios ✅
- [x] Imports actualizados ✅

### Día 3: Extracción de Código LLM ✅ COMPLETADO Y VERIFICADO
**Duración**: 3-4 horas

#### Actividades:
1. **Extraer lógica GenAI**
   - Mover `genaiService.ts` a `core/llm/GoogleGenAIProvider.ts`
   - Crear interfaces básicas en `core/llm/interfaces.ts`
   - Mantener misma API pública

2. **Crear StreamingHandler placeholder**
   - Archivo vacío para futuras implementaciones
   - Solo interfaces, sin implementación

#### Archivos afectados:
- `src/services/genaiService.ts` (mover)
- `src/core/llm/GoogleGenAIProvider.ts` (nuevo)
- `src/core/llm/interfaces.ts` (nuevo)
- `src/core/llm/StreamingHandler.ts` (placeholder)

#### Entregables:
- [x] Módulo LLM reorganizado ✅
- [x] Interfaces básicas creadas ✅
- [x] API pública sin cambios ✅

### Día 4: Extracción de Código Chat ✅ COMPLETADO Y VERIFICADO
**Duración**: 4-5 horas

#### Actividades:
1. **Extraer gestión de chats**
   - Identificar funciones de CRUD de chats en chatService
   - Crear `ChatManager.ts` con código extraído exacto
   - Crear `MessageManager.ts` con gestión de mensajes

2. **Crear ConversationOrchestrator**
   - Extraer lógica de orquestación principal
   - Mantener mismos flows y comportamientos

#### Archivos afectados:
- `src/services/chatService.ts` (extraer más código)
- `src/core/chat/ChatManager.ts` (nuevo)
- `src/core/chat/MessageManager.ts` (nuevo)
- `src/core/conversation/ConversationOrchestrator.ts` (nuevo)

#### Entregables:
- [x] Módulos Chat y Conversation extraídos ✅
- [x] Lógica de orquestación mantenida ✅
- [x] Tests funcionando ✅

### Día 5: Creación de Módulos Futuros y Limpieza ✅ COMPLETADO Y VERIFICADO
**Duración**: 3-4 horas

#### Actividades:
1. **Crear módulos placeholder**
   - Crear estructura `core/mcp/` con interfaces vacías
   - Crear estructura `core/voice/` con interfaces vacías
   - Solo preparar para futuro, sin implementación

2. **Actualizar chatService.ts residual**
   - Convertir en thin wrapper que usa módulos core
   - Mantener misma API pública para compatibilidad

3. **Verificación final**
   - Ejecutar todos los tests
   - Verificar que API funciona igual
   - Revisar imports y dependencias

#### Archivos afectados:
- `src/core/mcp/interfaces.ts` (placeholder)
- `src/core/voice/interfaces.ts` (placeholder)
- `src/services/chatService.ts` (convertir a wrapper)

#### Entregables:
- [x] Módulos placeholder creados ✅
- [x] chatService convertido a wrapper ✅
- [x] Sistema funcionando 100% igual ✅

## Criterios de Éxito

### Funcionalidad
- [x] Todos los endpoints API funcionan exactamente igual ✅
- [x] Todos los tests existentes pasan sin modificación ✅
- [x] Performance se mantiene igual o mejor ✅
- [x] No hay breaking changes ✅

### Estructura
- [x] Código organizado según arquitectura objetivo ✅
- [x] Separación clara de responsabilidades ✅
- [x] Módulos independientes y testables ✅
- [x] Preparación para futuras features ✅

### Calidad
- [x] No hay código duplicado ✅
- [x] Imports limpios y organizados ✅
- [x] Estructura consistente entre módulos ✅
- [x] Documentación de estructura actualizada ✅

## Comandos de Verificación

```bash
# Verificar que tests pasan
npm test

# Verificar que builds sin errores
npm run build

# Verificar estructura de archivos
tree src/core

# Verificar que API funciona
curl -X POST http://localhost:8080/chat/test-message
```

## Rollback Plan

Si algo falla:
1. `git checkout backup-before-reorganization`
2. Identificar problema específico
3. Aplicar fix incremental
4. Repetir proceso día por día

---

**Estado**: ✅ COMPLETADO EXITOSAMENTE - Reorganización finalizada
**Tiempo real**: 5 días según cronograma
**Última actualización**: 2025-01-15

## Resumen de Logros

### Arquitectura Implementada
```
src/core/
├── chat/           ✅ ChatManager, MessageManager, interfaces
├── conversation/   ✅ ConversationOrchestrator, PromptBuilder
├── rag/           ✅ RAGPipeline, VectorSearcher
├── llm/           ✅ GoogleGenAIProvider, interfaces, StreamingHandler
├── mcp/           ✅ interfaces (placeholder)
└── voice/         ✅ interfaces (placeholder)
```

### Beneficios Obtenidos
- **Separación de responsabilidades**: Cada módulo tiene función específica
- **Mantenibilidad**: Código organizado y fácil de modificar
- **Extensibilidad**: Preparado para Voice y MCP
- **Testabilidad**: Módulos independientes
- **0 Breaking Changes**: API pública sin modificar

### Próximos Pasos Recomendados
1. **Fase 2 del plan**: Abstracción LLM con interfaces
2. **Implementar streaming**: Usar StreamingHandler
3. **Agregar Voice**: Implementar interfaces de voice
4. **Integrar MCP**: Conectar con servidores MCP por centro

**🎉 REORGANIZACIÓN COMPLETADA EXITOSAMENTE 🎉**