# GitHub Actions Setup Guide

## Required Secrets

Para que los pipelines de GitHub Actions funcionen correctamente, necesitas configurar los siguientes secrets en tu repositorio:

### 1. GCP_PROJECT_ID
```
Value: backend-developer-446300
```

### 2. GCP_SA_KEY
Clave JSON de la Service Account de Google Cloud con los siguientes permisos:
- Cloud Run Admin
- Artifact Registry Writer
- Cloud Build Editor
- Storage Admin (si necesario)

Para obtener la clave:
```bash
# Crear service account
gcloud iam service-accounts create github-actions-sa \
  --display-name="GitHub Actions Service Account"

# Asignar roles
gcloud projects add-iam-policy-binding backend-developer-446300 \
  --member="serviceAccount:github-actions-sa@backend-developer-446300.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding backend-developer-446300 \
  --member="serviceAccount:github-actions-sa@backend-developer-446300.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding backend-developer-446300 \
  --member="serviceAccount:github-actions-sa@backend-developer-446300.iam.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.editor"

# Generar clave JSON
gcloud iam service-accounts keys create github-actions-key.json \
  --iam-account=github-actions-sa@backend-developer-446300.iam.gserviceaccount.com
```

Luego copia el contenido del archivo `github-actions-key.json` como valor del secret.

## Environments

Configura los siguientes environments en GitHub:

### 1. staging
- Protection rules: Require reviewers (opcional)
- Environment secrets: Ninguno adicional

### 2. production
- Protection rules: Require reviewers
- Required reviewers: Al menos 1
- Environment secrets: Ninguno adicional

## Repository Settings

### 1. Actions Permissions
- General > Actions > Allow all actions and reusable workflows

### 2. Workflow Permissions
- General > Actions > Workflow permissions > Read and write permissions

## Branch Protection Rules

### main/master branch:
- Require pull request reviews
- Require status checks to pass
- Required status checks:
  - Security Scan
  - Code Quality
  - Build Docker Image

### develop branch (opcional):
- Require status checks to pass
- Required status checks:
  - Security Scan
  - Code Quality

## Pipeline Features

### ✅ Implemented:
- **Security scanning**: npm audit
- **Code quality**: TypeScript type checking, build verification
- **Multi-stage builds**: Docker optimization with BuildKit
- **Multi-environment deployment**: staging + production
- **Smoke testing**: Health check endpoints
- **Automated tagging**: Deployment tags
- **Branch-based deployment**: 
  - `develop` → staging
  - `main/master` → production

### 🔄 Ready to enable:
- **Linting**: Scripts already added, need ESLint config
- **Testing**: Scripts already added, need test framework
- **Coverage reporting**: Codecov integration prepared

### 🚀 Advanced features available:
- **Rollback capability**: Previous image tags maintained
- **Blue-green deployment**: Can be configured
- **Monitoring integration**: Ready for alerts setup
- **Performance testing**: Can be added to smoke tests

## Next Steps

1. Configure secrets in GitHub repository settings
2. Create environments (staging, production)
3. Set up branch protection rules
4. Push to trigger first pipeline run
5. Monitor deployment in Google Cloud Console

## Troubleshooting

### Common Issues:

1. **Authentication failed**
   - Verify GCP_SA_KEY is valid JSON
   - Check service account permissions

2. **Image not found**
   - Ensure Artifact Registry repository exists
   - Check image tags and registry configuration

3. **Cloud Run deployment failed**
   - Verify port 8080 is exposed in container
   - Check memory/CPU limits
   - Validate environment variables

### Debug Commands:
```bash
# Check current gcloud config
gcloud config list

# Test service account
gcloud auth activate-service-account --key-file=github-actions-key.json
gcloud projects describe backend-developer-446300

# List Cloud Run services
gcloud run services list --region=us-central1
```