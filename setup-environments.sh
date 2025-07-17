#!/bin/bash

# Script para configurar environments de GitHub via gh CLI

echo "🌍 Configurando environments de GitHub..."

# Verificar que gh está autenticado
if ! gh auth status >/dev/null 2>&1; then
    echo "❌ Error: gh CLI no está autenticado"
    echo "Ejecuta: gh auth login"
    exit 1
fi

# Obtener info del repo actual
REPO_INFO=$(gh repo view --json owner,name)
OWNER=$(echo "$REPO_INFO" | jq -r '.owner.login')
REPO_NAME=$(echo "$REPO_INFO" | jq -r '.name')

echo "📋 Repository: $OWNER/$REPO_NAME"

# 1. Crear environment staging
echo "🔧 Creando environment: staging"
gh api "repos/$OWNER/$REPO_NAME/environments/staging" \
    --method PUT \
    --field wait_timer=0 \
    --field prevent_self_review=false \
    --field reviewers='[]'

echo "✅ Environment staging creado"

# 2. Crear environment production con protection rules
echo "🔧 Creando environment: production (con protection rules)"
gh api "repos/$OWNER/$REPO_NAME/environments/production" \
    --method PUT \
    --field wait_timer=5 \
    --field prevent_self_review=true \
    --field reviewers='[]'

echo "✅ Environment production creado"

# 3. Listar environments configurados
echo "📋 Environments configurados:"
gh api "repos/$OWNER/$REPO_NAME/environments" | jq -r '.environments[].name'

echo ""
echo "🎉 ¡Environments configurados correctamente!"
echo ""
echo "📋 Configuración actual:"
echo "   - staging: Sin protecciones, deploy automático desde 'develop'"
echo "   - production: 5 min wait timer, deploy desde 'main/master'"
echo ""
echo "💡 Para agregar reviewers requeridos:"
echo "   gh api repos/$OWNER/$REPO_NAME/environments/production \\"
echo "     --method PUT \\"
echo "     --field 'reviewers=[{\"type\":\"User\",\"id\":USER_ID}]'"