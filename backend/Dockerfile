# Cambia la imagen base a una versión estable de Node.js
FROM node:20

# Crear y establecer el directorio de la app
WORKDIR /app

# El build context de este Dockerfile es la RAÍZ del repo (ver
# docker-compose.yml: build.context=. / build.dockerfile=backend/Dockerfile),
# no backend/ — server.js importa @duck-hack/core-api (packages/core-api),
# así que este build necesita ver el workspace completo, no solo backend/.
#
# Copiar manifiestos + packages/ primero para aprovechar el caché de Docker
# (solo se reinstala si cambian dependencias, no en cada cambio de código).
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY packages ./packages

# --workspace=backend instala las deps de backend/ y enlaza los packages/
# internos que consume (ej. @duck-hack/core-api) — no instala ni requiere
# frontend-admin/frontend-user (ni siquiera están copiados en este build).
RUN npm install --workspace=backend --omit=dev

# Copiar el resto del código de backend
COPY backend ./backend

# Crear un usuario no root para ejecutar la aplicación
RUN useradd -m appuser

# Directorio de subidas (logos, fotos de equipo/clientes, imágenes de
# producto) — se crea y se deja con permisos de appuser aquí, en la imagen,
# para que quede correcto desde el primer arranque del volumen que lo monta
# en docker-compose.yml (sin ese volumen, este directorio vive solo en la
# capa escribible del contenedor y se pierde en cada `docker compose up
# --build`, que descarta el contenedor viejo y arranca uno nuevo desde cero).
# Sigue siendo /app/uploads (no /app/backend/uploads): UPLOADS_DIR en
# backend/.env es una ruta absoluta y no cambia con este reacomodo de capas.
RUN mkdir -p /app/uploads && chown -R appuser:appuser /app/uploads

USER appuser

# Exponer el puerto 5000
EXPOSE 5000

WORKDIR /app/backend

# Comando por defecto para iniciar la aplicación
CMD ["node", "server.js"]
