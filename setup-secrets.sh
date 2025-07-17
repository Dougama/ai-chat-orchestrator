#!/bin/bash

# Script para configurar secrets de GitHub Actions via gh CLI

PROJECT_ID="backend-developer-446300"
SA_NAME="github-actions-sa"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
KEY_FILE="github-actions-key.json"

echo "🔧 Configurando secrets para GitHub Actions..."

# Verificar que estamos en el proyecto correcto
CURRENT_PROJECT=$(gcloud config get-value project)
if [ "$CURRENT_PROJECT" != "$PROJECT_ID" ]; then
    echo "❌ Error: Proyecto actual es $CURRENT_PROJECT, esperado $PROJECT_ID"
    echo "Ejecuta: gcloud config set project $PROJECT_ID"
    exit 1
fi

echo "✅ Proyecto verificado: $CURRENT_PROJECT"

# Verificar que gh está autenticado
if ! gh auth status >/dev/null 2>&1; then
    echo "❌ Error: gh CLI no está autenticado"
    echo "Ejecuta: gh auth login"
    exit 1
fi

echo "✅ GitHub CLI autenticado"

# 1. Configurar GCP_PROJECT_ID
echo "📝 Configurando GCP_PROJECT_ID..."
gh secret set GCP_PROJECT_ID --body "$PROJECT_ID"
echo "✅ GCP_PROJECT_ID configurado"

# 2. Verificar si la service account existe
if gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
    echo "✅ Service account ya existe: $SA_EMAIL"
else
    echo "🔧 Creando service account: $SA_EMAIL"
    gcloud iam service-accounts create "$SA_NAME" \
        --display-name="GitHub Actions Service Account" \
        --description="Service account para GitHub Actions CI/CD"
fi

# 3. Asignar roles necesarios
echo "🔑 Asignando roles a la service account..."

ROLES=(
    "roles/run.admin"
    "roles/artifactregistry.writer" 
    "roles/cloudbuild.builds.editor"
    "roles/iam.serviceAccountUser"
)

for ROLE in "${ROLES[@]}"; do
    echo "   Asignando rol: $ROLE"
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$SA_EMAIL" \
        --role="$ROLE" \
        --quiet >/dev/null
done

echo "✅ Roles asignados correctamente"

# 4. Generar nueva clave JSON
echo "🔐 Generando clave JSON..."
if [ -f "$KEY_FILE" ]; then
    echo "⚠️  Eliminando clave anterior..."
    rm "$KEY_FILE"
fi

gcloud iam service-accounts keys create "$KEY_FILE" \
    --iam-account="$SA_EMAIL"

echo "✅ Clave JSON generada: $KEY_FILE"

# 5. Configurar secret GCP_SA_KEY
echo "📝 Configurando GCP_SA_KEY en GitHub..."
gh secret set GCP_SA_KEY < "$KEY_FILE"
echo "✅ GCP_SA_KEY configurado"

# 6. Limpiar archivo de clave local
echo "🧹 Limpiando clave local por seguridad..."
rm "$KEY_FILE"

# 7. Verificar secrets configurados
echo "📋 Secrets configurados:"
gh secret list

echo ""
echo "🎉 ¡Configuración completada!"
echo ""
echo "📋 Próximos pasos:"
echo "1. Crear environments en GitHub:"
echo "   - gh api repos/:owner/:repo/environments/staging -X PUT"
echo "   - gh api repos/:owner/:repo/environments/production -X PUT"
echo ""
echo "2. Configurar branch protection:"
echo "   - gh api repos/:owner/:repo/branches/main/protection -X PUT --input protection-rules.json"
echo ""
echo "3. Hacer push para activar el pipeline:"
echo "   - git push origin main"