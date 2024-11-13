# Fase de construcción
FROM node:18 AS build

# Establecer el directorio de la app
WORKDIR /app

# Copiar package.json e instalar dependencias
COPY package*.json ./
RUN npm install

# Copiar los archivos de la app y construir para producción
COPY . .
RUN npm run build

# Fase de producción
FROM nginx:stable-alpine

# Copiar los archivos de construcción generados en /app/build al directorio donde nginx sirve archivos estáticos
COPY --from=build /app/build /usr/share/nginx/html

# Copiar configuración de Nginx
COPY nginx.conf /etc/nginx/nginx.conf

# Exponer el puerto en el que Nginx está escuchando
EXPOSE 80

# Opcional: Configuración de nginx personalizada
# COPY nginx.conf /etc/nginx/nginx.conf

# Comando de inicio (Nginx ya inicia automáticamente en la imagen base)
