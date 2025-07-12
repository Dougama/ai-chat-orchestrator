# Etapa 1: Build
FROM node:18-slim AS builder

RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copiar archivos de raíz del monorepo
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./

# Copiar todos los paquetes
COPY packages ./packages

# Instalar solo el paquete objetivo y sus dependencias
RUN pnpm install --frozen-lockfile --filter ./packages/orchestrator-api...

# Construir el proyecto
WORKDIR /app/packages/orchestrator-api
RUN pnpm build

# Etapa 2: Producción
FROM node:18-slim

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copiar archivos necesarios desde la etapa anterior
COPY --from=builder /app/packages/orchestrator-api/dist ./dist
COPY --from=builder /app/packages/orchestrator-api/package.json ./
COPY --from=builder /app/packages/orchestrator-api/node_modules ./node_modules

EXPOSE 3000
CMD ["node", "dist/index.js"]
