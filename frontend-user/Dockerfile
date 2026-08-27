# ── Fase de construcción ─────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# Instalar dependencias con el lockfile (reproducible).
COPY package.json package-lock.json ./
RUN npm ci

# Copiar el resto y compilar con Vite -> /app/build
COPY . .
RUN npm run build

# ── Fase de producción ───────────────────────────────────────────────
# Imagen nginx sin privilegios: el proceso corre como usuario nginx (uid 101),
# no como root. Escucha en 8080 (ver nginx.conf).
FROM nginxinc/nginx-unprivileged:stable-alpine

COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

# La imagen base ya define USER nginx y el CMD de arranque.
