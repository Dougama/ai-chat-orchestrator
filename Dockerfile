# Etapa 1: Build
FROM node:20-slim AS builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production && npm cache clean --force

# Copiar código fuente
COPY . .

# Construir el proyecto
RUN npm run build

# Etapa 2: Producción
FROM node:20-slim

WORKDIR /app

# Crear usuario no root
RUN useradd --create-home --shell /bin/bash app

# Copiar archivos necesarios desde la etapa anterior
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Cambiar propietario de archivos
RUN chown -R app:app /app
USER app

EXPOSE 8080
CMD ["node", "dist/index.js"]
