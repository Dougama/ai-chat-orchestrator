# AI Chat Orchestrator

API REST independiente que orquesta conversaciones de chat con RAG (Retrieval-Augmented Generation) para operarios logísticos.

## Descripción

Este servicio proporciona una API REST para gestionar conversaciones de chat inteligentes que utilizan documentos indexados para proporcionar respuestas contextualmente relevantes a operarios de logística.

## Arquitectura

- **API**: Express.js REST API
- **Storage**: Firestore para chats y mensajes
- **Vector Search**: Firestore Vector Search para consultas semánticas
- **AI Model**: Google GenAI Gemini 2.0 Flash

## Configuración

### Variables de Entorno Requeridas

```bash
GCP_PROJECT_ID=backend-developer-446300
GCP_LOCATION=us-central1
GEMINI_API_KEY=your-api-key
PORT=8080
```

### Dependencias

- Express.js
- Google Cloud Firestore
- Google GenAI
- CORS support

## Instalación

```bash
npm install
```

## Desarrollo Local

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Producción

```bash
npm start
```

## API Endpoints

### Health Check
```
GET /health
```
Verifica el estado del servicio.

### Chat Management

#### Enviar Mensaje
```
POST /chat/:chatId?
Content-Type: application/json

{
  "prompt": "¿Cómo optimizo mi ruta de entrega?",
  "history": []
}
```

#### Obtener Chats del Usuario
```
GET /chat/user/:userId?lastSeen=timestamp
```

#### Obtener Mensajes del Chat
```
GET /chat/:chatId/messages
```

#### Eliminar Chat
```
DELETE /chat/:chatId
```

## Funcionalidades

### Sistema RAG
- ✅ Búsqueda semántica en documentos indexados
- ✅ Generación de respuestas contextuales
- ✅ Historial de conversación persistente
- ✅ Prompt engineering para operarios logísticos

### Gestión de Chat
- ✅ Creación automática de nuevos chats
- ✅ Persistencia de mensajes en Firestore
- ✅ Paginación cursor-based
- ✅ Eliminación de chats completos

### Optimizaciones
- Respuestas adaptadas a operarios con lenguaje sencillo
- Contexto específico de procesos logísticos
- Manejo robusto de errores
- Logging detallado

## Estructura del Proyecto

```
src/
├── api/
│   ├── controllers/          # Controladores de endpoints
│   └── routes/              # Definición de rutas
├── services/                # Lógica de negocio
├── lib/                     # Utilidades y helpers
├── types/                   # Definiciones de tipos
└── config/                  # Configuración
```

## Tipos Incluidos

El proyecto incluye todos los tipos necesarios en `src/types/`:
- `ChatMessage`: Estructura de mensajes
- `VectorDocument`: Documentos indexados
- `SearchResult`: Resultados de búsqueda
- `RAGResponse`: Respuestas de RAG

## Monitoreo

### Logs de Desarrollo
```bash
npm run dev
```

### Logs de Producción
```bash
# Con PM2
pm2 logs ai-chat-orchestrator

# Con Docker
docker logs container-name
```

## Troubleshooting

### Errores Comunes

**Error de conexión a Firestore:**
- Verificar permisos de Google Cloud
- Confirmar PROJECT_ID correcto
- Revisar configuración de credenciales

**Error de GenAI:**
- Verificar GEMINI_API_KEY válida
- Confirmar cuotas de API
- Revisar logs de límites de rate

**Chat no se crea:**
- Verificar estructura de request
- Confirmar permisos de escritura en Firestore
- Revisar logs del servicio

## Deploy

### Cloud Run
```bash
gcloud run deploy ai-chat-orchestrator \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

### App Engine
```bash
gcloud app deploy
```

## Próximos Pasos

- [ ] Implementar autenticación de usuarios
- [ ] Agregar métricas de uso
- [ ] Implementar rate limiting
- [ ] Agregar tests unitarios e integración