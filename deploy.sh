#!/bin/bash
set -e

# ===========================
# Configuración de entorno
# ===========================

EXPECTED_PROJECT="backend-developer-446300"
CURRENT_PROJECT=$(gcloud config get-value project)

if [ "$CURRENT_PROJECT" != "$EXPECTED_PROJECT" ]; then
    echo "❌ Error: Proyecto de gcloud incorrecto. Por favor, ejecuta: gcloud config set project $EXPECTED_PROJECT"
    exit 1
fi

echo "✅ Proyecto verificado: $CURRENT_PROJECT"
PROJECT_ID=$EXPECTED_PROJECT
REGION="us-central1"

# ===========================
# Backend (orchestrator-api)
# ===========================

echo "🚀 Iniciando despliegue del backend..."

# Variables del Backend
BACKEND_SERVICE_NAME="ai-chat-orchestrator"
BACKEND_SOURCE_DIR="."
BACKEND_IMAGE_REPO="us-central1-docker.pkg.dev/$PROJECT_ID/cloud-run-source-deploy"
BACKEND_IMAGE_TAG="$BACKEND_IMAGE_REPO/$BACKEND_SERVICE_NAME:latest"

# ===========================
# Construcción de la imagen
# ===========================

echo "🐳 Construyendo imagen Docker desde $BACKEND_SOURCE_DIR..."

gcloud builds submit \
  --tag "$BACKEND_IMAGE_TAG" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  .

# ===========================
# Despliegue en Cloud Run
# ===========================

echo "☁️ Desplegando el backend en Cloud Run..."

gcloud run deploy "$BACKEND_SERVICE_NAME" \
  --quiet \
  --platform=managed \
  --image="$BACKEND_IMAGE_TAG" \
  --allow-unauthenticated \
  --region="$REGION" \
  --memory=512Mi \
  --min-instances=0 \
  --max-instances=2 \
  --project="$PROJECT_ID"

echo "✅ Backend '$BACKEND_SERVICE_NAME' desplegado con éxito."
echo "🕓 Despliegue completado a las: $(date '+%Y-%m-%d %H:%M:%S')"

exit 0
