# Mapeo de Reorganización - AI Chat Orchestrator

## Análisis de Código Actual

### Archivos Analizados
- `src/services/chatService.ts` (242 líneas)
- `src/services/genaiService.ts` (53 líneas)  
- `src/api/controllers/chatController.ts` (84 líneas)
- `src/lib/process-query.ts` (107 líneas)

## Mapeo de Funciones por Módulo Core

### 📁 core/chat/
**Archivo destino**: `ChatManager.ts`
**Funciones extraídas de chatService.ts**:
- `listUserChats()` (líneas 136-172)
- `deleteUserChat()` (líneas 222-229)
- Funciones helper: `deleteCollection()` (190-197), `deleteQueryBatch()` (199-220)

**Archivo destino**: `MessageManager.ts`
**Funciones extraídas de chatService.ts**:
- `getMessagesForChat()` (líneas 175-188)
- Lógica de guardado de mensajes (líneas 87-92, 114-119)

**Archivo destino**: `interfaces.ts`
**Interfaces extraídas**:
- `ChatRequest` (líneas 8-11, 56-60) - **DUPLICADA, necesita consolidación**

### 📁 core/conversation/
**Archivo destino**: `ConversationOrchestrator.ts`
**Función principal extraída de chatService.ts**:
- `handleChatPrompt()` (líneas 62-131) - **FUNCIÓN PRINCIPAL**

**Archivo destino**: `HistoryManager.ts`
**Lógica extraída de handleChatPrompt**:
- Recuperación de historial (líneas 95-101)
- Gestión de contexto conversacional

**Archivo destino**: `PromptBuilder.ts**
**Función extraída de chatService.ts**:
- `buildAugmentedPrompt()` (líneas 13-54)

### 📁 core/rag/
**Archivo destino**: `VectorSearcher.ts`
**Función movida desde process-query.ts**:
- `searchSimilarEmbeddingsVector()` (líneas 56-106)
- `generateQueryEmbedding()` (líneas 26-46) - función helper

**Archivo destino**: `ContextAugmenter.ts`
**Ya cubierto en PromptBuilder.ts** - considerarlos misma responsabilidad

**Archivo destino**: `RAGPipeline.ts`
**Orquestador que une**:
- VectorSearcher + ContextAugmenter
- Lógica del pipeline RAG (líneas 104-109 en handleChatPrompt)

### 📁 core/llm/
**Archivo destino**: `GoogleGenAIProvider.ts`
**Archivo completo movido**:
- `src/services/genaiService.ts` → se mueve completo
- `getEmbedding()` (líneas 21-35)
- `aiGenerateContent()` (líneas 37-52)

**Archivo destino**: `interfaces.ts`
**Interfaces nuevas a crear**:
- `ILLMProvider` interface
- `EmbeddingProvider` interface
- `GenerationConfig` interface

### 📁 core/mcp/ y core/voice/
**Estado**: Módulos placeholder - solo interfaces vacías

## Dependencias Entre Archivos

### Imports Actuales:
```typescript
// chatService.ts
import { aiGenerateContent } from "./genaiService";
import { searchSimilarEmbeddingsVector } from "../lib/process-query";

// chatController.ts  
import { deleteUserChat, getMessagesForChat, handleChatPrompt, listUserChats } from "../../services/chatService";

// process-query.ts
import { GoogleGenAI } from "@google/genai";
import { RAGResponse, SearchResult, VectorDocument } from "../types";
```

### Nuevos Imports Después de Reorganización:
```typescript
// ConversationOrchestrator.ts
import { ChatManager } from '../chat/ChatManager';
import { MessageManager } from '../chat/MessageManager';
import { RAGPipeline } from '../rag/RAGPipeline';
import { GoogleGenAIProvider } from '../llm/GoogleGenAIProvider';

// RAGPipeline.ts
import { VectorSearcher } from './VectorSearcher';
import { PromptBuilder } from '../conversation/PromptBuilder';

// ChatController.ts
import { ConversationOrchestrator } from '../../core/conversation/ConversationOrchestrator';
import { ChatManager } from '../../core/chat/ChatManager';
```

## Orden de Migración (Sin Dependencias Circulares)

### Día 2: RAG Module
1. **VectorSearcher.ts** (independiente)
2. **PromptBuilder.ts** (independiente)  
3. **RAGPipeline.ts** (depende de VectorSearcher)

### Día 3: LLM Module
1. **GoogleGenAIProvider.ts** (independiente - mover genaiService.ts)
2. **interfaces.ts** (independiente)

### Día 4: Chat Module
1. **MessageManager.ts** (independiente)
2. **ChatManager.ts** (independiente)
3. **ConversationOrchestrator.ts** (depende de todos los anteriores)

### Día 5: Controllers y Cleanup
1. Actualizar imports en **chatController.ts**
2. Convertir **chatService.ts** en wrapper
3. Verificación final

## Problemas Identificados

### 1. Interface Duplicada
```typescript
// Línea 8-11
interface ChatRequest {
  prompt: string;
  chatId?: string;
}

// Línea 56-60  
interface ChatRequest {
  prompt: string;
  history: ChatMessage[];
  chatId?: string;
}
```
**Solución**: Consolidar en `core/chat/interfaces.ts`

### 2. Configuración Hardcodeada
```typescript
// process-query.ts línea 19
const db = new Firestore({
  projectId: "backend-developer-446300", // ❌ HARDCODED
});
```
**Solución**: Usar variable de entorno en nueva estructura

### 3. Lógica Mezclada en handleChatPrompt
La función hace demasiadas cosas:
- Gestión de chat (crear/obtener)
- Gestión de mensajes (guardar)
- Pipeline RAG (buscar + augmentar)
- Generación LLM
- Actualización timestamps

**Solución**: Separar en ConversationOrchestrator que coordina módulos especializados

## Archivos que NO SE TOCAN

### Mantener estructura actual:
- `src/api/routes/chatRoutes.ts`
- `src/config/preload.ts`
- `src/index.ts`
- `src/types/` (todo el directorio)

### Modificaciones mínimas:
- `src/api/controllers/chatController.ts` - solo cambiar imports
- `src/services/chatService.ts` - convertir a wrapper delgado

## Criterios de Validación

### Tests que deben pasar:
```bash
# Verificar funcionalidad actual
npm test

# Verificar build
npm run build

# Verificar estructura
tree src/core
```

### Endpoints que deben funcionar igual:
- `POST /chat/:chatId?` 
- `GET /chat/user/:userId`
- `GET /chat/:chatId/messages`
- `DELETE /chat/:chatId`

---

**Estado**: ANÁLISIS COMPLETADO ✅
**Problemas identificados**: 3 (documentados arriba)
**Riesgo**: BAJO - separación clara sin dependencias circulares
**Siguiente paso**: Proceder con Día 2 (RAG Module)